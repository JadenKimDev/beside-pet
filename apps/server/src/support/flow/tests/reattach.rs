// 다시 붙기(ADR-0030): 도는 턴에 붙으면 지금까지 모은 글이 첫 `token` 으로 오고 이어서 나머지와 `done` 이 온다.
// 끝난 턴에 붙으면 답 전체와 `done` 이다. 실패했거나 중단된 턴은 409 "Turn is not active" 다.

use super::doubles::{
    ENGAGED, Harness, REPLY_CHUNKS, ReplyFault, SESSION_ID, ScriptedModel, collect, message_with,
    next_event, other, owner, reply_text,
};
use crate::shared::ApiError;
use crate::support::response::{ActiveTurnResponse, ActiveTurnStatus};
use crate::support::{StreamEvent, SupportService};

const TURN_ID: &str = "5d2f8a1c-3e7b-4c90-b1a6-7f0e4d9c2b38";

fn not_active() -> ApiError {
    ApiError::Conflict("Turn is not active".to_owned())
}

fn token(text: &str) -> Result<StreamEvent, ApiError> {
    Ok(StreamEvent::Token {
        text: text.to_owned(),
    })
}

#[tokio::test]
async fn 흐르는_턴에_다시_붙으면_모은_글_이어지는_조각_done_이_온다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    next_event(&mut events).await;
    assert_eq!(next_event(&mut events).await, Some(token(REPLY_CHUNKS[0])));
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    assert_eq!(
        state.active_turn,
        Some(ActiveTurnResponse {
            turn_id: TURN_ID.to_owned(),
            status: ActiveTurnStatus::Streaming,
        })
    );

    let mut attached = h
        .flow
        .turn_stream(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned());
    assert!(matches!(
        next_event(&mut attached).await,
        Some(Ok(StreamEvent::Meta { .. }))
    ));
    assert_eq!(next_event(&mut attached).await, Some(token(REPLY_CHUNKS[0])));
    h.model.pace().add_permits(16);
    let rest = collect(attached).await;

    assert_eq!(rest[..2], [token(REPLY_CHUNKS[1]), token(REPLY_CHUNKS[2])]);
    let Some(Ok(StreamEvent::Done { result })) = rest.get(2) else {
        panic!("done follows the chunks: {rest:?}");
    };
    assert_eq!(result.reply, reply_text());
    assert_eq!(rest.len(), 3);
    let sent = collect(events).await;
    assert!(
        matches!(sent.last(), Some(Ok(StreamEvent::Done { .. }))),
        "{sent:?}"
    );
}

#[tokio::test]
async fn 끝난_턴에_붙으면_meta_답_전체_done_이다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await
        .unwrap();

    let events = collect(
        h.flow
            .turn_stream(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;

    assert_eq!(events.len(), 3, "{events:?}");
    assert!(matches!(events[0], Ok(StreamEvent::Meta { .. })));
    assert_eq!(events[1], token(&reply_text()));
    let Ok(StreamEvent::Done { result }) = &events[2] else {
        panic!("{events:?}");
    };
    assert_eq!(result.reply, reply_text());
}

#[tokio::test]
async fn 실패한_턴과_중단된_턴에는_붙지_못한다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    h.model.break_replies(ReplyFault::Provider);
    let failed_id = "2a7c9e1b-4d6f-4083-b5a2-c1e8f3d7b940";
    let _ = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, failed_id))
        .await;
    h.model.mend_replies();
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    next_event(&mut events).await;
    next_event(&mut events).await;
    h.flow
        .cancel_turn(&owner(), SESSION_ID, TURN_ID)
        .await
        .unwrap();
    collect(events).await;

    for id in [failed_id, TURN_ID] {
        let refused = collect(
            h.flow
                .turn_stream(owner(), SESSION_ID.to_owned(), id.to_owned()),
        )
        .await;
        assert_eq!(refused, vec![Err(not_active())], "{id}");
    }
}

#[tokio::test]
async fn 없는_턴은_404_이고_남의_세션은_403_이다() {
    let h = Harness::new();
    h.onboard().await;

    let missing = collect(
        h.flow
            .turn_stream(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;
    assert_eq!(
        missing,
        vec![Err(ApiError::NotFound(format!("Turn not found: {TURN_ID}")))]
    );
    let foreign = collect(
        h.flow
            .turn_stream(other(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;
    assert!(matches!(foreign.as_slice(), [Err(ApiError::Forbidden(_))]));
}

// 답 다시 받기(ADR-0030): 실패한 턴의 답만 다시 만든다. 같은 사용자 메시지로 위기 판정과 전이를 다시 계산하고 `done` 에 닿으며
// 사용자 행은 하나뿐이다. 실패한 턴이 아니면 409 "Turn is not failed" 다. 서버가 혼자 다시 돌지는 않는다.

use super::doubles::{
    ENGAGED, Harness, ReplyFault, SESSION_ID, collect, message_with, other, owner, reply_text,
};
use crate::shared::ApiError;
use crate::support::response::FailedTurnResponse;
use crate::support::session::TurnStatus;
use crate::support::{MessageRole, StreamEvent, SupportService};

const TURN_ID: &str = "9f4a2c7e-1b5d-4e38-a0c6-3d8b1f7e2a59";

fn not_failed() -> ApiError {
    ApiError::Conflict("Turn is not failed".to_owned())
}

/// 진솔한 답 둘 뒤 세 번째(과제 2 로 넘어갈 턴)를 실패시킨다.
async fn failed_third_turn(h: &Harness) {
    h.onboard().await;
    h.say(ENGAGED).await;
    h.say(ENGAGED).await;
    h.model.break_replies(ReplyFault::Provider);
    let refused = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await;
    assert_eq!(refused, Err(ApiError::Internal));
    h.model.mend_replies();
}

#[tokio::test]
async fn 실패한_턴을_다시_받으면_답이_오고_사용자_행은_하나이며_전이는_처음과_같다() {
    let h = Harness::new();
    failed_third_turn(&h).await;
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    assert_eq!(
        state.failed_turn,
        Some(FailedTurnResponse {
            turn_id: TURN_ID.to_owned()
        })
    );
    let risks = h.model.risk_calls();

    let events = collect(
        h.flow
            .retry_turn(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;

    assert_eq!(
        events.first(),
        Some(&Ok(StreamEvent::Meta {
            task: 2,
            progress: 0.25,
            support_level: 1,
            done: false,
        })),
        "the same transition as the first try would have made"
    );
    let Some(Ok(StreamEvent::Done { result })) = events.last() else {
        panic!("{events:?}");
    };
    assert_eq!(result.reply, reply_text());
    assert_eq!(h.model.risk_calls(), risks + 1, "the risk check runs again");
    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(turn.error_kind, None);
    let rows: Vec<MessageRole> = saved
        .history
        .iter()
        .filter(|m| m.turn_id.as_deref() == Some(TURN_ID))
        .map(|m| m.role)
        .collect();
    assert_eq!(rows, vec![MessageRole::User, MessageRole::Assistant]);
    assert_eq!(saved.task.number(), 2);
    assert_eq!(saved.analyses.len(), 3);
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    assert_eq!((state.active_turn, state.failed_turn), (None, None));
}

#[tokio::test]
async fn 다시_받기가_또_실패하면_턴은_다시_실패로_남는다() {
    let h = Harness::new();
    failed_third_turn(&h).await;
    h.model.break_replies(ReplyFault::Provider);

    let events = collect(
        h.flow
            .retry_turn(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;

    assert_eq!(events.last(), Some(&Err(ApiError::Internal)));
    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    let users = saved
        .history
        .iter()
        .filter(|m| m.turn_id.as_deref() == Some(TURN_ID))
        .count();
    assert_eq!(users, 1);
}

#[tokio::test]
async fn 실패하지_않은_턴은_다시_받을_수_없다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await
        .unwrap();
    let replies = h.model.reply_calls();

    let refused = collect(
        h.flow
            .retry_turn(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;

    assert_eq!(refused, vec![Err(not_failed())]);
    assert_eq!(h.model.reply_calls(), replies);
}

#[tokio::test]
async fn 없는_턴은_404_이고_남의_세션은_403_이다() {
    let h = Harness::new();
    failed_third_turn(&h).await;

    let missing = collect(h.flow.retry_turn(
        owner(),
        SESSION_ID.to_owned(),
        "no-such-turn".to_owned(),
    ))
    .await;
    assert_eq!(
        missing,
        vec![Err(ApiError::NotFound(
            "Turn not found: no-such-turn".to_owned()
        ))]
    );
    let foreign = collect(
        h.flow
            .retry_turn(other(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;
    assert!(matches!(foreign.as_slice(), [Err(ApiError::Forbidden(_))]));
}

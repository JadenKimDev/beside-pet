// 스트림 턴: 첫 이벤트는 meta, 마지막은 done, 토큰을 이어 붙이면 답이다. 도중 실패는 done 없이 끊고, 받은 사용자 메시지는 실패한 턴으로 남긴다(ADR-0028).

use super::doubles::{
    ENGAGED, Harness, SESSION_ID, ScriptedModel, collect, joined_tokens, message, onboarding, owner,
    reply_text,
};
use crate::shared::ApiError;
use crate::support::session::{TurnErrorKind, TurnStatus};
use crate::support::{MessageRole, StreamEvent, SupportService};

fn assert_meta_tokens_done(
    events: &[Result<StreamEvent, ApiError>],
) -> crate::support::TurnResponse {
    assert!(
        matches!(events.first(), Some(Ok(StreamEvent::Meta { .. }))),
        "{events:?}"
    );
    assert!(
        events[1..events.len() - 1]
            .iter()
            .all(|event| matches!(event, Ok(StreamEvent::Token { .. }))),
        "{events:?}"
    );
    let Some(Ok(StreamEvent::Done { result })) = events.last() else {
        panic!("the last event is done: {events:?}");
    };
    assert_eq!(joined_tokens(events), result.reply);
    result.clone()
}

#[tokio::test]
async fn 시작_스트림은_meta_토큰_done_순서이고_인사를_저장한다() {
    let h = Harness::new();

    let events = collect(h.flow.start_stream(owner(), onboarding(SESSION_ID))).await;

    let result = assert_meta_tokens_done(&events);
    assert_eq!(result.reply, reply_text());
    assert_eq!((result.task, result.progress, result.done), (1, 0.0, false));
    let Some(Ok(StreamEvent::Meta { task, progress, .. })) = events.first() else {
        unreachable!()
    };
    assert_eq!((*task, *progress), (1, 0.0));
    let saved = h.sessions.last_save();
    assert_eq!(saved.history.len(), 1);
    assert_eq!(saved.history[0].text, reply_text());
}

#[tokio::test]
async fn 보내기_스트림은_meta_토큰_done_순서이고_턴을_저장한다() {
    let h = Harness::new();
    h.onboard().await;

    let events = collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;

    let result = assert_meta_tokens_done(&events);
    assert_eq!(events.len(), 2 + 3, "meta, three tokens, done");
    assert_eq!(result.reply, reply_text());
    let saved = h.sessions.last_save();
    let last = saved.history.last().unwrap();
    assert_eq!(
        (last.role, last.text.clone()),
        (MessageRole::Assistant, reply_text())
    );
    assert_eq!(saved.analyses.len(), 1);
}

#[tokio::test]
async fn 스트림이_도중에_실패하면_done_없이_끊고_사용자_메시지와_실패한_턴을_저장한다() {
    let h = Harness::with_model(ScriptedModel::failing_stream());
    h.onboard().await;
    let saves_before = h.sessions.saves().len();

    let events = collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;

    assert!(matches!(events.first(), Some(Ok(StreamEvent::Meta { .. }))));
    assert_eq!(events.last(), Some(&Err(ApiError::Internal)));
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Ok(StreamEvent::Done { .. })))
    );
    assert_eq!(
        h.sessions.saves().len(),
        saves_before + 2,
        "saved on receipt and on failure"
    );
    let saved = h.sessions.last_save();
    let last = saved.history.last().unwrap();
    assert_eq!((last.role, last.text.as_str()), (MessageRole::User, ENGAGED));
    let turn = saved.turns.last().unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Provider));
    assert!(saved.analyses.is_empty(), "a failed turn leaves no analysis");
}

#[tokio::test]
async fn 없는_세션의_스트림은_첫_항목이_404_다() {
    let h = Harness::new();

    let events = collect(
        h.flow
            .send_stream(owner(), "nope".to_owned(), message(ENGAGED)),
    )
    .await;

    assert_eq!(
        events,
        vec![Err(ApiError::NotFound(
            "Session not found: nope".to_owned()
        ))]
    );
}

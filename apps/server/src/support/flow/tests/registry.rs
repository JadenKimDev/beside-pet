// 진행 중 턴 등록부에 오르는 턴(ADR-0030): 받은 사용자 턴은 답이 끝날 때까지 등록부에 있고 `pending` → `streaming` 을 저장한다.
// 같은 턴 id 가 동시에 오면 둘째는 409 "Turn already received" 다. 위기 턴과 첫 인사는 오르지 않는다.

use super::doubles::{
    ENGAGED, Harness, KEYWORD_CRISIS, SESSION_ID, ScriptedModel, collect, message_with,
    next_event, owner,
};
use crate::shared::ApiError;
use crate::support::session::TurnStatus;
use crate::support::{StreamEvent, SupportService};

const TURN_ID: &str = "6b3e9d1f-2a8c-4f57-91e4-0c7a5d2b8f36";

#[tokio::test]
async fn 답이_흐르기_시작하면_턴을_streaming_으로_저장한다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    next_event(&mut events).await;
    next_event(&mut events).await;

    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Streaming);

    h.model.pace().add_permits(16);
    let rest = collect(events).await;
    assert!(matches!(rest.last(), Some(Ok(StreamEvent::Done { .. }))));
    let done = h.sessions.last_save();
    let turn = done.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Done);
}

#[tokio::test]
async fn 같은_턴_id_가_동시에_오면_둘째는_409_다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let gate = h.sessions.hold_saves();
    let mut first = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    // 첫째가 받기 저장에서 멈춘 동안(아직 저장소에 없다) 둘째가 온다.
    let early =
        tokio::time::timeout(std::time::Duration::from_millis(100), next_event(&mut first)).await;
    assert!(early.is_err(), "the first turn waits on its receipt");

    let second = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        h.flow
            .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID)),
    )
    .await
    .expect("the second turn is refused without waiting");

    assert_eq!(
        second,
        Err(ApiError::Conflict("Turn already received".to_owned()))
    );
    gate.add_permits(64);
    h.model.pace().add_permits(16);
    let rest = collect(first).await;
    assert!(matches!(rest.last(), Some(Ok(StreamEvent::Done { .. }))));
    let saved = h.sessions.last_save();
    let users = saved
        .history
        .iter()
        .filter(|m| m.turn_id.as_deref() == Some(TURN_ID))
        .count();
    assert_eq!(users, 2, "one user row and one reply");
}

#[tokio::test]
async fn 위기_턴은_등록부에_오르지_않고_받자마자_끝난다() {
    let h = Harness::new();
    h.onboard().await;

    let events = collect(h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(KEYWORD_CRISIS, TURN_ID),
    ))
    .await;

    assert!(matches!(events.last(), Some(Ok(StreamEvent::Done { .. }))));
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    assert_eq!(state.active_turn, None);
    let turns = h.sessions.last_save().turns;
    assert!(
        turns
            .iter()
            .all(|t| t.status != TurnStatus::Streaming && t.status != TurnStatus::Pending)
    );
}

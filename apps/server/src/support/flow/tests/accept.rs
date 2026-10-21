// 받자마자 저장(ADR-0028): 사용자 턴은 답보다 먼저 `pending` 으로 저장하고 그 뒤에 `meta` 를 낸다. 답이 실패해도
// 사용자 메시지는 `failed` 턴으로 남고 과제·지원 수준은 그대로다. 턴 id 는 멱등 키라 같은 세션의 같은 id 는 409 다.

use std::time::Duration;

use futures_util::StreamExt;

use super::doubles::{
    DUNNO, ENGAGED, Harness, KEYWORD_CRISIS, ReplyFault, SESSION_ID, collect, message,
    message_with, owner, reply_text,
};
use crate::llm::{CallErrorKind, CallPurpose};
use crate::safety::crisis_reply;
use crate::shared::ApiError;
use crate::support::rules::{SupportLevel, Task};
use crate::support::session::{TurnErrorKind, TurnStatus};
use crate::support::{MessageRole, StreamEvent, SupportService};

const TURN_ID: &str = "0b6f3c1e-8d2a-4f57-9c3b-5e1d7a9f2c40";
const OTHER_TURN_ID: &str = "7a2d9e4b-1c6f-4a38-b5e0-3f8c2d1a6b97";

fn already_received() -> ApiError {
    ApiError::Conflict("Turn already received".to_owned())
}

#[tokio::test]
async fn 발화가_실패하면_사용자_메시지와_실패한_턴이_남고_과제와_지원_수준은_그대로다() {
    let h = Harness::new();
    h.onboard().await;
    let before = h.sessions.last_save();
    let saves_before = h.sessions.saves().len();
    h.model.break_replies(ReplyFault::Provider);

    let refused = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await;

    assert_eq!(refused, Err(ApiError::Internal));
    assert_eq!(
        h.sessions.saves().len(),
        saves_before + 3,
        "on receipt, when the reply starts, and on failure"
    );
    let saved = h.sessions.last_save();
    let last = saved.history.last().unwrap();
    assert_eq!(
        (last.role, last.text.as_str()),
        (MessageRole::User, ENGAGED)
    );
    assert_eq!(last.turn_id.as_deref(), Some(TURN_ID));
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Provider));
    assert_eq!(
        h.call_errors(CallPurpose::Reply),
        vec![CallErrorKind::Provider]
    );
    assert!(turn.finished_at.is_some());
    assert_eq!(saved.task, before.task);
    assert_eq!(saved.retry_count, before.retry_count);
    assert_eq!(saved.support_level, before.support_level);
    assert!(!saved.closed);
    assert!(saved.analyses.is_empty());

    let history = h.flow.history(&owner(), SESSION_ID).await.unwrap();
    let shown = history.last().unwrap();
    assert_eq!(
        (shown.role, shown.text.as_str(), shown.turn_id.as_deref()),
        (MessageRole::User, ENGAGED, Some(TURN_ID)),
        "the user's words show without a reply"
    );
}

#[tokio::test]
async fn 발화가_시간_제한을_넘기면_시간_제한으로_적는다() {
    let h = Harness::new();
    h.onboard().await;
    h.model.break_replies(ReplyFault::Hang);

    let refused = tokio::time::timeout(
        Duration::from_secs(2),
        h.flow
            .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID)),
    )
    .await
    .expect("the call returns within its limit");

    assert_eq!(refused, Err(ApiError::ModelTimeout));
    assert_eq!(
        h.call_errors(CallPurpose::Reply),
        vec![CallErrorKind::Timeout]
    );
    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Timeout));
    assert_eq!(saved.history.last().unwrap().text, ENGAGED);
}

#[tokio::test]
async fn 실패한_턴은_과제를_넘기지_않고_깊이에도_세지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(DUNNO).await;
    h.model.break_replies(ReplyFault::Provider);
    let _ = h.flow.send(&owner(), SESSION_ID, message(DUNNO)).await;
    let failed = h.sessions.last_save();
    assert_eq!(failed.task, Task::FIRST, "a failed turn does not advance");
    assert_eq!(failed.retry_count, 1);

    // 비몰입 두 번이면 넘어간다. 실패한 턴은 세지 않으므로 다음 비몰입이 두 번째다.
    h.model.mend_replies();
    let next = h.say(DUNNO).await;
    assert_eq!(next.task, 2);
}

#[tokio::test]
async fn 같은_턴_id_가_다시_오면_409_이고_메시지는_하나다() {
    let h = Harness::new();
    h.onboard().await;

    let first = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await
        .unwrap();
    let risks = h.model.risk_calls();
    let replies = h.model.reply_calls();
    let saves = h.sessions.saves().len();
    let again = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await;

    assert_eq!(first.reply, reply_text());
    assert_eq!(again, Err(already_received()));
    assert_eq!(h.model.risk_calls(), risks, "no risk check for a duplicate");
    assert_eq!(h.model.reply_calls(), replies);
    assert_eq!(h.sessions.saves().len(), saves, "nothing is written");
    let saved = h.sessions.last_save();
    let users: Vec<_> = saved
        .history
        .iter()
        .filter(|m| m.turn_id.as_deref() == Some(TURN_ID) && m.role == MessageRole::User)
        .collect();
    assert_eq!(users.len(), 1);

    // 스트림도 같다: 첫 항목이 409 다.
    let events = collect(h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    ))
    .await;
    assert_eq!(events, vec![Err(already_received())]);

    // 다른 id 는 새 턴이다.
    h.flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, OTHER_TURN_ID))
        .await
        .unwrap();
}

#[tokio::test]
async fn 실패한_턴의_id_로_다시_보내도_409_다() {
    let h = Harness::new();
    h.onboard().await;
    h.model.break_replies(ReplyFault::Provider);
    let _ = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await;

    let again = h
        .flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await;

    assert_eq!(again, Err(already_received()));
}

#[tokio::test]
async fn 위기로_닫힌_세션에_같은_턴_id_가_다시_오면_받았다는_409_다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .send(&owner(), SESSION_ID, message_with(KEYWORD_CRISIS, TURN_ID))
        .await
        .unwrap();

    let again = h
        .flow
        .send(&owner(), SESSION_ID, message_with(KEYWORD_CRISIS, TURN_ID))
        .await;

    assert_eq!(again, Err(already_received()));
}

#[tokio::test]
async fn 턴_id_없이_보내면_서버가_uuid_를_만든다() {
    let h = Harness::new();
    h.onboard().await;

    h.say(ENGAGED).await;
    h.say(ENGAGED).await;

    let saved = h.sessions.last_save();
    let ids: Vec<&str> = saved
        .history
        .iter()
        .filter(|m| m.role == MessageRole::User)
        .map(|m| m.turn_id.as_deref().expect("every user message has a turn"))
        .collect();
    assert_eq!(ids.len(), 2);
    assert_ne!(ids[0], ids[1]);
    for id in &ids {
        let parsed = uuid::Uuid::parse_str(id).expect("a UUID");
        assert_eq!(parsed.get_version_num(), 4);
        let turn = saved.turns.iter().find(|t| t.id == *id).unwrap();
        assert_eq!(turn.status, TurnStatus::Done);
    }
    // 답도 같은 턴에 속한다.
    let replies: Vec<&str> = saved
        .history
        .iter()
        .skip(1)
        .filter(|m| m.role == MessageRole::Assistant)
        .filter_map(|m| m.turn_id.as_deref())
        .collect();
    assert_eq!(replies, ids);
}

#[tokio::test]
async fn 위기_턴은_받자마자_닫히고_고정_문구와_함께_한_번_저장된다() {
    let h = Harness::new();
    h.onboard().await;
    let saves = h.sessions.saves().len();
    let replies = h.model.reply_calls();

    let turn = h
        .flow
        .send(&owner(), SESSION_ID, message_with(KEYWORD_CRISIS, TURN_ID))
        .await
        .unwrap();

    assert_eq!(turn.reply, crisis_reply("en"));
    assert!(turn.done);
    assert_eq!(h.model.reply_calls(), replies);
    assert_eq!(h.sessions.saves().len(), saves + 1);
    let saved = h.sessions.last_save();
    assert!(saved.closed);
    assert_eq!(saved.support_level, SupportLevel::Crisis);
    let tail: Vec<(MessageRole, &str, Option<&str>)> = saved
        .history
        .iter()
        .rev()
        .take(2)
        .rev()
        .map(|m| (m.role, m.text.as_str(), m.turn_id.as_deref()))
        .collect();
    assert_eq!(
        tail,
        vec![
            (MessageRole::User, KEYWORD_CRISIS, Some(TURN_ID)),
            (MessageRole::Assistant, crisis_reply("en"), Some(TURN_ID)),
        ]
    );
    let crisis = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(crisis.status, TurnStatus::Done);
}

#[tokio::test]
async fn meta_는_사용자_턴을_저장한_뒤에_나간다() {
    let h = Harness::new();
    h.onboard().await;
    let saves = h.sessions.saves().len();
    let gate = h.sessions.hold_saves();

    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );

    let early = tokio::time::timeout(Duration::from_millis(150), events.next()).await;
    assert!(
        early.is_err(),
        "nothing goes out while the receipt is unsaved: {early:?}"
    );
    assert_eq!(h.sessions.saves().len(), saves);

    gate.add_permits(1);
    let first = tokio::time::timeout(Duration::from_secs(2), events.next())
        .await
        .expect("meta follows the save");
    assert!(
        matches!(first, Some(Ok(StreamEvent::Meta { .. }))),
        "{first:?}"
    );
    let receipt = &h.sessions.saves()[saves];
    let pending = receipt.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(pending.status, TurnStatus::Pending);
    assert_eq!(receipt.history.last().unwrap().text, ENGAGED);
    assert!(receipt.analyses.is_empty());

    gate.add_permits(16);
    let rest = collect(events).await;
    assert!(
        matches!(rest.last(), Some(Ok(StreamEvent::Done { .. }))),
        "{rest:?}"
    );
}

#[tokio::test]
async fn meta_는_이번_턴의_전이_결과를_싣는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;
    h.say(ENGAGED).await;

    // 세 번째 진솔한 답에서 과제 2 로 넘어간다. 받은 직후의 세션은 아직 과제 1 이다.
    let events = collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;

    assert_eq!(
        events.first(),
        Some(&Ok(StreamEvent::Meta {
            task: 2,
            progress: 0.25,
            support_level: 1,
            done: false,
        }))
    );
}

#[tokio::test]
async fn 첫_인사도_턴_하나다() {
    let h = Harness::new();
    h.onboard().await;

    let saved = h.sessions.last_save();
    assert_eq!(saved.turns.len(), 1);
    let greeting = &saved.turns[0];
    assert_eq!(greeting.status, TurnStatus::Done);
    assert_eq!(saved.history.len(), 1);
    assert_eq!(saved.history[0].role, MessageRole::Assistant);
    assert_eq!(
        saved.history[0].turn_id.as_deref(),
        Some(greeting.id.as_str())
    );
    uuid::Uuid::parse_str(&greeting.id).expect("a UUID");

    let history = h.flow.history(&owner(), SESSION_ID).await.unwrap();
    assert_eq!(history[0].turn_id.as_deref(), Some(greeting.id.as_str()));
}

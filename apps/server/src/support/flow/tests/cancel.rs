// 중단(ADR-0030): 도는 턴을 멈추면 그 턴은 `cancelled` 이고 사용자 말과 거기까지 온 답은 저장되되 기록과 다음 프롬프트에서 숨는다.
// 세션의 과제와 지원 수준은 그대로다. 위기 턴과 끝난 턴은 중단할 수 없다(409). 중단은 멱등이다.

use std::time::Duration;

use super::doubles::{
    DUNNO, ENGAGED, Harness, KEYWORD_CRISIS, REPLY_CHUNKS, ReplyFault, SESSION_ID, ScriptedModel,
    collect, message_with, next_event, other, owner,
};
use crate::shared::ApiError;
use crate::support::response::CancelledTurnResponse;
use crate::support::session::TurnStatus;
use crate::support::{MessageRole, StreamEvent, SupportService};

const TURN_ID: &str = "3c9e1a7f-5b2d-4e80-a6f1-9d4c2b7e0a15";

fn finished() -> ApiError {
    ApiError::Conflict("Turn already finished".to_owned())
}

/// 첫 조각까지 흐른 스트림 턴(나머지 조각은 문이 막는다).
async fn streaming(h: &Harness) -> crate::support::TurnStream {
    let mut events = h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message_with(ENGAGED, TURN_ID),
    );
    assert!(matches!(
        next_event(&mut events).await,
        Some(Ok(StreamEvent::Meta { .. }))
    ));
    assert_eq!(
        next_event(&mut events).await,
        Some(Ok(StreamEvent::Token {
            text: REPLY_CHUNKS[0].to_owned()
        }))
    );
    events
}

#[tokio::test]
async fn 흐르는_답을_중단하면_턴은_cancelled_이고_부분_답이_저장되며_세션_상태는_그대로다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let before = h.sessions.last_save();
    let events = streaming(&h).await;

    let cancelled = h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await;

    assert_eq!(cancelled, Ok(CancelledTurnResponse::of(TURN_ID)));
    let rest = collect(events).await;
    assert_eq!(rest, vec![Ok(StreamEvent::Cancelled)], "the sender sees the end");
    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Cancelled);
    let rows: Vec<(MessageRole, &str)> = saved
        .history
        .iter()
        .filter(|m| m.turn_id.as_deref() == Some(TURN_ID))
        .map(|m| (m.role, m.text.as_str()))
        .collect();
    assert_eq!(
        rows,
        vec![
            (MessageRole::User, ENGAGED),
            (MessageRole::Assistant, REPLY_CHUNKS[0]),
        ]
    );
    assert_eq!(saved.task, before.task);
    assert_eq!(saved.retry_count, before.retry_count);
    assert_eq!(saved.support_level, before.support_level);
    assert!(!saved.closed);
    assert!(saved.analyses.is_empty(), "a cancelled turn leaves no analysis");

    let history = h.flow.history(&owner(), SESSION_ID).await.unwrap();
    assert!(
        history.iter().all(|m| m.turn_id.as_deref() != Some(TURN_ID)),
        "{history:?}"
    );
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    assert_eq!((state.active_turn, state.failed_turn), (None, None));
}

#[tokio::test]
async fn 중단한_턴은_다음_턴의_프롬프트_창에_없다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let events = streaming(&h).await;
    h.flow
        .cancel_turn(&owner(), SESSION_ID, TURN_ID)
        .await
        .unwrap();
    collect(events).await;
    h.model.pace().add_permits(16);

    h.say(DUNNO).await;

    let request = h.model.last_reply_request();
    let texts: Vec<&str> = request.messages.iter().map(|m| m.text.as_str()).collect();
    assert!(!texts.contains(&ENGAGED), "{texts:?}");
    assert!(!texts.contains(&REPLY_CHUNKS[0]), "{texts:?}");
    assert_eq!(texts.last(), Some(&DUNNO));
}

#[tokio::test]
async fn 중단은_멱등이다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let events = streaming(&h).await;
    h.flow
        .cancel_turn(&owner(), SESSION_ID, TURN_ID)
        .await
        .unwrap();
    collect(events).await;
    let saves = h.sessions.saves().len();

    let again = h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await;

    assert_eq!(again, Ok(CancelledTurnResponse::of(TURN_ID)));
    assert_eq!(h.sessions.saves().len(), saves, "nothing is written again");
}

#[tokio::test]
async fn 다시_붙은_스트림은_중단되면_cancelled_로_끝난다() {
    let h = Harness::slow(ScriptedModel::paced());
    h.onboard().await;
    let events = streaming(&h).await;
    let mut attached = h
        .flow
        .turn_stream(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned());
    assert!(matches!(
        next_event(&mut attached).await,
        Some(Ok(StreamEvent::Meta { .. }))
    ));

    h.flow
        .cancel_turn(&owner(), SESSION_ID, TURN_ID)
        .await
        .unwrap();

    let rest = collect(attached).await;
    assert_eq!(
        rest,
        vec![
            Ok(StreamEvent::Token {
                text: REPLY_CHUNKS[0].to_owned()
            }),
            Ok(StreamEvent::Cancelled),
        ]
    );
    collect(events).await;
}

#[tokio::test]
async fn 동기_턴도_답을_기다리는_중에_중단된다() {
    let h = Harness::slow(ScriptedModel::new());
    h.onboard().await;
    h.model.break_replies(ReplyFault::Hang);
    let flow = h.flow.clone();
    let sent = tokio::spawn(async move {
        flow.send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
            .await
    });
    // 턴이 등록부에 올라 답을 기다릴 때까지.
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();
            if state.active_turn.is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("the turn becomes active");

    let cancelled = h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await;

    assert_eq!(cancelled, Ok(CancelledTurnResponse::of(TURN_ID)));
    let refused = tokio::time::timeout(Duration::from_secs(2), sent)
        .await
        .expect("the turn ends")
        .unwrap();
    assert_eq!(
        refused,
        Err(ApiError::Conflict("Turn was cancelled".to_owned()))
    );
    let saved = h.sessions.last_save();
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Cancelled);
    let last = saved.history.last().unwrap();
    assert_eq!((last.role, last.text.as_str()), (MessageRole::User, ENGAGED));
}

#[tokio::test]
async fn 위기_턴은_중단할_수_없고_세션은_닫힌_채다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .send(&owner(), SESSION_ID, message_with(KEYWORD_CRISIS, TURN_ID))
        .await
        .unwrap();

    let refused = h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await;

    assert_eq!(refused, Err(finished()));
    let saved = h.sessions.last_save();
    assert!(saved.closed);
    let turn = saved.turns.iter().find(|t| t.id == TURN_ID).unwrap();
    assert_eq!(turn.status, TurnStatus::Done);
}

#[tokio::test]
async fn 끝난_턴과_실패한_턴은_중단할_수_없다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .send(&owner(), SESSION_ID, message_with(ENGAGED, TURN_ID))
        .await
        .unwrap();
    h.model.break_replies(ReplyFault::Provider);
    let failed_id = "8e1b4d2a-7c3f-4b96-a0d5-2f6e9c1b3a78";
    let _ = h
        .flow
        .send(&owner(), SESSION_ID, message_with(DUNNO, failed_id))
        .await;

    assert_eq!(
        h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await,
        Err(finished())
    );
    assert_eq!(
        h.flow.cancel_turn(&owner(), SESSION_ID, failed_id).await,
        Err(finished())
    );
}

#[tokio::test]
async fn 없는_턴은_404_이고_남의_세션은_403_이다() {
    let h = Harness::new();
    h.onboard().await;

    assert_eq!(
        h.flow.cancel_turn(&owner(), SESSION_ID, TURN_ID).await,
        Err(ApiError::NotFound(format!("Turn not found: {TURN_ID}")))
    );
    assert!(matches!(
        h.flow.cancel_turn(&other(), SESSION_ID, TURN_ID).await,
        Err(ApiError::Forbidden(_))
    ));
}

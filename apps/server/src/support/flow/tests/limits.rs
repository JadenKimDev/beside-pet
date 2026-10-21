// 모델 호출의 시간 제한: 라우터가 두른 제한(더블은 짧게, `TEST_LIMITS`)을 넘기면 흐름은 그것을 시간 제한으로 가른다.
// 테스트는 2초로 묶는다. 한도의 실제 값(120초, 60초)은 라우터의 테스트가 본다.

use std::time::Duration;

use super::doubles::{
    ENGAGED, Hang, Harness, KEYWORD_CRISIS, SESSION_ID, ScriptedModel, collect, joined_tokens,
    message, owner, reply_text,
};
use crate::llm::{CallErrorKind, CallPurpose};
use crate::safety::crisis_reply;
use crate::shared::ApiError;
use crate::support::session::{TurnErrorKind, TurnStatus};
use crate::support::{StreamEvent, SupportService};

async fn bounded<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(2), future)
        .await
        .expect("the call returns within its limit")
}

#[tokio::test]
async fn 발화가_답하지_않으면_제한_뒤_500_이고_턴을_저장하지_않으며_시간_제한으로_적는다() {
    let h = Harness::with_model(ScriptedModel::with(Hang::Reply));

    let refused = bounded(
        h.flow
            .start(&owner(), super::doubles::onboarding(SESSION_ID)),
    )
    .await;

    assert_eq!(refused, Err(ApiError::ModelTimeout));
    assert!(
        h.sessions.saves().iter().all(|s| s.history.is_empty()),
        "no greeting was stored"
    );
    assert_eq!(
        h.call_errors(CallPurpose::Reply),
        vec![CallErrorKind::Timeout]
    );
}

#[tokio::test]
async fn 스트림이_멈추면_유휴_제한_뒤_done_없이_끊고_시간_제한으로_적는다() {
    let h = Harness::with_model(ScriptedModel::with(Hang::StreamAfterFirst));
    h.onboard().await;
    let saves_before = h.sessions.saves().len();

    let events = collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;

    assert!(matches!(events.first(), Some(Ok(StreamEvent::Meta { .. }))));
    assert_eq!(joined_tokens(&events), super::doubles::REPLY_CHUNKS[0]);
    assert_eq!(events.last(), Some(&Err(ApiError::ModelTimeout)));
    assert_eq!(
        h.sessions.saves().len(),
        saves_before + 3,
        "saved on receipt, when the reply starts, and on timeout"
    );
    let turn = h.sessions.last_save().turns.last().cloned().unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Timeout));
    assert_eq!(
        h.call_errors(CallPurpose::Reply),
        vec![CallErrorKind::Timeout]
    );
}

#[tokio::test]
async fn 위기_판정이_답하지_않으면_제한_뒤_키워드로_판정하고_턴을_잇는다() {
    let h = Harness::with_model(ScriptedModel::with(Hang::Risk));
    h.onboard().await;

    let safe = bounded(h.flow.send(&owner(), SESSION_ID, message(ENGAGED)))
        .await
        .unwrap();
    assert_eq!(safe.support_level, 1);
    assert_eq!(safe.reply, reply_text());
    assert_eq!(
        h.call_errors(CallPurpose::Crisis),
        vec![CallErrorKind::Timeout]
    );

    let crisis = bounded(h.flow.send(&owner(), SESSION_ID, message(KEYWORD_CRISIS)))
        .await
        .unwrap();
    assert_eq!(crisis.reply, crisis_reply("en"));
}

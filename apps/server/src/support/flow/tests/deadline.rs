// 모델 호출의 시간 제한: 응답 없는 모델에 걸리지 않는다. 더블의 제한은 짧게(`TEST_LIMITS`) 두고, 테스트는 2초로 묶는다.

use std::time::Duration;

use super::super::deadline::{CallLimits, GENERATE_LIMIT, STREAM_IDLE_LIMIT};
use super::doubles::{
    ENGAGED, Hang, Harness, KEYWORD_CRISIS, SESSION_ID, ScriptedModel, collect, joined_tokens,
    message, owner, reply_text,
};
use crate::safety::crisis_reply;
use crate::shared::ApiError;
use crate::support::session::{TurnErrorKind, TurnStatus};
use crate::support::{StreamEvent, SupportService};

async fn bounded<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(2), future)
        .await
        .expect("the call returns within its limit")
}

#[test]
fn 실제_제한은_generate_전체와_스트림_유휴다() {
    assert_eq!(
        CallLimits::default(),
        CallLimits {
            generate: GENERATE_LIMIT,
            stream_idle: STREAM_IDLE_LIMIT,
        }
    );
    assert!(STREAM_IDLE_LIMIT <= GENERATE_LIMIT);
}

#[tokio::test]
async fn 발화가_답하지_않으면_제한_뒤_500_이고_턴을_저장하지_않는다() {
    let h = Harness::with_model(ScriptedModel::with(Hang::Reply));

    let refused = bounded(
        h.flow
            .start(&owner(), super::doubles::onboarding(SESSION_ID)),
    )
    .await;

    assert_eq!(refused, Err(ApiError::Internal));
    assert!(
        h.sessions.saves().iter().all(|s| s.history.is_empty()),
        "no greeting was stored"
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
    assert_eq!(events.last(), Some(&Err(ApiError::Internal)));
    assert_eq!(
        h.sessions.saves().len(),
        saves_before + 2,
        "saved on receipt and on timeout"
    );
    let turn = h.sessions.last_save().turns.last().cloned().unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Timeout));
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

    let crisis = bounded(h.flow.send(&owner(), SESSION_ID, message(KEYWORD_CRISIS)))
        .await
        .unwrap();
    assert_eq!(crisis.reply, crisis_reply("en"));
}

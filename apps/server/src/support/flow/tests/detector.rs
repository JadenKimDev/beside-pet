// 위기를 누가 잡았는가(ADR-0004): 턴 분석의 감지 주체는 safety 의 판정을 그대로 싣는다. 수준에서 지어내지 않는다.

use super::doubles::{
    Call, ENGAGED, Harness, KEYWORD_CRISIS, QUIET_CRISIS, ReplyFault, SESSION_ID, ScriptedModel,
    collect, message_with, owner, reply_text,
};
use crate::safety::crisis_reply;
use crate::support::rules::{RiskAssessment, SupportLevel};
use crate::support::{MessageRole, RiskDetector, SupportService};

/// 사용자 턴 하나를 보낸 뒤 저장된 마지막 턴 분석의 위기 판정.
async fn assessed(model: ScriptedModel, text: &str) -> (RiskAssessment, String) {
    let h = Harness::with_model(model);
    h.onboard().await;
    let turn = h.say(text).await;
    let saved = h.sessions.last_save();
    (saved.analyses.last().expect("an analysis").risk, turn.reply)
}

#[tokio::test]
async fn 키워드에_걸린_턴은_keyword_다() {
    let (risk, reply) = assessed(ScriptedModel::new(), KEYWORD_CRISIS).await;
    assert_eq!(
        risk,
        RiskAssessment {
            level: SupportLevel::Crisis,
            detected_by: RiskDetector::Keyword,
        }
    );
    assert_eq!(reply, crisis_reply("en"));
}

#[tokio::test]
async fn 키워드가_안_걸리고_모델이_yes_면_model_이다() {
    let (risk, reply) = assessed(ScriptedModel::flagging(), QUIET_CRISIS).await;
    assert_eq!(
        risk,
        RiskAssessment {
            level: SupportLevel::Crisis,
            detected_by: RiskDetector::Model,
        }
    );
    assert_eq!(
        reply,
        crisis_reply("en"),
        "모델이 잡은 위기도 고정 문구로 닫는다"
    );
}

#[tokio::test]
async fn 둘_다_아니면_none_이다() {
    let (risk, _) = assessed(ScriptedModel::new(), ENGAGED).await;
    assert_eq!(
        risk,
        RiskAssessment {
            level: SupportLevel::Safe,
            detected_by: RiskDetector::None,
        }
    );
}

#[tokio::test]
async fn 모델이_실패하면_키워드_결과로_대신해_none_이다() {
    let (risk, reply) = assessed(ScriptedModel::failing_risk(), QUIET_CRISIS).await;
    assert_eq!(
        risk,
        RiskAssessment {
            level: SupportLevel::Safe,
            detected_by: RiskDetector::None,
        }
    );
    assert_ne!(reply, crisis_reply("en"));
}

// 판정 입력의 직전 동반자 답(#48): 이 세션 기록(실패·중단한 턴은 빠진 사본)의 마지막 동반자 메시지를 넘긴다.

/// 마지막 위기 판정 요청의 사용자 쪽 글.
fn last_risk_input(h: &Harness) -> String {
    h.model
        .calls()
        .into_iter()
        .rev()
        .find_map(|call| match call {
            Call::Risk(text) => Some(text),
            _ => None,
        })
        .expect("a risk check was requested")
}

/// 저장된 기록의 마지막 동반자 메시지.
fn last_assistant(h: &Harness) -> String {
    h.sessions
        .last_save()
        .history
        .iter()
        .rev()
        .find(|message| message.role == MessageRole::Assistant)
        .expect("an assistant message")
        .text
        .clone()
}

#[tokio::test]
async fn 첫_사용자_턴의_판정은_첫_인사를_직전_답으로_받는다() {
    let h = Harness::new();
    h.onboard().await;
    let greeting = last_assistant(&h);

    h.say(ENGAGED).await;

    assert_eq!(
        last_risk_input(&h),
        format!("Previous companion message: {greeting}\nUser message: {ENGAGED}")
    );
}

#[tokio::test]
async fn 다음_턴의_판정은_바로_앞_턴의_답을_직전_답으로_받는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;

    h.say(QUIET_CRISIS).await;

    assert_eq!(
        last_risk_input(&h),
        format!(
            "Previous companion message: {}\nUser message: {QUIET_CRISIS}",
            reply_text()
        )
    );
}

#[tokio::test]
async fn 실패한_턴의_재시도_판정은_실패_전_마지막_답을_직전_답으로_받는다() {
    const TURN_ID: &str = "4c1e8a2f-7d3b-4f60-9e15-2a6b8c0d4e71";
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;
    h.model.break_replies(ReplyFault::Provider);
    let refused = h
        .flow
        .send(&owner(), SESSION_ID, message_with(QUIET_CRISIS, TURN_ID))
        .await;
    assert!(refused.is_err());
    h.model.mend_replies();
    let risks = h.model.risk_calls();

    collect(
        h.flow
            .retry_turn(owner(), SESSION_ID.to_owned(), TURN_ID.to_owned()),
    )
    .await;

    assert_eq!(h.model.risk_calls(), risks + 1);
    assert_eq!(
        last_risk_input(&h),
        format!(
            "Previous companion message: {}\nUser message: {QUIET_CRISIS}",
            reply_text()
        )
    );
}

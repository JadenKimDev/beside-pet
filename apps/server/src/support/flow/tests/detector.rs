// 위기를 누가 잡았는가(ADR-0004): 턴 분석의 감지 주체는 safety 의 판정을 그대로 싣는다. 수준에서 지어내지 않는다.

use super::doubles::{ENGAGED, Harness, KEYWORD_CRISIS, QUIET_CRISIS, ScriptedModel};
use crate::safety::crisis_reply;
use crate::support::RiskDetector;
use crate::support::rules::{RiskAssessment, SupportLevel};

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
    assert_eq!(reply, crisis_reply());
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
        crisis_reply(),
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
    assert_ne!(reply, crisis_reply());
}

// 호출 맥락: 흐름이 부르는 모델 호출마다 역할, 그 역할의 프롬프트 버전, 세션 id 를 싣는다. 계측이 이 맥락으로 호출을 가른다.

use super::doubles::{DUNNO, ENGAGED, Harness, SESSION_ID, collect, message, onboarding, owner};
use crate::llm::{CallContext, CallPurpose};
use crate::safety;
use crate::support::SupportService;
use crate::support::prompt;

fn expected(purpose: CallPurpose, prompt_version: &'static str) -> CallContext {
    CallContext {
        purpose,
        prompt_version,
        session_id: Some(SESSION_ID.to_owned()),
    }
}

#[test]
fn 역할별_프롬프트_버전은_발화_0_4_0_리포트와_위기_판정_0_1_0_이다() {
    assert_eq!(prompt::REPLY_PROMPT_VERSION, "0.4.0");
    assert_eq!(prompt::REPORT_PROMPT_VERSION, "0.1.0");
    assert_eq!(safety::RISK_PROMPT_VERSION, "0.1.0");
}

#[tokio::test]
async fn 첫_인사와_턴은_위기_판정과_발화의_맥락을_세션_id_와_싣는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;
    assert_eq!(
        h.model.contexts(),
        vec![
            expected(CallPurpose::Reply, prompt::REPLY_PROMPT_VERSION),
            expected(CallPurpose::Crisis, safety::RISK_PROMPT_VERSION),
            expected(CallPurpose::Reply, prompt::REPLY_PROMPT_VERSION),
        ]
    );
}

#[tokio::test]
async fn 스트림의_첫_인사와_발화도_같은_맥락을_싣는다() {
    let h = Harness::new();
    collect(h.flow.start_stream(owner(), onboarding(SESSION_ID))).await;
    collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;
    assert_eq!(
        h.model.contexts(),
        vec![
            expected(CallPurpose::Reply, prompt::REPLY_PROMPT_VERSION),
            expected(CallPurpose::Crisis, safety::RISK_PROMPT_VERSION),
            expected(CallPurpose::Reply, prompt::REPLY_PROMPT_VERSION),
        ]
    );
}

#[tokio::test]
async fn 리포트는_리포트의_맥락을_싣는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await;
    h.flow.close(&owner(), SESSION_ID).await.unwrap();
    h.flow.report(&owner(), SESSION_ID).await.unwrap();
    assert_eq!(
        h.model.contexts().last(),
        Some(&expected(
            CallPurpose::Report,
            prompt::REPORT_PROMPT_VERSION
        ))
    );
}

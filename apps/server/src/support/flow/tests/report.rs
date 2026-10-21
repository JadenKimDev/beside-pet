// 마음 리포트(ADR-0008): 닫혔고 과제 2 이상일 때만, 처음 요청 때 한 번 쓰고 다음부터는 저장된 것을 돌려준다.

use super::doubles::{DUNNO, Harness, SESSION_ID, ScriptedModel, owner};
use crate::llm::CallPurpose;
use crate::shared::ApiError;
use crate::support::{MessageRole, ReportSectionKey, SupportService};

fn unavailable() -> ApiError {
    ApiError::Conflict("The report is not available for this session yet.".to_owned())
}

#[tokio::test]
async fn 열린_세션의_리포트는_409_다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await; // 과제 2, 열림

    assert_eq!(
        h.flow.report(&owner(), SESSION_ID).await.err(),
        Some(unavailable())
    );
    assert_eq!(h.model.report_calls(), 0);
}

#[tokio::test]
async fn 과제_1_에서_닫힌_세션의_리포트는_409_다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow.close(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(
        h.flow.report(&owner(), SESSION_ID).await.err(),
        Some(unavailable())
    );
    assert_eq!(h.model.report_calls(), 0);
}

#[tokio::test]
async fn 리포트는_한_번_쓰고_다음엔_저장된_것을_돌려준다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await;
    h.flow.close(&owner(), SESSION_ID).await.unwrap();

    let first = h.flow.report(&owner(), SESSION_ID).await.unwrap();
    let second = h.flow.report(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(first, second);
    assert_eq!(h.model.report_calls(), 1);
    let keys: Vec<ReportSectionKey> = first.sections.iter().map(|s| s.key).collect();
    assert_eq!(
        keys,
        vec![
            ReportSectionKey::Journey,
            ReportSectionKey::Emotions,
            ReportSectionKey::Keepsake,
            ReportSectionKey::Encouragement,
        ]
    );
    assert_eq!(first.sections[0].body, "You walked far today.");
    assert_eq!(first.sections[3].body, "Be gentle with yourself.");
    assert_eq!(first.sections[1].body, "Your sadness is love.");
    assert_eq!(
        first.sections[1].tags,
        Some(vec!["sadness".to_owned(), "love".to_owned()]),
        "emotions 구역은 모델이 쓴 감정 낱말을 tags 로 갖는다"
    );
    assert!(
        [0, 2, 3]
            .iter()
            .all(|&index| first.sections[index].tags.is_none()),
        "다른 구역은 tags 가 없다"
    );
    assert_eq!(
        first.started_at,
        h.sessions.last_save().started_at,
        "시작 시각은 세션의 것이다"
    );
    assert_ne!(first.started_at, first.at);
    assert_eq!((first.reached_task, first.progress), (2, 0.25));
    assert_eq!(first.pet_name, "Biscuit");
    assert!(
        h.sessions.last_save().report.is_some(),
        "the report is stored"
    );
    let request = h
        .model
        .calls()
        .into_iter()
        .find_map(|call| match call {
            super::doubles::Call::Report(request) => Some(request),
            _ => None,
        })
        .unwrap();
    assert_eq!(request.max_tokens, 900);
    assert!(request.messages[0].text.contains("[Transcript]"));
}

#[tokio::test]
async fn 감정_낱말_줄이_없으면_tags_는_없다() {
    let h = Harness::with_model(ScriptedModel::report_without_tags());
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await;
    h.flow.close(&owner(), SESSION_ID).await.unwrap();

    let report = h.flow.report(&owner(), SESSION_ID).await.unwrap();
    assert!(report.sections.iter().all(|section| section.tags.is_none()));
    assert_eq!(report.sections[1].body, "Your sadness is love.");
}

/// 닫힌 과제 2 세션의 전사에서 사용자 턴을 `keep` 개만 남긴다(리포트는 열린 채).
async fn closed_with_user_turns(h: &Harness, keep: usize) {
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await;
    h.flow.close(&owner(), SESSION_ID).await.unwrap();
    let mut snapshot = h.sessions.get(SESSION_ID).unwrap();
    let mut seen = 0;
    snapshot.history.retain(|message| {
        if message.role != MessageRole::User {
            return true;
        }
        seen += 1;
        seen <= keep
    });
    assert_eq!(
        snapshot
            .history
            .iter()
            .filter(|message| message.role == MessageRole::User)
            .count(),
        keep
    );
    h.sessions.put(snapshot);
}

async fn assert_short_report(keep: usize) {
    let h = Harness::new();
    closed_with_user_turns(&h, keep).await;

    let first = h.flow.report(&owner(), SESSION_ID).await.unwrap();
    let second = h.flow.report(&owner(), SESSION_ID).await.unwrap();

    assert!(first.sections.is_empty(), "짧은 전사의 리포트는 절이 없다");
    assert_eq!(first, second, "다음부터는 저장된 빈 리포트를 돌려준다");
    assert_eq!(h.model.report_calls(), 0, "모델을 부르지 않는다");
    assert!(
        h.model
            .contexts()
            .iter()
            .all(|context| context.purpose != CallPurpose::Report),
        "report 역할의 호출이 남지 않는다"
    );
    let stored = h.sessions.last_save().report.expect("the report is stored");
    assert!(stored.sections.is_empty(), "저장도 빈 배열이다");
    assert_eq!(first.pet_name, "Biscuit");
    assert_eq!(first.reached_task, 2);
}

#[tokio::test]
async fn 사용자_턴이_없는_전사의_리포트는_모델_없이_빈_절이다() {
    assert_short_report(0).await;
}

#[tokio::test]
async fn 사용자_턴이_하나인_전사의_리포트는_모델_없이_빈_절이다() {
    assert_short_report(1).await;
}

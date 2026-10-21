// 시작: 프로필이 있으면 온보딩(과제 1), 없으면 직전 세션을 이어 재개, 직전이 없으면 400. 계정의 대화 언어를 따른다.

use super::doubles::{
    DUNNO, FixedLanguages, Harness, OWNER_ID, SESSION_ID, ScriptedModel, onboarding, owner,
    reply_text, resuming,
};
use crate::identity::ChatLanguage;
use crate::shared::ApiError;
use crate::support::rules::Task;
use crate::support::{MessageRole, SupportService};

#[tokio::test]
async fn 온보딩은_과제_1_에서_인사하고_세션을_저장한다() {
    let h = Harness::new();

    let turn = h
        .flow
        .start(&owner(), onboarding(SESSION_ID))
        .await
        .unwrap();

    assert_eq!(turn.reply, reply_text());
    assert_eq!((turn.task, turn.progress, turn.support_level), (1, 0.0, 1));
    assert!(!turn.done);
    let saved = h.sessions.last_save();
    assert_eq!(saved.id, SESSION_ID);
    assert_eq!(saved.owner_id, OWNER_ID);
    assert_eq!(saved.task, Task::FIRST);
    assert_eq!(saved.history.len(), 1);
    assert_eq!(saved.history[0].role, MessageRole::Assistant);
    let request = h.model.last_reply_request();
    assert_eq!(request.max_tokens, 320);
    let system = request.system.unwrap();
    assert!(system.contains("Greet briefly"), "intro phase");
    assert!(system.contains("\"Biscuit\""));
    assert!(system.contains("Grief comes in waves."));
    let line = system.lines().last().unwrap();
    assert!(line.starts_with("For this reply:"), "{line}");
    assert!(
        line.contains("Open the story of the pet with one gentle question."),
        "intro invites: {line}"
    );
    assert!(!line.contains("Do not ask"), "{line}");
}

#[tokio::test]
async fn 계정의_대화_언어가_프로필보다_앞선다() {
    let languages = FixedLanguages([(OWNER_ID.to_owned(), ChatLanguage::Ko)].into());
    let h = Harness::with(ScriptedModel::new(), languages);

    h.onboard().await;

    let saved = h.sessions.last_save();
    assert_eq!(
        saved.grief_profile.preferred_language,
        Some(ChatLanguage::Ko)
    );
}

#[tokio::test]
async fn 직전_세션이_없으면_재개는_400_이다() {
    let h = Harness::new();

    let refused = h.flow.start(&owner(), resuming("s-2")).await;

    assert_eq!(
        refused,
        Err(ApiError::bad_request(
            "No prior session to continue; onboarding is required."
        ))
    );
    assert!(h.sessions.saves().is_empty());
    assert_eq!(h.model.reply_calls(), 0);
}

#[tokio::test]
async fn 재개는_직전_세션의_프로필과_과제를_잇고_요약과_전사_꼬리를_넘긴다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(DUNNO).await;
    h.say(DUNNO).await; // 과제 2
    h.flow.close(&owner(), SESSION_ID).await.unwrap();

    let turn = h.flow.start(&owner(), resuming("s-2")).await.unwrap();

    assert_eq!(turn.task, 2);
    let saved = h.sessions.get("s-2").unwrap();
    assert_eq!(saved.task.number(), 2);
    assert_eq!(saved.grief_profile.pet_name.as_deref(), Some("Biscuit"));
    let system = h.model.last_reply_request().system.unwrap();
    assert!(system.contains("Briefly welcome them back"), "resume phase");
    assert!(
        system.contains("Previous session recap:"),
        "the closed session's summary"
    );
    assert!(system.contains("Last messages exchanged:"));
    assert!(system.contains(DUNNO));
}

#[tokio::test]
async fn 클로징까지_간_세션을_이으면_과제_1_에서_다시_시작한다() {
    let h = Harness::new();
    h.onboard().await;
    for _ in 0..8 {
        h.say(DUNNO).await;
    }

    let turn = h.flow.start(&owner(), resuming("s-2")).await.unwrap();

    assert_eq!((turn.task, turn.progress), (1, 0.0));
}

#[tokio::test]
async fn 재개는_소유자의_가장_최근_세션을_잇는다() {
    let h = Harness::new();
    h.onboard().await; // s-1, 과제 1
    h.flow.start(&owner(), onboarding("s-older")).await.unwrap();
    // s-older 가 나중에 시작했지만 여기서는 s-1 을 과제 2 로 올리고 시작 시각을 늦춘다.
    let mut latest = h.sessions.get(SESSION_ID).unwrap();
    latest.task = Task::new(3).unwrap();
    latest.started_at = super::doubles::base_time() + chrono::Duration::days(1);
    h.sessions.put(latest);

    let turn = h.flow.start(&owner(), resuming("s-3")).await.unwrap();

    assert_eq!(turn.task, 3);
}

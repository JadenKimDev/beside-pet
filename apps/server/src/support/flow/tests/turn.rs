// 한 턴의 순서(ADR-0005, ADR-0028): 안전 확인 → 받기와 저장 → 과제 전이 → 지식 검색 → 발화 → 턴 분석 → 저장. 깊이 게이트가 응답의 진행률에 닿는다.

use super::doubles::{
    Call, DUNNO, ENGAGED, Harness, OWNER_ID, SESSION_ID, ScriptedModel, base_time, reply_text,
};
use crate::llm::PromptRole;
use crate::support::rules::Task;
use crate::support::{
    MemoryNote, MemoryView, MessageRole, NoteKind, Pet, PetStatus, ReplyPhase, SupportService,
};

#[tokio::test]
async fn 턴은_판정_뒤_발화하고_전사와_분석을_순서대로_저장한다() {
    let h = Harness::new();
    h.onboard().await;
    let saves_before = h.sessions.saves().len();

    let turn = h.say(ENGAGED).await;

    assert_eq!(turn.reply, reply_text(), "the reply is trimmed");
    let calls = h.model.calls();
    let tail: Vec<&Call> = calls.iter().skip(1).collect();
    assert!(
        matches!(tail[0], Call::Risk(text) if text == ENGAGED),
        "{calls:?}"
    );
    let Call::Reply(request) = tail[1] else {
        panic!("the reply follows the risk check: {calls:?}");
    };
    assert_eq!(request.max_tokens, 320);
    let last = request.messages.last().unwrap();
    assert_eq!((last.role, last.text.as_str()), (PromptRole::User, ENGAGED));
    let system = request.system.as_deref().unwrap();
    assert!(
        system.contains("Grief comes in waves."),
        "task 1 knowledge grounds the reply"
    );

    assert_eq!(
        h.sessions.saves().len(),
        saves_before + 3,
        "three saves per turn: on receipt, when the reply starts, and on completion"
    );
    let saved = h.sessions.last_save();
    let transcript: Vec<(MessageRole, &str)> = saved
        .history
        .iter()
        .map(|message| (message.role, message.text.as_str()))
        .collect();
    let reply = reply_text();
    assert_eq!(
        transcript,
        vec![
            (MessageRole::Assistant, reply.as_str()),
            (MessageRole::User, ENGAGED),
            (MessageRole::Assistant, reply.as_str()),
        ]
    );
    assert_eq!(saved.analyses.len(), 1);
    let analysis = &saved.analyses[0];
    assert_eq!(analysis.phase, ReplyPhase::Deepen);
    assert_eq!(analysis.task, Task::FIRST);
    assert_eq!(analysis.knowledge.len(), 1);
    assert_eq!(analysis.knowledge[0].source, "Fixture task one");
}

#[tokio::test]
async fn 세_번째_진솔한_답에서_다음_과제로_넘어가고_진행률이_오른다() {
    let h = Harness::new();
    h.onboard().await;

    let first = h.say(ENGAGED).await;
    let second = h.say(ENGAGED).await;
    let third = h.say(ENGAGED).await;

    assert_eq!((first.task, first.progress), (1, 0.0));
    assert_eq!((second.task, second.progress), (1, 0.0));
    assert_eq!((third.task, third.progress), (2, 0.25));
    let system = h.model.last_reply_request().system.unwrap();
    assert!(
        system.contains("Pain is allowed to be felt."),
        "the new task's knowledge"
    );
    let saved = h.sessions.last_save();
    let analysis = saved.analyses.last().unwrap();
    assert_eq!(analysis.phase, ReplyPhase::Task);
    assert!(analysis.transition.advanced);
}

#[tokio::test]
async fn 비몰입이_두_번_이어지면_일찍_넘어간다() {
    let h = Harness::new();
    h.onboard().await;

    let first = h.say(DUNNO).await;
    let second = h.say(DUNNO).await;

    assert_eq!(first.task, 1);
    assert_eq!(h.sessions.last_save().analyses[0].phase, ReplyPhase::Retry);
    assert_eq!(second.task, 2);
}

#[tokio::test]
async fn 클로징에_닿은_턴은_답을_쓴_뒤_세션을_닫는다() {
    let h = Harness::new();
    h.onboard().await;

    // 과제마다 비몰입 두 번이면 넘어간다: 1→2→3→4→5.
    let mut last = None;
    for _ in 0..8 {
        last = Some(h.say(DUNNO).await);
    }
    let last = last.unwrap();

    assert_eq!((last.task, last.progress), (5, 1.0));
    assert!(last.done);
    let saved = h.sessions.last_save();
    assert!(saved.closed);
    assert_eq!(saved.analyses.last().unwrap().phase, ReplyPhase::Closing);
    assert_eq!(saved.history.last().unwrap().role, MessageRole::Assistant);
    assert_eq!(h.model.reply_calls(), 9, "the greeting and eight turns");
    let state = h
        .flow
        .state(&super::doubles::owner(), SESSION_ID)
        .await
        .unwrap();
    assert!(state.closed && state.report_available);
}

/// 마지막 발화 요청의 시스템 프롬프트 끝 줄(이번 턴의 화법).
fn style_line(h: &Harness) -> String {
    let system = h.model.last_reply_request().system.unwrap();
    system.lines().last().unwrap().to_owned()
}

#[tokio::test]
async fn 발화의_시스템_프롬프트는_이번_턴의_화법_한_줄로_끝난다() {
    let h = Harness::with_model(ScriptedModel::answering(
        "That river sounds like it mattered.",
    ));
    h.onboard().await;

    h.say(ENGAGED).await;

    let line = style_line(&h);
    assert!(line.starts_with("For this reply:"), "{line}");
    assert!(
        !line.contains("Do not ask"),
        "nothing asked to stop: {line}"
    );
}

#[tokio::test]
async fn 질문을_그만하라는_말_다음_턴에는_질문_금지_줄이_실린다() {
    let h = Harness::with_model(ScriptedModel::answering(
        "That river sounds like it mattered.",
    ));
    h.onboard().await;
    h.say(ENGAGED).await;

    h.say("Please stop asking me questions about him.").await;

    let line = style_line(&h);
    assert!(line.starts_with("For this reply:"), "{line}");
    assert!(line.contains("Do not ask any question"), "{line}");
}

#[tokio::test]
async fn 질문_좀_그만해요_다음_턴에도_질문_금지_줄이_실린다() {
    let h = Harness::with_model(ScriptedModel::answering(
        "That river sounds like it mattered.",
    ));
    h.onboard().await;
    h.say(ENGAGED).await;

    h.say("질문 좀 그만해요").await;

    let line = style_line(&h);
    assert!(line.starts_with("For this reply:"), "{line}");
    // 15자 이하의 말이라 짧은 말 줄이 질문 금지 줄의 자리를 대신한다(#37 S3).
    assert!(line.contains("ask no question"), "{line}");
}

fn remembered() -> MemoryView {
    let pet = |id: &str, name: &str, status| Pet {
        id: id.to_owned(),
        name: name.to_owned(),
        status,
        loss_type: None,
        source_session_id: "s-earlier".to_owned(),
        said_at: base_time(),
    };
    MemoryView {
        pets: vec![
            pet("p-mochi", "Mochi", PetStatus::Living),
            pet("p-biscuit", "Biscuit", PetStatus::Deceased),
        ],
        notes: vec![MemoryNote {
            id: "n-1".to_owned(),
            session_id: "s-earlier".to_owned(),
            seq: 2,
            kind: NoteKind::Object,
            pet_id: Some("p-biscuit".to_owned()),
            text: "A blue blanket hangs by the front door.".to_owned(),
            said_at: base_time(),
        }],
    }
}

#[tokio::test]
async fn 첫_인사와_매_턴의_시스템_프롬프트에_기억_블록이_있고_지금_세션의_아이가_먼저다() {
    let h = Harness::new();
    h.memory.set(OWNER_ID, remembered());
    h.onboard().await;
    h.say(ENGAGED).await;
    h.say(DUNNO).await;

    let replies: Vec<String> = h
        .model
        .calls()
        .into_iter()
        .filter_map(|call| match call {
            Call::Reply(request) => request.system,
            _ => None,
        })
        .collect();
    assert_eq!(replies.len(), 3, "the greeting and two turns");
    for system in &replies {
        assert!(system.contains("About this person"), "{system}");
        assert!(
            system.contains("A blue blanket hangs by the front door."),
            "{system}"
        );
        let current = system
            .find("Pet in this conversation: Biscuit (passed away)")
            .expect("the session's pet comes first");
        let other = system
            .find("Other pets: Mochi (living)")
            .expect("then the others");
        assert!(current < other);
    }
}

#[tokio::test]
async fn 기억이_없으면_블록도_없다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;

    let system = h.model.last_reply_request().system.unwrap();
    assert!(!system.contains("About this person"), "{system}");
}

#[tokio::test]
async fn 기억을_읽지_못해도_턴은_답한다() {
    let h = Harness::new();
    h.memory.set(OWNER_ID, remembered());
    h.memory.fail_reads();
    h.onboard().await;

    let turn = h.say(ENGAGED).await;

    assert_eq!(turn.reply, reply_text());
    let system = h.model.last_reply_request().system.unwrap();
    assert!(!system.contains("About this person"), "{system}");
}

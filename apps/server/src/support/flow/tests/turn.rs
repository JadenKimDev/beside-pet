// 한 턴의 순서(ADR-0005, ADR-0028): 안전 확인 → 받기와 저장 → 과제 전이 → 지식 검색 → 발화 → 턴 분석 → 저장. 깊이 게이트가 응답의 진행률에 닿는다.

use super::doubles::{Call, DUNNO, ENGAGED, Harness, SESSION_ID, reply_text};
use crate::llm::PromptRole;
use crate::support::rules::Task;
use crate::support::{MessageRole, ReplyPhase, SupportService};

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
        saves_before + 2,
        "two saves per turn: on receipt and on completion"
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

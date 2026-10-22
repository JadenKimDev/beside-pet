// 턴 추적(sandbox 전용): 추적을 켠 흐름은 답한 턴의 분석에 발화 지시문 버전, 블록 이름과 길이, 화법 결정, 시스템 프롬프트 전문을
// 남기고 분석 응답의 `trace` 로 보인다. 끈 흐름(production)은 남기지 않고 응답에서 칸이 빠진다. 위기 턴은 발화 모델을 부르지 않아 없다.

use super::doubles::{
    ENGAGED, Harness, KEYWORD_CRISIS, SESSION_ID, ScriptedModel, collect, message, owner,
};
use crate::support::SupportService;
use crate::support::prompt::REPLY_PROMPT_VERSION;
use crate::support::response::TurnTrace;

/// 블록 이름의 조립 순서(`reply_prompt_blocks`). 빈 블록은 빠지므로 추적의 이름은 이 순서의 부분열이다.
const BLOCK_ORDER: [&str; 7] = [
    "identity",
    "pet",
    "output_rules",
    "phase",
    "previous",
    "knowledge",
    "turn_style",
];

fn last_trace(h: &Harness) -> Option<TurnTrace> {
    h.sessions
        .last_save()
        .analyses
        .last()
        .expect("the turn left an analysis")
        .trace
        .clone()
}

/// 추적이 이 턴의 실제 발화 요청과 맞는다: 버전, 순서대로인 블록, 블록 길이의 합, 시스템 프롬프트 전문.
fn assert_matches_request(h: &Harness, trace: &TurnTrace) {
    let system = h
        .model
        .last_reply_request()
        .system
        .expect("the reply request has a system prompt");
    assert_eq!(trace.prompt_version, REPLY_PROMPT_VERSION);
    assert_eq!(trace.system_prompt, system);
    let names: Vec<&str> = trace
        .blocks
        .iter()
        .map(|block| block.name.as_str())
        .collect();
    let ordered: Vec<&str> = BLOCK_ORDER
        .into_iter()
        .filter(|name| names.contains(name))
        .collect();
    assert_eq!(names, ordered, "blocks follow the assembly order");
    for required in ["identity", "output_rules", "phase", "turn_style"] {
        assert!(names.contains(&required), "{required} is in {names:?}");
    }
    // 블록은 "\n" 으로 이어 붙인다.
    let joined: usize = trace.blocks.iter().map(|block| block.chars).sum::<usize>()
        + trace.blocks.len().saturating_sub(1);
    assert_eq!(joined, system.chars().count());
}

#[tokio::test]
async fn 추적을_켜면_동기_턴의_분석에_발화_프롬프트가_남는다() {
    let h = Harness::traced(ScriptedModel::new());
    h.onboard().await;
    h.say(ENGAGED).await;
    let trace = last_trace(&h).expect("a sandbox turn is traced");
    assert_matches_request(&h, &trace);
}

#[tokio::test]
async fn 추적을_켜면_스트림_턴의_분석에도_남는다() {
    let h = Harness::traced(ScriptedModel::new());
    h.onboard().await;
    collect(
        h.flow
            .send_stream(owner(), SESSION_ID.to_owned(), message(ENGAGED)),
    )
    .await;
    let trace = last_trace(&h).expect("a streamed sandbox turn is traced");
    assert_matches_request(&h, &trace);
}

#[tokio::test]
async fn 추적은_분석_응답의_trace_칸으로_보인다() {
    let h = Harness::traced(ScriptedModel::new());
    h.onboard().await;
    h.say(ENGAGED).await;
    let analysis = h.flow.analysis(&owner(), SESSION_ID).await.unwrap();
    let json = serde_json::to_value(&analysis).unwrap();
    let trace = &json["analyses"][0]["trace"];
    assert_eq!(trace["promptVersion"], REPLY_PROMPT_VERSION);
    assert_eq!(trace["blocks"][0]["name"], "identity");
    assert!(trace["blocks"][0]["chars"].as_u64().unwrap() > 0);
    assert!(trace["turnStyle"]["questionPolicy"].is_string(), "{trace}");
    assert!(trace["turnStyle"]["stockPassed"].is_array(), "{trace}");
    assert_eq!(
        trace["systemPrompt"],
        h.model.last_reply_request().system.unwrap()
    );
}

#[tokio::test]
async fn 추적을_끄면_분석에_없고_응답에서_칸이_빠진다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;
    assert_eq!(last_trace(&h), None);
    let analysis = h.flow.analysis(&owner(), SESSION_ID).await.unwrap();
    let json = serde_json::to_value(&analysis).unwrap();
    let first = json["analyses"][0].as_object().unwrap();
    assert!(!first.contains_key("trace"), "{first:?}");
}

#[tokio::test]
async fn 위기_턴은_추적을_켜도_남기지_않는다() {
    let h = Harness::traced(ScriptedModel::new());
    h.onboard().await;
    h.say(KEYWORD_CRISIS).await;
    assert_eq!(last_trace(&h), None);
}

#[tokio::test]
async fn 추적은_다음_턴의_저장에도_그대로_남는다() {
    let h = Harness::traced(ScriptedModel::new());
    h.onboard().await;
    h.say(ENGAGED).await;
    let first = last_trace(&h).expect("the first turn is traced");
    h.say(ENGAGED).await;
    let analyses = h.sessions.last_save().analyses;
    assert_eq!(analyses[0].trace.as_ref(), Some(&first));
    assert!(analyses[1].trace.is_some());
}

use super::cost_usd;
use crate::llm::LlmProvider;

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-12
}

#[test]
fn 단가표의_네_모델은_백만_토큰당_단가로_센다() {
    // (입력, 출력) USD/MTok. haiku-5-5 는 프롬프트 10만 토큰 이하의 값(platform.claude.com/docs/en/about-claude/pricing).
    let cases = [
        ("claude-haiku-5-5", 0.10, 0.50),
        ("claude-haiku-4-5", 1.0, 5.0),
        ("claude-sonnet-5", 3.0, 15.0),
        ("claude-opus-4-8", 5.0, 25.0),
    ];
    for (model, input, output) in cases {
        let cost = cost_usd(LlmProvider::Anthropic, model, 1_000_000, 1_000_000);
        assert!(close(cost, input + output), "{model}: {cost}");
    }
    let cost = cost_usd(LlmProvider::Anthropic, "claude-haiku-4-5", 2_000, 300);
    assert!(close(cost, 0.002 + 0.0015), "{cost}");
}

#[test]
fn 모르는_모델은_0_이다() {
    assert_eq!(
        cost_usd(LlmProvider::Anthropic, "claude-unknown", 1_000, 1_000),
        0.0
    );
}

#[test]
fn ollama_는_모델_이름과_상관없이_0_이다() {
    assert_eq!(cost_usd(LlmProvider::Ollama, "gemma4", 1_000, 1_000), 0.0);
    assert_eq!(
        cost_usd(LlmProvider::Ollama, "claude-haiku-4-5", 1_000, 1_000),
        0.0
    );
}

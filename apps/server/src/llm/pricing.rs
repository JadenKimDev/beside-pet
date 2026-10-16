//! 모델 단가표: 모델 id 별 USD/MTok 와 호출 한 번의 비용. 모르는 모델과 Ollama(로컬)는 0 이다.
//!
//! TS 의 `model-pricing.ts` 와 같은 표다. 모델을 새로 쓰면 줄을 더한다.

use super::LlmProvider;

/// 백만 토큰당 USD (입력, 출력).
fn per_mtok(model: &str) -> Option<(f64, f64)> {
    match model {
        "claude-haiku-4-5" => Some((1.0, 5.0)),
        "claude-sonnet-5" => Some((3.0, 15.0)),
        "claude-opus-4-8" => Some((5.0, 25.0)),
        _ => None,
    }
}

/// 호출 한 번의 비용(USD).
pub fn cost_usd(provider: LlmProvider, model: &str, input_tokens: u32, output_tokens: u32) -> f64 {
    let Some((input, output)) = (match provider {
        LlmProvider::Anthropic => per_mtok(model),
        LlmProvider::Ollama => None,
    }) else {
        return 0.0;
    };
    f64::from(input_tokens) / 1_000_000.0 * input + f64::from(output_tokens) / 1_000_000.0 * output
}

#[cfg(test)]
mod tests;

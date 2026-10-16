//! 기본 모델 설정: 설정(`Config`)이 읽은 모델 값에 기본값을 채워 기본 `ModelRef` 와 공급자마다의 연결 값으로 푼다.
//!
//! 환경 변수는 읽지 않는다(`shared/config.rs` 만 읽는다). 기동 조건(기본 공급자의 설정이 있는가)은
//! `Config::require_default_model` 이 본다.

use std::fmt;

use super::LlmProvider;
use crate::shared::Config;

/// 아무 모델도 적지 않았을 때의 기본(ADR-0010 의 Claude Haiku 4.5).
const DEFAULT_MODEL: &str = "claude-haiku-4-5";
const DEFAULT_ANTHROPIC_BASE_URL: &str = "https://api.anthropic.com";
/// 루프백의 Ollama. 컨테이너 안에서는 `OLLAMA_BASE_URL` 로 바꾼다.
const DEFAULT_OLLAMA_BASE_URL: &str = "http://127.0.0.1:11434";

/// 공급자와 모델을 함께 고른 것.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelRef {
    pub provider: LlmProvider,
    pub model: String,
}

/// Anthropic 에 붙는 값. 키가 있을 때만 있다.
#[derive(Clone, PartialEq, Eq)]
pub struct AnthropicSettings {
    pub base_url: String,
    pub api_key: String,
}

impl fmt::Debug for AnthropicSettings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("AnthropicSettings")
            .field("base_url", &self.base_url)
            .field("api_key", &"<hidden>")
            .finish()
    }
}

/// Ollama 에 붙는 값.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OllamaSettings {
    pub base_url: String,
    pub think: bool,
}

/// 기본 모델과 공급자마다의 연결 값.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelSettings {
    pub default_model: ModelRef,
    pub anthropic: Option<AnthropicSettings>,
    pub ollama: OllamaSettings,
}

impl ModelSettings {
    /// 우선순위는 TS 와 같다: 공급자는 `LLM_PROVIDER`(없으면 anthropic), 모델은 `LLM_MODEL`, `CLAUDE_MODEL`,
    /// `claude-haiku-4-5` 순. Anthropic 은 키가 있을 때만 설정을 갖는다.
    pub fn from_config(config: &Config) -> ModelSettings {
        let env = &config.model;
        // `Config::from_lookup` 이 `LLM_PROVIDER` 를 anthropic, ollama 만 받으므로 없을 때만 기본으로 간다.
        let provider = env
            .provider
            .as_deref()
            .and_then(LlmProvider::parse)
            .unwrap_or(LlmProvider::Anthropic);
        let model = env
            .model
            .clone()
            .or_else(|| env.claude_model.clone())
            .unwrap_or_else(|| DEFAULT_MODEL.to_owned());
        ModelSettings {
            default_model: ModelRef { provider, model },
            anthropic: env
                .anthropic_api_key
                .clone()
                .map(|api_key| AnthropicSettings {
                    base_url: env
                        .anthropic_base_url
                        .clone()
                        .unwrap_or_else(|| DEFAULT_ANTHROPIC_BASE_URL.to_owned()),
                    api_key,
                }),
            ollama: OllamaSettings {
                base_url: env
                    .ollama_base_url
                    .clone()
                    .unwrap_or_else(|| DEFAULT_OLLAMA_BASE_URL.to_owned()),
                think: env.ollama_think,
            },
        }
    }
}

#[cfg(test)]
mod tests;

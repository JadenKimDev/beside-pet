use super::{AnthropicSettings, ModelRef, ModelSettings, OllamaSettings};
use crate::llm::LlmProvider;
use crate::shared::Config;

fn settings(pairs: &[(&str, &str)]) -> ModelSettings {
    let config = Config::from_lookup(|name| {
        if name == "DATABASE_URL" {
            return Some("postgres://u:p@h/db".to_owned());
        }
        if name == "APP_ENV" {
            return Some("sandbox".to_owned());
        }
        pairs
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| (*value).to_owned())
    })
    .unwrap();
    ModelSettings::from_config(&config)
}

#[test]
fn 아무것도_없으면_anthropic_의_claude_haiku_4_5_와_기본_주소다() {
    let settings = settings(&[("ANTHROPIC_API_KEY", "sk-test-fake")]);
    assert_eq!(
        settings,
        ModelSettings {
            default_model: ModelRef {
                provider: LlmProvider::Anthropic,
                model: "claude-haiku-4-5".to_owned(),
            },
            anthropic: Some(AnthropicSettings {
                base_url: "https://api.anthropic.com".to_owned(),
                api_key: "sk-test-fake".to_owned(),
            }),
            ollama: OllamaSettings {
                base_url: "http://127.0.0.1:11434".to_owned(),
                think: false,
            },
        }
    );
}

#[test]
fn llm_model_이_claude_model_보다_먼저다() {
    let only_claude = settings(&[("CLAUDE_MODEL", "claude-sonnet-5")]);
    assert_eq!(only_claude.default_model.model, "claude-sonnet-5");
    assert_eq!(only_claude.default_model.provider, LlmProvider::Anthropic);
    let both = settings(&[
        ("CLAUDE_MODEL", "claude-sonnet-5"),
        ("LLM_MODEL", "claude-opus-4-8"),
    ]);
    assert_eq!(both.default_model.model, "claude-opus-4-8");
}

#[test]
fn llm_provider_가_ollama_면_ollama_의_모델이다() {
    let settings = settings(&[("LLM_PROVIDER", "ollama"), ("LLM_MODEL", "gemma4")]);
    assert_eq!(
        settings.default_model,
        ModelRef {
            provider: LlmProvider::Ollama,
            model: "gemma4".to_owned(),
        }
    );
    assert_eq!(settings.anthropic, None);
}

#[test]
fn 주소와_생각_켜기를_설정에서_받는다() {
    let settings = settings(&[
        ("ANTHROPIC_API_KEY", "sk-test-fake"),
        ("ANTHROPIC_BASE_URL", "http://127.0.0.1:9"),
        ("OLLAMA_BASE_URL", "http://127.0.0.1:8"),
        ("OLLAMA_THINK", "true"),
    ]);
    assert_eq!(settings.anthropic.unwrap().base_url, "http://127.0.0.1:9");
    assert_eq!(
        settings.ollama,
        OllamaSettings {
            base_url: "http://127.0.0.1:8".to_owned(),
            think: true,
        }
    );
}

#[test]
fn debug_에_키를_싣지_않는다() {
    let debug = format!("{:?}", settings(&[("ANTHROPIC_API_KEY", "sk-test-fake")]));
    assert!(!debug.contains("sk-test-fake"), "{debug}");
}

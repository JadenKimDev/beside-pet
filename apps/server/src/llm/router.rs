//! 모델 라우터(`TextModel` 구현): 기본 `ModelRef` 의 공급자에 호출을 보내고, 쓴 토큰에 비용과 시각을 붙여 사용량으로 적는다.
//!
//! TS 의 `ModelRouter` 를 옮겼다. 지금 `GenerationRequest` 에는 모델 칸이 없어 생성 때 받은 기본 모델로 고른다.
//! 스트리밍은 글 조각만 밖으로 흘리고 마지막 사용량 이벤트는 싱크에 적는다.

use std::collections::HashMap;

use chrono::Utc;
use futures_util::future::{self, BoxFuture};
use futures_util::stream::{self, StreamExt};

use super::{
    AnthropicProvider, GenerationRequest, LlmProvider, ModelRef, ModelSettings, OllamaProvider,
    SharedUsageSink, StreamEvent, TextModel, TextModelProvider, TextStream, TokenUsage,
    UsageRecord, cost_usd,
};
use crate::shared::ApiError;

pub struct ModelRouter {
    default_model: ModelRef,
    providers: HashMap<LlmProvider, Box<dyn TextModelProvider>>,
    usage: SharedUsageSink,
}

impl ModelRouter {
    /// 공급자는 `provider()` 로 갈라 둔다. 같은 공급자가 둘이면 뒤의 것이 남는다.
    pub fn new(
        default_model: ModelRef,
        providers: Vec<Box<dyn TextModelProvider>>,
        usage: SharedUsageSink,
    ) -> ModelRouter {
        ModelRouter {
            default_model,
            providers: providers
                .into_iter()
                .map(|provider| (provider.provider(), provider))
                .collect(),
            usage,
        }
    }

    /// 설정이 있는 공급자만 등록한다: Anthropic 은 키가 있을 때, Ollama 는 늘.
    pub fn from_settings(settings: &ModelSettings, usage: SharedUsageSink) -> ModelRouter {
        let mut providers: Vec<Box<dyn TextModelProvider>> = vec![Box::new(OllamaProvider::new(
            settings.ollama.base_url.clone(),
            settings.ollama.think,
        ))];
        if let Some(anthropic) = &settings.anthropic {
            providers.push(Box::new(AnthropicProvider::new(
                anthropic.base_url.clone(),
                anthropic.api_key.clone(),
            )));
        }
        ModelRouter::new(settings.default_model.clone(), providers, usage)
    }

    fn resolve(&self) -> Result<&dyn TextModelProvider, ApiError> {
        let provider = self.default_model.provider;
        self.providers
            .get(&provider)
            .map(|registered| registered.as_ref())
            .ok_or_else(|| {
                tracing::error!(
                    provider = provider.as_str(),
                    "no model provider registered for the default model"
                );
                ApiError::Internal
            })
    }

    #[cfg(test)]
    fn registered(&self) -> Vec<LlmProvider> {
        self.providers.keys().copied().collect()
    }
}

/// 토큰 수에 비용과 지금 시각을 붙인다.
fn priced(provider: LlmProvider, model: &str, tokens: TokenUsage) -> UsageRecord {
    UsageRecord {
        provider,
        model: model.to_owned(),
        input_tokens: tokens.input_tokens,
        output_tokens: tokens.output_tokens,
        cost_usd: cost_usd(provider, model, tokens.input_tokens, tokens.output_tokens),
        at: Utc::now(),
    }
}

impl TextModel for ModelRouter {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        Box::pin(async move {
            let provider = self.resolve()?;
            let model = &self.default_model.model;
            let generation = provider.generate(model, request).await?;
            self.usage
                .record(priced(provider.provider(), model, generation.usage));
            Ok(generation.text)
        })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        let provider = match self.resolve() {
            Ok(provider) => provider,
            Err(error) => return Box::pin(stream::once(future::ready(Err(error)))),
        };
        let kind = provider.provider();
        let model = self.default_model.model.clone();
        let usage = self.usage.clone();
        let events = provider.stream(&model, request);
        Box::pin(events.filter_map(move |event| {
            future::ready(match event {
                Ok(StreamEvent::Text(text)) => Some(Ok(text)),
                Ok(StreamEvent::Usage(tokens)) => {
                    usage.record(priced(kind, &model, tokens));
                    None
                }
                Err(error) => Some(Err(error)),
            })
        }))
    }
}

#[cfg(test)]
mod tests;

//! 모델 라우터(`TextModel` 구현): 기본 `ModelRef` 의 공급자에 호출을 보내고, 호출 한 번마다 기록 하나를 싱크에 남긴다.
//!
//! TS 의 `ModelRouter` 를 옮겼다. 지금 `GenerationRequest` 에는 모델 칸이 없어 생성 때 받은 기본 모델로 고른다.
//! 성공, 실패, 시간 제한, 부른 쪽이 버린 호출 모두 기록이 남는다. 스트리밍은 글 조각만 밖으로 흘리고 사용량 이벤트는 기록에 싣는다.
//! 시간 제한은 계량기와 같은 자리에서 둘러야 제한을 넘긴 것(`timeout`)과 부른 쪽이 버린 것(`cancelled`)이 갈린다.

mod limits;
mod meter;

use std::collections::HashMap;

use futures_util::future::{self, BoxFuture};
use futures_util::stream::{self, StreamExt};

use self::limits::log_timeout;
pub use self::limits::{CallLimits, GENERATE_LIMIT, STREAM_IDLE_LIMIT};
use self::meter::CallMeter;
use super::{
    AnthropicProvider, CallContext, CallErrorKind, GenerationRequest, LlmProvider, ModelRef,
    ModelSettings, OllamaProvider, SharedUsageSink, StreamEvent, TextModel, TextModelProvider,
    TextStream,
};
use crate::shared::ApiError;

pub struct ModelRouter {
    default_model: ModelRef,
    providers: HashMap<LlmProvider, Box<dyn TextModelProvider>>,
    usage: SharedUsageSink,
    limits: CallLimits,
}

impl ModelRouter {
    /// 공급자는 `provider()` 로 갈라 둔다. 같은 공급자가 둘이면 뒤의 것이 남는다. 한도는 기본값(`CallLimits::default()`)이다.
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
            limits: CallLimits::default(),
        }
    }

    /// 시간 제한을 바꾼다.
    pub fn with_limits(mut self, limits: CallLimits) -> ModelRouter {
        self.limits = limits;
        self
    }

    pub fn limits(&self) -> CallLimits {
        self.limits
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

impl ModelRouter {
    fn meter(&self, provider: LlmProvider, context: &CallContext) -> CallMeter {
        CallMeter::start(
            self.usage.clone(),
            provider,
            &self.default_model.model,
            context.clone(),
        )
    }

    /// 공급자를 찾지 못한 호출도 기록으로 남긴다.
    fn resolve_metered(
        &self,
        context: &CallContext,
    ) -> Result<(&dyn TextModelProvider, CallMeter), ApiError> {
        match self.resolve() {
            Ok(provider) => Ok((provider, self.meter(provider.provider(), context))),
            Err(error) => {
                self.meter(self.default_model.provider, context)
                    .fail(CallErrorKind::Unavailable);
                Err(error)
            }
        }
    }
}

impl TextModel for ModelRouter {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        Box::pin(async move {
            let (provider, mut meter) = self.resolve_metered(&request.context)?;
            let limit = self.limits.generate;
            // 이 future 가 끝나기 전에 버려지면 `meter` 가 취소로 남긴다.
            let call = provider.generate(&self.default_model.model, request);
            let Ok(result) = tokio::time::timeout(limit, call).await else {
                log_timeout("generate", limit);
                meter.fail(CallErrorKind::Timeout);
                return Err(ApiError::Internal);
            };
            match result {
                Ok(generation) => {
                    meter.usage(generation.usage);
                    meter.succeed();
                    Ok(generation.text)
                }
                Err(error) => {
                    meter.fail(CallErrorKind::Provider);
                    Err(error)
                }
            }
        })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        let (provider, meter) = match self.resolve_metered(&request.context) {
            Ok(found) => found,
            Err(error) => return Box::pin(stream::once(future::ready(Err(error)))),
        };
        let events = provider.stream(&self.default_model.model, request);
        let idle = self.limits.stream_idle;
        // 상태: 남은 이벤트와 계량기. 오류, 제한, 끝에서 계량기를 닫고 `None` 으로 멈춘다. 중간에 버려지면 계량기가 취소로 남긴다.
        Box::pin(stream::unfold(
            Some((events, meter)),
            move |state| async move {
                let (mut events, mut meter) = state?;
                loop {
                    let Ok(event) = tokio::time::timeout(idle, events.next()).await else {
                        log_timeout("stream", idle);
                        meter.fail(CallErrorKind::Timeout);
                        return Some((Err(ApiError::Internal), None));
                    };
                    match event {
                        Some(Ok(StreamEvent::Text(text))) => {
                            meter.token();
                            return Some((Ok(text), Some((events, meter))));
                        }
                        Some(Ok(StreamEvent::Usage(tokens))) => meter.usage(tokens),
                        Some(Err(error)) => {
                            meter.fail(CallErrorKind::Provider);
                            return Some((Err(error), None));
                        }
                        None => {
                            meter.succeed();
                            return None;
                        }
                    }
                }
            },
        ))
    }
}

#[cfg(test)]
mod tests;

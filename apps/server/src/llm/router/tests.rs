//! 라우터 테스트. 공급자는 정해 둔 결과와 이벤트를 내는 더블이고, 싱크는 메모리 구현이다. 값은 지어냈다.

use std::sync::{Arc, Mutex};

use chrono::Utc;
use futures_util::StreamExt;
use futures_util::future::BoxFuture;
use futures_util::stream;

use super::ModelRouter;
use crate::llm::{
    AnthropicSettings, Generation, GenerationRequest, InMemoryUsageSink, LlmProvider, ModelRef,
    ModelSettings, OllamaSettings, PromptMessage, PromptRole, ProviderStream, StreamEvent,
    TextModel, TextModelProvider, TokenUsage, UsageRecord,
};
use crate::shared::ApiError;

/// 정해 둔 결과를 내고 불린 모델 이름을 적어 두는 공급자.
struct FakeProvider {
    provider: LlmProvider,
    generation: Result<Generation, ApiError>,
    events: Vec<Result<StreamEvent, ApiError>>,
    models: Arc<Mutex<Vec<String>>>,
}

impl FakeProvider {
    fn new(provider: LlmProvider) -> FakeProvider {
        FakeProvider {
            provider,
            generation: Ok(Generation {
                text: "가짜 답".to_owned(),
                usage: TokenUsage {
                    input_tokens: 2_000,
                    output_tokens: 300,
                },
            }),
            events: vec![
                Ok(StreamEvent::Text("가짜 ".to_owned())),
                Ok(StreamEvent::Text("조각".to_owned())),
                Ok(StreamEvent::Usage(TokenUsage {
                    input_tokens: 1_000_000,
                    output_tokens: 0,
                })),
            ],
            models: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl TextModelProvider for FakeProvider {
    fn provider(&self) -> LlmProvider {
        self.provider
    }

    fn generate(
        &self,
        model: &str,
        _request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        self.models.lock().unwrap().push(model.to_owned());
        let generation = self.generation.clone();
        Box::pin(async move { generation })
    }

    fn stream(&self, model: &str, _request: GenerationRequest) -> ProviderStream {
        self.models.lock().unwrap().push(model.to_owned());
        Box::pin(stream::iter(self.events.clone()))
    }
}

fn request() -> GenerationRequest {
    GenerationRequest {
        system: Some("가짜 시스템 글".to_owned()),
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: "가짜 질문".to_owned(),
        }],
        max_tokens: 64,
    }
}

fn haiku() -> ModelRef {
    ModelRef {
        provider: LlmProvider::Anthropic,
        model: "claude-haiku-4-5".to_owned(),
    }
}

fn router_with(
    default_model: ModelRef,
    providers: Vec<FakeProvider>,
) -> (ModelRouter, Arc<InMemoryUsageSink>) {
    let sink = Arc::new(InMemoryUsageSink::default());
    let boxed = providers
        .into_iter()
        .map(|p| Box::new(p) as Box<dyn TextModelProvider>)
        .collect();
    (ModelRouter::new(default_model, boxed, sink.clone()), sink)
}

#[tokio::test]
async fn generate_는_기본_모델의_공급자를_불러_글을_돌려주고_사용량을_적는다() {
    let anthropic = FakeProvider::new(LlmProvider::Anthropic);
    let anthropic_models = anthropic.models.clone();
    let ollama = FakeProvider::new(LlmProvider::Ollama);
    let ollama_models = ollama.models.clone();
    let (router, sink) = router_with(haiku(), vec![ollama, anthropic]);

    let before = Utc::now();
    assert_eq!(router.generate(request()).await, Ok("가짜 답".to_owned()));
    let after = Utc::now();

    assert_eq!(*anthropic_models.lock().unwrap(), vec!["claude-haiku-4-5"]);
    assert!(ollama_models.lock().unwrap().is_empty());
    let records = sink.list();
    assert_eq!(records.len(), 1);
    let UsageRecord {
        provider,
        model,
        input_tokens,
        output_tokens,
        cost_usd,
        at,
    } = records[0].clone();
    assert_eq!(provider, LlmProvider::Anthropic);
    assert_eq!(model, "claude-haiku-4-5");
    assert_eq!((input_tokens, output_tokens), (2_000, 300));
    assert!((cost_usd - 0.0035).abs() < 1e-12, "{cost_usd}");
    assert!(before <= at && at <= after);
}

#[tokio::test]
async fn stream_은_글_조각만_순서대로_흘리고_사용량은_싱크에_한_번_적는다() {
    let (router, sink) = router_with(haiku(), vec![FakeProvider::new(LlmProvider::Anthropic)]);
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Ok("가짜 ".to_owned()), Ok("조각".to_owned())]);
    let records = sink.list();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].input_tokens, 1_000_000);
    assert!((records[0].cost_usd - 1.0).abs() < 1e-12);
}

#[tokio::test]
async fn ollama_의_사용량은_비용_0_으로_적는다() {
    let gemma = ModelRef {
        provider: LlmProvider::Ollama,
        model: "gemma4".to_owned(),
    };
    let (router, sink) = router_with(gemma, vec![FakeProvider::new(LlmProvider::Ollama)]);
    router.generate(request()).await.unwrap();
    let records = sink.list();
    assert_eq!(records[0].provider, LlmProvider::Ollama);
    assert_eq!(records[0].model, "gemma4");
    assert_eq!(records[0].cost_usd, 0.0);
}

#[tokio::test]
async fn 공급자가_실패하면_오류를_올리고_사용량을_적지_않는다() {
    let mut failing = FakeProvider::new(LlmProvider::Anthropic);
    failing.generation = Err(ApiError::Internal);
    failing.events = vec![
        Ok(StreamEvent::Text("앞".to_owned())),
        Err(ApiError::Internal),
    ];
    let (router, sink) = router_with(haiku(), vec![failing]);
    assert_eq!(router.generate(request()).await, Err(ApiError::Internal));
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Ok("앞".to_owned()), Err(ApiError::Internal)]);
    assert!(sink.list().is_empty());
}

#[tokio::test]
async fn 기본_공급자가_등록되지_않았으면_500_이다() {
    let (router, sink) = router_with(haiku(), vec![FakeProvider::new(LlmProvider::Ollama)]);
    assert_eq!(router.generate(request()).await, Err(ApiError::Internal));
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Err(ApiError::Internal)]);
    assert!(sink.list().is_empty());
}

fn settings(default_model: ModelRef, with_key: bool) -> ModelSettings {
    ModelSettings {
        default_model,
        anthropic: with_key.then(|| AnthropicSettings {
            base_url: "http://127.0.0.1:9".to_owned(),
            api_key: "sk-test-fake".to_owned(),
        }),
        ollama: OllamaSettings {
            base_url: "http://127.0.0.1:9".to_owned(),
            think: false,
        },
    }
}

#[test]
fn 설정에서_키가_있으면_anthropic_을_늘_ollama_를_등록한다() {
    let sink = Arc::new(InMemoryUsageSink::default());
    let mut with_key =
        ModelRouter::from_settings(&settings(haiku(), true), sink.clone()).registered();
    with_key.sort_by_key(|p| p.as_str());
    assert_eq!(with_key, vec![LlmProvider::Anthropic, LlmProvider::Ollama]);

    let gemma = ModelRef {
        provider: LlmProvider::Ollama,
        model: "gemma4".to_owned(),
    };
    let without_key = ModelRouter::from_settings(&settings(gemma, false), sink).registered();
    assert_eq!(without_key, vec![LlmProvider::Ollama]);
}

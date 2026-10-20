//! 라우터 테스트: 호출 한 번이 성공, 실패, 버려짐의 어느 쪽이든 기록 하나를 남기는가. 공급자는 정해 둔 결과와 이벤트를 내는
//! 더블이고, 싱크는 메모리 구현이다. 값은 지어냈다.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use chrono::Utc;
use futures_util::StreamExt;
use futures_util::future::{self, BoxFuture};
use futures_util::stream;

use super::ModelRouter;
use crate::llm::{
    AnthropicSettings, CallContext, CallErrorKind, CallOutcome, CallPurpose, CallRecord,
    Generation, GenerationRequest, InMemoryUsageSink, LlmProvider, ModelRef, ModelSettings,
    OllamaSettings, PromptMessage, PromptRole, ProviderStream, StreamEvent, TextModel,
    TextModelProvider, TokenUsage,
};
use crate::shared::ApiError;

/// 정해 둔 결과를 내고 불린 모델 이름을 적어 두는 공급자.
struct FakeProvider {
    provider: LlmProvider,
    generation: Result<Generation, ApiError>,
    events: Vec<Result<StreamEvent, ApiError>>,
    /// 첫 글 조각을 내기 전에 기다리는 시간.
    first_delay: Duration,
    /// `generate` 가 답하지 않는다.
    generate_hangs: bool,
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
            first_delay: Duration::ZERO,
            generate_hangs: false,
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
        if self.generate_hangs {
            return Box::pin(future::pending());
        }
        let generation = self.generation.clone();
        Box::pin(async move { generation })
    }

    fn stream(&self, model: &str, _request: GenerationRequest) -> ProviderStream {
        self.models.lock().unwrap().push(model.to_owned());
        let delay = self.first_delay;
        let first = stream::once(async move {
            tokio::time::sleep(delay).await;
        })
        .filter_map(|()| async { None });
        Box::pin(first.chain(stream::iter(self.events.clone())))
    }
}

fn context() -> CallContext {
    CallContext {
        purpose: CallPurpose::Reply,
        prompt_version: "9.8.7",
        session_id: Some("session-fake".to_owned()),
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
        context: context(),
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

fn only_record(sink: &InMemoryUsageSink) -> CallRecord {
    let records = sink.list();
    assert_eq!(records.len(), 1, "{records:?}");
    records[0].clone()
}

#[tokio::test]
async fn generate_는_기본_모델의_공급자를_불러_글을_돌려주고_맥락과_토큰과_시간을_적는다() {
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
    let CallRecord {
        provider,
        model,
        purpose,
        prompt_version,
        session_id,
        input_tokens,
        output_tokens,
        duration_ms,
        first_token_ms,
        outcome,
        at,
    } = only_record(&sink);
    assert_eq!(provider, LlmProvider::Anthropic);
    assert_eq!(model, "claude-haiku-4-5");
    assert_eq!(purpose, CallPurpose::Reply);
    assert_eq!(prompt_version, "9.8.7");
    assert_eq!(session_id.as_deref(), Some("session-fake"));
    assert_eq!((input_tokens, output_tokens), (Some(2_000), Some(300)));
    assert!(duration_ms < 5_000, "{duration_ms}");
    assert_eq!(first_token_ms, None, "generate 에는 첫 글자 시간이 없다");
    assert_eq!(outcome, CallOutcome::Ok);
    assert!(before <= at && at <= after);
}

#[tokio::test]
async fn stream_은_글_조각만_순서대로_흘리고_끝날_때_기록을_한_번_적는다() {
    let mut slow = FakeProvider::new(LlmProvider::Anthropic);
    slow.first_delay = Duration::from_millis(30);
    let (router, sink) = router_with(haiku(), vec![slow]);
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Ok("가짜 ".to_owned()), Ok("조각".to_owned())]);
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Ok);
    assert_eq!(
        (record.input_tokens, record.output_tokens),
        (Some(1_000_000), Some(0))
    );
    assert_eq!(record.purpose, CallPurpose::Reply);
    let first = record.first_token_ms.expect("첫 글자 시간이 있다");
    assert!(first >= 30, "{first}");
    assert!(record.duration_ms >= first, "{record:?}");
}

#[tokio::test]
async fn ollama_의_호출도_공급자와_모델을_그대로_적는다() {
    let gemma = ModelRef {
        provider: LlmProvider::Ollama,
        model: "gemma4".to_owned(),
    };
    let (router, sink) = router_with(gemma, vec![FakeProvider::new(LlmProvider::Ollama)]);
    router.generate(request()).await.unwrap();
    let record = only_record(&sink);
    assert_eq!(record.provider, LlmProvider::Ollama);
    assert_eq!(record.model, "gemma4");
}

#[tokio::test]
async fn generate_가_실패하면_오류를_올리고_토큰_없이_공급자_오류로_적는다() {
    let mut failing = FakeProvider::new(LlmProvider::Anthropic);
    failing.generation = Err(ApiError::Internal);
    let (router, sink) = router_with(haiku(), vec![failing]);
    assert_eq!(router.generate(request()).await, Err(ApiError::Internal));
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Error(CallErrorKind::Provider));
    assert_eq!((record.input_tokens, record.output_tokens), (None, None));
    assert_eq!(record.session_id.as_deref(), Some("session-fake"));
}

#[tokio::test]
async fn stream_이_중간에_실패하면_오류를_흘리고_실패를_한_번_적는다() {
    let mut failing = FakeProvider::new(LlmProvider::Anthropic);
    failing.events = vec![
        Ok(StreamEvent::Text("앞".to_owned())),
        Err(ApiError::Internal),
        Ok(StreamEvent::Text("뒤".to_owned())),
    ];
    let (router, sink) = router_with(haiku(), vec![failing]);
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Ok("앞".to_owned()), Err(ApiError::Internal)]);
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Error(CallErrorKind::Provider));
    assert_eq!((record.input_tokens, record.output_tokens), (None, None));
    assert!(record.first_token_ms.is_some());
}

#[tokio::test]
async fn stream_이_사용량_없이_끝나도_토큰_없이_성공을_한_번_적는다() {
    let mut quiet = FakeProvider::new(LlmProvider::Anthropic);
    quiet.events = vec![Ok(StreamEvent::Text("조각".to_owned()))];
    let (router, sink) = router_with(haiku(), vec![quiet]);
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Ok("조각".to_owned())]);
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Ok);
    assert_eq!((record.input_tokens, record.output_tokens), (None, None));
}

#[tokio::test]
async fn 부른_쪽이_generate_를_기다리다_버리면_취소로_한_번_적는다() {
    let mut hanging = FakeProvider::new(LlmProvider::Anthropic);
    hanging.generate_hangs = true;
    let (router, sink) = router_with(haiku(), vec![hanging]);
    let waited = tokio::time::timeout(Duration::from_millis(20), router.generate(request())).await;
    assert!(waited.is_err(), "공급자가 답하지 않는다");
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Error(CallErrorKind::Cancelled));
    assert_eq!((record.input_tokens, record.output_tokens), (None, None));
    assert!(record.duration_ms >= 20, "{record:?}");
}

#[tokio::test]
async fn 부른_쪽이_stream_을_중간에_버리면_취소로_한_번_적는다() {
    let (router, sink) = router_with(haiku(), vec![FakeProvider::new(LlmProvider::Anthropic)]);
    let mut chunks = router.stream(request());
    assert_eq!(chunks.next().await, Some(Ok("가짜 ".to_owned())));
    assert!(sink.list().is_empty(), "끝나기 전에는 적지 않는다");
    drop(chunks);
    let record = only_record(&sink);
    assert_eq!(record.outcome, CallOutcome::Error(CallErrorKind::Cancelled));
    assert!(record.first_token_ms.is_some());
}

#[tokio::test]
async fn 기본_공급자가_등록되지_않았으면_500_이고_없는_공급자로_적는다() {
    let (router, sink) = router_with(haiku(), vec![FakeProvider::new(LlmProvider::Ollama)]);
    assert_eq!(router.generate(request()).await, Err(ApiError::Internal));
    let items: Vec<_> = router.stream(request()).collect().await;
    assert_eq!(items, vec![Err(ApiError::Internal)]);
    let records = sink.list();
    assert_eq!(records.len(), 2, "{records:?}");
    for record in records {
        assert_eq!(record.provider, LlmProvider::Anthropic);
        assert_eq!(record.model, "claude-haiku-4-5");
        assert_eq!(
            record.outcome,
            CallOutcome::Error(CallErrorKind::Unavailable)
        );
    }
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

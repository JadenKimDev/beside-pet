//! 모델 호출의 관문(`TextModel` trait)과 그 구현(공급자를 고르는 라우터, 호출 기록, 기본 모델 설정).
//! 단가와 비용은 맡지 않는다(DB 의 단가 테이블과 뷰가 맡는다).
//! 프롬프트의 내용은 맡지 않는다. 환경 변수는 읽지 않고 `Config` 가 읽은 값을 받는다.

mod provider;
mod router;
mod settings;
mod text_model;
mod usage;

pub use provider::{
    AnthropicProvider, Generation, LlmProvider, OllamaProvider, ProviderStream, StreamEvent,
    TextModelProvider, TokenUsage,
};
pub use router::ModelRouter;
pub use settings::{AnthropicSettings, ModelRef, ModelSettings, OllamaSettings};
pub use text_model::{
    CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole, SharedTextModel,
    TextModel, TextStream, Unimplemented,
};
pub use usage::{
    CallErrorKind, CallOutcome, CallRecord, InMemoryUsageSink, PostgresUsageSink, SharedUsageSink,
    UsageSink,
};

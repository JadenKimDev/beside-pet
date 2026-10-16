//! 모델 공급자의 계약(`TextModelProvider` trait)과 공급자가 라우터에 넘기는 결과·스트림 이벤트의 모양.
//!
//! TS 의 `TextModelProvider`·`StreamEvent` 를 옮겼다. 공급자는 토큰 수만 돌려주고, 비용과 시각을 붙여
//! 사용량으로 적는 것은 라우터의 몫이다. 요청 모양(HTTP 본문)은 공급자 파일만 안다.

mod anthropic;
mod ollama;
mod wire;

use futures_util::future::BoxFuture;
use futures_util::stream::BoxStream;

use super::GenerationRequest;
use crate::shared::ApiError;

pub use anthropic::AnthropicProvider;
pub use ollama::OllamaProvider;

/// 연결된 모델 공급자.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum LlmProvider {
    Anthropic,
    Ollama,
}

impl LlmProvider {
    /// 환경 변수(`LLM_PROVIDER`)와 로그에 쓰는 이름.
    pub fn as_str(self) -> &'static str {
        match self {
            LlmProvider::Anthropic => "anthropic",
            LlmProvider::Ollama => "ollama",
        }
    }

    /// `as_str` 의 거꾸로. 모르는 이름이면 `None`.
    pub fn parse(name: &str) -> Option<LlmProvider> {
        match name {
            "anthropic" => Some(LlmProvider::Anthropic),
            "ollama" => Some(LlmProvider::Ollama),
            _ => None,
        }
    }
}

/// 호출 한 번이 쓴 토큰 수.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// 끝난 생성 한 번: 글과 토큰 수.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Generation {
    pub text: String,
    pub usage: TokenUsage,
}

/// 스트리밍 생성이 내는 것: 글 조각들, 그리고 맨 끝에 토큰 수 한 건.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamEvent {
    Text(String),
    Usage(TokenUsage),
}

/// 오류가 나면 그 뒤로는 흘리지 않는다. 정상이면 마지막 항목이 `StreamEvent::Usage` 다.
pub type ProviderStream = BoxStream<'static, Result<StreamEvent, ApiError>>;

/// 공급자 하나. 모델 이름은 호출마다 받는다(같은 공급자의 여러 모델을 한 구현이 부른다).
/// 호출 실패(연결, 상태 코드, 빈 답, 읽을 수 없는 응답)는 원인을 로그에 남기고 `ApiError::Internal` 로 올린다.
pub trait TextModelProvider: Send + Sync {
    fn provider(&self) -> LlmProvider;
    fn generate(
        &self,
        model: &str,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>>;
    fn stream(&self, model: &str, request: GenerationRequest) -> ProviderStream;
}

#[cfg(test)]
mod tests;

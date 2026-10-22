//! 글을 만드는 모델의 관문(`TextModel` trait)과 그 요청 모양, 아직 구현이 없는 `Unimplemented`.
//!
//! TS 의 `TextModelPort` 를 최소로 옮겼다. 어떤 공급자와 모델을 쓰는지는 구현의 몫이라 요청에 싣지 않는다(ADR-0010).
//! 요청은 호출 맥락(역할, 프롬프트 버전, 세션 id)을 함께 실어, 구현이 호출 기록을 그 맥락으로 남기게 한다.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use futures_util::stream::{self, BoxStream};

use crate::shared::ApiError;

/// 대화 한 줄의 말한 쪽.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptMessage {
    pub role: PromptRole,
    pub text: String,
}

/// 호출이 무엇을 위한 것인가.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CallPurpose {
    /// 대화의 발화(첫 인사 포함).
    Reply,
    /// 위기 판정.
    Crisis,
    /// 마음 리포트.
    Report,
    /// 답의 상투성 판정(ADR-0031).
    Judge,
    /// 장기기억 추출(ADR-0034).
    MemoryExtract,
}

impl CallPurpose {
    pub fn as_str(self) -> &'static str {
        match self {
            CallPurpose::Reply => "reply",
            CallPurpose::Crisis => "crisis",
            CallPurpose::Report => "report",
            CallPurpose::Judge => "judge",
            CallPurpose::MemoryExtract => "memory_extract",
        }
    }
}

/// 호출 맥락: 부르는 쪽이 채운다. 본문은 싣지 않는다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallContext {
    pub purpose: CallPurpose,
    /// 그 역할 프롬프트 모듈의 버전 상수(`x.y.z`).
    pub prompt_version: &'static str,
    pub session_id: Option<String>,
}

/// 생성 한 번의 요청.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GenerationRequest {
    pub system: Option<String>,
    pub messages: Vec<PromptMessage>,
    pub max_tokens: u32,
    pub context: CallContext,
}

/// 답이 따라야 할 JSON 스키마(JSON 글 그대로). 지원하는 공급자(Anthropic)만 요청에 싣고, 나머지는 보지 않는다.
/// 그래서 부르는 쪽은 지시문으로도 JSON 만 달라고 하고 받은 글을 스스로 읽어야 한다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputSchema(pub String);

/// 생성된 글을 조각으로 흘린다. 오류가 나면 그 뒤로는 흘리지 않는다.
pub type TextStream = BoxStream<'static, Result<String, ApiError>>;

pub trait TextModel {
    /// 글 전체를 한 번에 만든다.
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>>;
    /// 글을 조각으로 흘린다.
    fn stream(&self, request: GenerationRequest) -> TextStream;
    /// 글 전체를 한 번에 만들되 답을 `schema` 의 JSON 으로 묶을 수 있는 공급자에는 그렇게 묶는다.
    /// 기본은 스키마를 버리고 `generate` 와 같다.
    fn generate_structured(
        &self,
        request: GenerationRequest,
        schema: OutputSchema,
    ) -> BoxFuture<'_, Result<String, ApiError>> {
        let _ = schema;
        self.generate(request)
    }
}

pub type SharedTextModel = Arc<dyn TextModel + Send + Sync>;

/// 아직 모델이 없다: 모든 호출이 `501 Not implemented`.
#[derive(Debug, Clone, Copy, Default)]
pub struct Unimplemented;

impl TextModel for Unimplemented {
    fn generate(&self, _request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        Box::pin(async { Err(ApiError::NotImplemented) })
    }

    fn stream(&self, _request: GenerationRequest) -> TextStream {
        Box::pin(stream::once(async { Err(ApiError::NotImplemented) }))
    }
}

#[cfg(test)]
mod tests;

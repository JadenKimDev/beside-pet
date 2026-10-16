//! 글을 만드는 모델의 관문(`TextModel` trait)과 그 요청 모양, 아직 구현이 없는 `Unimplemented`.
//!
//! TS 의 `TextModelPort` 를 최소로 옮겼다. 어떤 공급자와 모델을 쓰는지, 사용량을 어떻게 적는지는 구현의 몫이라
//! 요청에 싣지 않는다(ADR-0010, 모델 PRD 가 정한다).

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

/// 생성 한 번의 요청.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GenerationRequest {
    pub system: Option<String>,
    pub messages: Vec<PromptMessage>,
    pub max_tokens: u32,
}

/// 생성된 글을 조각으로 흘린다. 오류가 나면 그 뒤로는 흘리지 않는다.
pub type TextStream = BoxStream<'static, Result<String, ApiError>>;

pub trait TextModel {
    /// 글 전체를 한 번에 만든다.
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>>;
    /// 글을 조각으로 흘린다.
    fn stream(&self, request: GenerationRequest) -> TextStream;
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

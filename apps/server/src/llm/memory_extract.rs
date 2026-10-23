//! 기억 추출의 구현: 사용자 발화 하나에서 오래 남길 사실을 기존 `TextModel` 에 JSON 으로 묻고 그 답을 읽는다(ADR-0034).
//!
//! `support` 의 trait 와 게이트는 모른다. 받은 값은 걸러지지 않은 그대로 내고, 거르기는 `support` 의 게이트가 한다.
//! 두 공급자(Anthropic 의 structured outputs, Claude Code 의 `--json-schema`) 모두 답을 스키마로 묶는다.
//! 읽지 못한 답은 추출 없음이다. 본문은 로그와 오류에 싣지 않는다.

mod parse;
mod prompt;

use std::fmt;

pub use prompt::MEMORY_EXTRACT_PROMPT_VERSION;

use crate::llm::{
    CallContext, CallPurpose, GenerationRequest, OutputSchema, PromptMessage, PromptRole,
    SharedTextModel,
};
use crate::shared::ApiError;

/// 사실 몇 개의 JSON 이면 된다. 넘쳐서 잘린 답은 읽지 못해 추출 없음이 된다.
const MAX_TOKENS: u32 = 1024;

/// 알려진 아이 한 마리. 상태는 `deceased` | `living`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnownPet {
    pub name: String,
    pub status: &'static str,
}

/// 지금 유효한 사실 하나. 입력 글에서 목록 순서대로 `[1]`, `[2]`… 번호가 붙고, 모델은 정정을 그 번호로 가리킨다.
#[derive(Clone, PartialEq, Eq)]
pub struct KnownFact {
    pub kind: &'static str,
    pub pet_name: Option<String>,
    pub text: String,
}

impl fmt::Debug for KnownFact {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KnownFact")
            .field("kind", &self.kind)
            .field("text_chars", &self.text.chars().count())
            .finish()
    }
}

/// 추출 한 번의 입력. 동반자의 말은 받지 않는다. 본문이라 `Debug` 에는 길이만 싣는다.
#[derive(Clone, PartialEq, Eq)]
pub struct MemoryExtractRequest {
    /// 고를 수 있는 종류(스키마의 enum). 부르는 쪽의 닫힌 목록을 그대로 넘긴다.
    pub kinds: Vec<&'static str>,
    pub pets: Vec<KnownPet>,
    pub facts: Vec<KnownFact>,
    /// 이번 사용자 발화와 그 seq.
    pub utterance: String,
    pub seq: i32,
    /// 세션 언어(`ko`, `en`). 사실의 글을 이 언어로 쓰게 한다.
    pub language: String,
    /// 호출 기록에 남길 세션.
    pub session_id: Option<String>,
}

impl fmt::Debug for MemoryExtractRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MemoryExtractRequest")
            .field("pets", &self.pets.len())
            .field("facts", &self.facts.len())
            .field("utterance_chars", &self.utterance.chars().count())
            .field("seq", &self.seq)
            .field("language", &self.language)
            .finish()
    }
}

/// 모델이 뽑은 사실 하나(걸러지지 않음). `supersedes` 는 이 사실이 정정하는 `facts` 의 번호(1부터)이고 범위는 보지 않는다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryFact {
    pub kind: String,
    pub pet_name: Option<String>,
    pub text: String,
    pub seq: i32,
    pub supersedes: Vec<i32>,
}

/// 모델의 답. 읽지 못했으면 비어 있다(`Default`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExtractedMemory {
    pub facts: Vec<MemoryFact>,
    pub do_not_remember: bool,
}

/// 모델을 부르지 못한 이유. 종류만 갖는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractFailure {
    /// 시간 제한을 넘겼다.
    Timeout,
    /// 모델에 닿지 못했거나 오류로 끝났다.
    Unavailable,
}

pub struct MemoryExtract {
    model: SharedTextModel,
}

impl MemoryExtract {
    pub fn new(model: SharedTextModel) -> MemoryExtract {
        MemoryExtract { model }
    }

    /// 발화 하나에서 사실을 뽑는다. 답을 읽지 못하면 빈 추출이고, 호출이 실패해야 `Err` 다.
    pub async fn extract(
        &self,
        request: MemoryExtractRequest,
    ) -> Result<ExtractedMemory, ExtractFailure> {
        let generation = GenerationRequest {
            system: Some(prompt::SYSTEM_PROMPT.to_owned()),
            messages: vec![PromptMessage {
                role: PromptRole::User,
                text: prompt::user_prompt(&request),
            }],
            max_tokens: MAX_TOKENS,
            context: CallContext {
                purpose: CallPurpose::MemoryExtract,
                prompt_version: MEMORY_EXTRACT_PROMPT_VERSION,
                session_id: request.session_id.clone(),
            },
        };
        let schema = OutputSchema(prompt::output_schema(&request.kinds));
        let text = self
            .model
            .generate_structured(generation, schema)
            .await
            .map_err(|error| match error {
                ApiError::ModelTimeout => ExtractFailure::Timeout,
                _ => ExtractFailure::Unavailable,
            })?;
        let extracted = parse::parse_extraction(&text);
        if extracted.is_none() {
            tracing::warn!(
                prompt_version = MEMORY_EXTRACT_PROMPT_VERSION,
                answer_chars = text.chars().count(),
                "memory extraction answer unreadable"
            );
        }
        Ok(extracted.unwrap_or_default())
    }
}

#[cfg(test)]
mod tests;

//! 기억 추출의 경계: 사용자 발화 하나에서 사실을 뽑는 trait 와 그 입력, 그리고 `llm` 의 구현을 잇는 어댑터.
//! 뽑은 것은 걸러지지 않은 `Extraction` 이고, 게이트와 저장은 맡지 않는다. 어느 구현을 끼울지는 `app.rs` 가 정한다.

use std::fmt;
use std::sync::Arc;

use futures_util::future::BoxFuture;

use super::{ExtractedFact, Extraction, MemoryView, NoteKind};
use crate::llm::{
    ExtractFailure, ExtractedMemory, KnownFact, KnownPet, MemoryExtract, MemoryExtractRequest,
};

/// 추출 한 번의 입력: 소유자의 현재 기억, 이번 사용자 발화와 그 seq, 세션 언어. 동반자의 말은 받지 않는다.
#[derive(Clone, Copy)]
pub struct ExtractInput<'a> {
    pub view: &'a MemoryView,
    pub utterance: &'a str,
    pub seq: i32,
    /// 세션 언어(`ko`, `en`).
    pub language: &'a str,
    /// 호출 기록에 남길 세션.
    pub session_id: &'a str,
}

impl fmt::Debug for ExtractInput<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ExtractInput")
            .field("pets", &self.view.pets.len())
            .field("notes", &self.view.notes.len())
            .field("utterance_chars", &self.utterance.chars().count())
            .field("seq", &self.seq)
            .field("language", &self.language)
            .finish()
    }
}

/// 추출하지 못한 이유. 종류만 갖고 본문은 싣지 않는다(로그에 그대로 적어도 된다).
/// 답을 읽지 못한 것은 오류가 아니라 빈 추출이다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExtractError {
    /// 시간 제한을 넘겼다.
    Timeout,
    /// 모델에 닿지 못했거나 오류로 끝났다.
    Unavailable,
}

impl fmt::Display for ExtractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            ExtractError::Timeout => "memory extraction timed out",
            ExtractError::Unavailable => "memory extraction unavailable",
        })
    }
}

impl std::error::Error for ExtractError {}

/// 발화 하나에서 사실을 뽑는다. 실패해도 대화는 이어진다.
pub trait MemoryExtractor {
    fn extract<'a>(
        &'a self,
        input: ExtractInput<'a>,
    ) -> BoxFuture<'a, Result<Extraction, ExtractError>>;
}

pub type SharedMemoryExtractor = Arc<dyn MemoryExtractor + Send + Sync>;

/// `llm` 의 글 모델 추출을 `MemoryExtractor` 에 잇는다.
pub struct ModelMemoryExtractor(pub MemoryExtract);

impl MemoryExtractor for ModelMemoryExtractor {
    fn extract<'a>(
        &'a self,
        input: ExtractInput<'a>,
    ) -> BoxFuture<'a, Result<Extraction, ExtractError>> {
        let request = request_of(input);
        Box::pin(async move {
            let extracted = self.0.extract(request).await.map_err(error_of)?;
            Ok(extraction_of(extracted))
        })
    }
}

/// 현재 기억을 모델이 읽을 모양으로: 아이는 이름과 상태, 사실은 seq·종류·아이 이름·글.
fn request_of(input: ExtractInput<'_>) -> MemoryExtractRequest {
    let view = input.view;
    let pet_name = |pet_id: &Option<String>| {
        pet_id.as_ref().and_then(|id| {
            view.pets
                .iter()
                .find(|pet| &pet.id == id)
                .map(|pet| pet.name.clone())
        })
    };
    MemoryExtractRequest {
        kinds: NoteKind::ALL.iter().map(|kind| kind.as_str()).collect(),
        pets: view
            .pets
            .iter()
            .map(|pet| KnownPet {
                name: pet.name.clone(),
                status: pet.status.as_str(),
            })
            .collect(),
        facts: view
            .notes
            .iter()
            .map(|note| KnownFact {
                seq: note.seq,
                kind: note.kind.as_str(),
                pet_name: pet_name(&note.pet_id),
                text: note.text.clone(),
            })
            .collect(),
        utterance: input.utterance.to_owned(),
        seq: input.seq,
        language: input.language.to_owned(),
        session_id: Some(input.session_id.to_owned()),
    }
}

fn extraction_of(extracted: ExtractedMemory) -> Extraction {
    Extraction {
        facts: extracted
            .facts
            .into_iter()
            .map(|fact| ExtractedFact {
                kind: fact.kind,
                pet_name: fact.pet_name,
                text: fact.text,
                seq: fact.seq,
                supersedes_seq: fact.supersedes_seq,
            })
            .collect(),
        do_not_remember: extracted.do_not_remember,
    }
}

fn error_of(failure: ExtractFailure) -> ExtractError {
    match failure {
        ExtractFailure::Timeout => ExtractError::Timeout,
        ExtractFailure::Unavailable => ExtractError::Unavailable,
    }
}

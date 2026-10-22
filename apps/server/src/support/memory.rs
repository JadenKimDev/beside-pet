//! 장기기억의 모양: 사용자가 말한 사실 행(`MemoryNote`)과 아이(`Pet`), 소유자의 현재 목록(`MemoryView`).
//!
//! 기억은 사용자가 말한 사실만 담고, 현재 목록은 저장의 뷰(`current_memory`)가 낸다. 종류에 건강·직업은 없다.
//! 저장은 `MemoryStore` 로 묻고 구현은 `store` 가 둔다. 모델 추출의 결과(`Extraction`)는 게이트를 거쳐서만 저장된다.

use chrono::{DateTime, Utc};

use super::request::LossType;

mod extraction;
mod gate;
mod kind;
mod onboarding;
mod extractor;
mod storage;

pub use extraction::{ExtractedFact, Extraction};
pub use gate::{GateInput, GateOutcome, GatedNote, PetLink, gate};
pub use kind::{NoteKind, PetStatus, parse_loss_type};
pub use onboarding::pet_from_profile;
pub use extractor::{
    ExtractError, ExtractInput, MemoryExtractor, ModelMemoryExtractor, SharedMemoryExtractor,
};
pub use storage::{MemoryOptout, MemoryStore, SharedMemoryStore};

/// 저장된 아이 한 행(`pets`). 이름은 사용자가 쓴 그대로다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Pet {
    pub id: String,
    pub name: String,
    pub status: PetStatus,
    pub loss_type: Option<LossType>,
    pub source_session_id: String,
    pub said_at: DateTime<Utc>,
}

/// 넣을 아이. 같은 소유자에 같은 이름이 있으면 저장은 그 행을 돌려준다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewPet {
    pub owner_id: String,
    pub name: String,
    pub status: PetStatus,
    pub loss_type: Option<LossType>,
    pub source_session_id: String,
    pub said_at: DateTime<Utc>,
}

/// 지금 유효한 사실 한 행(`current_memory`). `seq` 는 그 사실이 나온 사용자 메시지의 자리다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryNote {
    pub id: String,
    pub session_id: String,
    pub seq: i32,
    pub kind: NoteKind,
    pub pet_id: Option<String>,
    pub text: String,
    pub said_at: DateTime<Utc>,
}

/// 넣을 사실. `extracted_by` 는 `rule` 또는 `model:<프롬프트 버전>` 이다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewNote {
    pub owner_id: String,
    pub session_id: String,
    pub seq: i32,
    pub kind: NoteKind,
    pub pet_id: Option<String>,
    pub text: String,
    pub extracted_by: String,
    pub said_at: DateTime<Utc>,
}

/// 소유자의 현재 기억: 아이들과 무효화되지 않은 사실들(최근 말한 순).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MemoryView {
    pub pets: Vec<Pet>,
    pub notes: Vec<MemoryNote>,
}

#[cfg(test)]
mod tests;

//! 기억 행의 닫힌 값들: 사실의 종류(`NoteKind`), 아이의 상태(`PetStatus`), 그리고 저장 문자열과의 변환.

use crate::support::LossType;

/// 사실의 종류. 일곱 뿐이고 건강·직업은 없다(DB 의 CHECK 와 같다).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum NoteKind {
    Pet,
    Person,
    Object,
    Place,
    Date,
    Ritual,
    Preference,
}

impl NoteKind {
    /// 프롬프트에 줄을 놓는 순서이기도 하다.
    pub const ALL: [NoteKind; 7] = [
        NoteKind::Pet,
        NoteKind::Person,
        NoteKind::Object,
        NoteKind::Place,
        NoteKind::Date,
        NoteKind::Ritual,
        NoteKind::Preference,
    ];

    /// DB 와 추출 스키마의 문자열.
    pub fn as_str(self) -> &'static str {
        match self {
            NoteKind::Pet => "pet",
            NoteKind::Person => "person",
            NoteKind::Object => "object",
            NoteKind::Place => "place",
            NoteKind::Date => "date",
            NoteKind::Ritual => "ritual",
            NoteKind::Preference => "preference",
        }
    }

    /// 일곱 밖이면 `None`.
    pub fn parse(value: &str) -> Option<NoteKind> {
        NoteKind::ALL
            .into_iter()
            .find(|kind| kind.as_str() == value)
    }
}

/// 아이의 상태. 떠난 아이(`deceased`)와 곁에 있는 아이(`living`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PetStatus {
    Deceased,
    Living,
}

impl PetStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            PetStatus::Deceased => "deceased",
            PetStatus::Living => "living",
        }
    }

    pub fn parse(value: &str) -> Option<PetStatus> {
        [PetStatus::Deceased, PetStatus::Living]
            .into_iter()
            .find(|status| status.as_str() == value)
    }
}

/// `pets.loss_type` 의 문자열(`LossType::as_str`)을 되읽는다. 모르는 값이면 `None`.
pub fn parse_loss_type(value: &str) -> Option<LossType> {
    [
        LossType::Sudden,
        LossType::Illness,
        LossType::Natural,
        LossType::Euthanasia,
        LossType::Unknown,
    ]
    .into_iter()
    .find(|loss| loss.as_str() == value)
}

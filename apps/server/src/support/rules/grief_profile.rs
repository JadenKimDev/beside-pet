//! 애도 프로필: 온보딩이 모은 출발점. 요청 타입을 그대로 쓰고, 발화에 쓰는 펫 이름과 대화 언어, 칸의 원문 값을 꺼낸다.
//!
//! 세션 행의 JSONB 로 저장되고(칸 이름은 TS 와 같은 camelCase), 대화 언어는 `preferred_language` 한 곳에만 있다.

use crate::identity::ChatLanguage;

use super::super::request::{
    DailyStateRequest, EatingState, GriefPath, GriefProfileRequest, LossType, Situation,
    SleepState, TogetherRange,
};

/// 세션의 애도 프로필. 요청 본문의 모양과 같아 따로 만들지 않는다.
pub type GriefProfile = GriefProfileRequest;
/// 온보딩의 하루 상태(잠, 식사).
pub type DailyState = DailyStateRequest;

/// 펫 이름이 없을 때 발화에 넣는 자리표시(모델이 대화 언어로 자연스럽게 바꾼다).
pub const PET_NAME_FALLBACK: &str = "your little one";
/// 온보딩이 언어를 적지 않았을 때의 대화 언어.
pub const DEFAULT_LANGUAGE: ChatLanguage = ChatLanguage::En;

impl GriefProfileRequest {
    /// 발화에 쓰는 펫 이름. 없으면 자리표시.
    pub fn display_pet_name(&self) -> &str {
        self.pet_name.as_deref().unwrap_or(PET_NAME_FALLBACK)
    }

    /// 대화 언어. 없으면 기본값.
    pub fn language(&self) -> ChatLanguage {
        self.preferred_language.unwrap_or(DEFAULT_LANGUAGE)
    }
}

impl GriefPath {
    /// 요청과 JSONB 의 원문 값.
    pub fn as_str(self) -> &'static str {
        match self {
            GriefPath::AfterLoss => "afterLoss",
            GriefPath::BeforeLoss => "beforeLoss",
        }
    }
}

impl TogetherRange {
    pub fn as_str(self) -> &'static str {
        match self {
            TogetherRange::UpToThree => "0-3",
            TogetherRange::FourToSeven => "4-7",
            TogetherRange::EightToEleven => "8-11",
            TogetherRange::TwelvePlus => "12+",
        }
    }
}

impl LossType {
    pub fn as_str(self) -> &'static str {
        match self {
            LossType::Sudden => "sudden",
            LossType::Illness => "illness",
            LossType::Natural => "natural",
            LossType::Euthanasia => "euthanasia",
            LossType::Unknown => "unknown",
        }
    }
}

impl Situation {
    pub fn as_str(self) -> &'static str {
        match self {
            Situation::Aging => "aging",
            Situation::EndOfLife => "endOfLife",
            Situation::OngoingCare => "ongoingCare",
            Situation::Other => "other",
        }
    }
}

impl SleepState {
    pub fn as_str(self) -> &'static str {
        match self {
            SleepState::Ok => "ok",
            SleepState::Fair => "fair",
            SleepState::Disturbed => "disturbed",
        }
    }
}

impl EatingState {
    pub fn as_str(self) -> &'static str {
        match self {
            EatingState::Ok => "ok",
            EatingState::Reduced => "reduced",
        }
    }
}

#[cfg(test)]
mod tests;

use serde_json::json;

use super::{DEFAULT_LANGUAGE, GriefProfile, PET_NAME_FALLBACK};
use crate::identity::ChatLanguage;
use crate::support::DailyStateRequest as DailyState;
use crate::support::{EatingState, GriefPath, LossType, Situation, SleepState, TogetherRange};

/// 지어낸 프로필.
fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("Mochi".to_owned()),
        together_range: Some(TogetherRange::TwelvePlus),
        loss_type: Some(LossType::Euthanasia),
        situation: None,
        weeks_since_loss: Some(3.0),
        daily_state: Some(DailyState {
            sleep: Some(SleepState::Disturbed),
            eating: None,
        }),
        preferred_language: Some(ChatLanguage::Ko),
    }
}

fn bare() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::BeforeLoss,
        pet_name: None,
        together_range: None,
        loss_type: None,
        situation: None,
        weeks_since_loss: None,
        daily_state: None,
        preferred_language: None,
    }
}

#[test]
fn 펫_이름과_언어() {
    assert_eq!(profile().display_pet_name(), "Mochi");
    assert_eq!(profile().language(), ChatLanguage::Ko);
    assert_eq!(bare().display_pet_name(), PET_NAME_FALLBACK);
    assert_eq!(PET_NAME_FALLBACK, "your little one");
    assert_eq!(bare().language(), DEFAULT_LANGUAGE);
    assert_eq!(DEFAULT_LANGUAGE, ChatLanguage::En);
}

#[test]
fn 원문_값() {
    assert_eq!(GriefPath::AfterLoss.as_str(), "afterLoss");
    assert_eq!(GriefPath::BeforeLoss.as_str(), "beforeLoss");
    let ranges = [
        TogetherRange::UpToThree,
        TogetherRange::FourToSeven,
        TogetherRange::EightToEleven,
        TogetherRange::TwelvePlus,
    ];
    assert_eq!(
        ranges.map(TogetherRange::as_str),
        ["0-3", "4-7", "8-11", "12+"]
    );
    let losses = [
        LossType::Sudden,
        LossType::Illness,
        LossType::Natural,
        LossType::Euthanasia,
        LossType::Unknown,
    ];
    assert_eq!(
        losses.map(LossType::as_str),
        ["sudden", "illness", "natural", "euthanasia", "unknown"]
    );
    let situations = [
        Situation::Aging,
        Situation::EndOfLife,
        Situation::OngoingCare,
        Situation::Other,
    ];
    assert_eq!(
        situations.map(Situation::as_str),
        ["aging", "endOfLife", "ongoingCare", "other"]
    );
    assert_eq!(
        [SleepState::Ok, SleepState::Fair, SleepState::Disturbed].map(SleepState::as_str),
        ["ok", "fair", "disturbed"]
    );
    assert_eq!(
        [EatingState::Ok, EatingState::Reduced].map(EatingState::as_str),
        ["ok", "reduced"]
    );
}

#[test]
fn 원문_값은_json_의_값과_같다() {
    let value = serde_json::to_value(TogetherRange::EightToEleven).unwrap();
    assert_eq!(value, json!(TogetherRange::EightToEleven.as_str()));
    let value = serde_json::to_value(Situation::EndOfLife).unwrap();
    assert_eq!(value, json!(Situation::EndOfLife.as_str()));
}

#[test]
fn jsonb_로_오가도_같다() {
    let value = serde_json::to_value(profile()).unwrap();
    assert_eq!(value["griefPath"], json!("afterLoss"));
    assert_eq!(value["togetherRange"], json!("12+"));
    assert_eq!(value["dailyState"]["sleep"], json!("disturbed"));
    assert_eq!(value["preferredLanguage"], json!("ko"));
    let back: GriefProfile = serde_json::from_value(value).unwrap();
    assert_eq!(back, profile());
}

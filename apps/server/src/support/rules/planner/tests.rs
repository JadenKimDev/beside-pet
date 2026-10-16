use chrono::{TimeZone, Utc};

use super::plan;
use crate::support::DailyStateRequest as DailyState;
use crate::support::rules::GriefProfile;
use crate::support::{GriefPath, LossType, SleepState, TogetherRange};

fn bare(path: GriefPath) -> GriefProfile {
    GriefProfile {
        grief_path: path,
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
fn 경로마다_방향이_다르다() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    let after = plan(&bare(GriefPath::AfterLoss), at);
    assert_eq!(
        after.path_focus,
        "Hold space for the loss that already happened; let the story come at its own pace."
    );
    let before = plan(&bare(GriefPath::BeforeLoss), at);
    assert_eq!(
        before.path_focus,
        "Stay with anticipatory grief; honor the time that remains without rushing goodbye."
    );
    assert_eq!(after.created_at, at);
    assert!(after.cautions.is_empty());
}

#[test]
fn 과제별_강조와_어조() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    let focuses = plan(&bare(GriefPath::AfterLoss), at).task_focuses;
    let tasks: Vec<u8> = focuses.iter().map(|focus| focus.task).collect();
    assert_eq!(tasks, vec![1, 2, 3, 4]);
    assert_eq!(
        focuses[0].emphasis,
        "Acknowledge the reality of the loss gently."
    );
    assert_eq!(focuses[0].tone, "soft, unhurried");
    assert_eq!(
        focuses[3].emphasis,
        "Help carry the bond forward, not let it go."
    );
    assert_eq!(focuses[3].tone, "hopeful, tender");
}

#[test]
fn 주의할_점은_잠_함께한_기간_떠난_방식에서_온다() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    let mut profile = bare(GriefPath::AfterLoss);
    profile.daily_state = Some(DailyState {
        sleep: Some(SleepState::Disturbed),
        eating: None,
    });
    profile.together_range = Some(TogetherRange::TwelvePlus);
    profile.loss_type = Some(LossType::Sudden);
    assert_eq!(
        plan(&profile, at).cautions,
        vec![
            "Sleep is disturbed — keep turns short and low-demand.",
            "Long bond — expect identity-level grief, not just sadness.",
            "Sudden loss — allow for shock and disbelief before meaning-making.",
        ]
    );
    profile.loss_type = Some(LossType::Euthanasia);
    profile.together_range = Some(TogetherRange::EightToEleven);
    profile.daily_state = Some(DailyState {
        sleep: Some(SleepState::Fair),
        eating: None,
    });
    assert_eq!(
        plan(&profile, at).cautions,
        vec!["Euthanasia — watch for guilt; affirm the care behind the decision."]
    );
}

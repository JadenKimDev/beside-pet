//! Planner: 애도 프로필에서 세션의 지원 계획(전체 방향, 과제별 강조와 어조, 주의할 점)을 결정론적으로 구한다. 모델을 부르지 않는다.
//!
//! 계획은 저장하지 않는다. 같은 프로필이면 같은 계획이라 응답 때 다시 구한다.

use chrono::{DateTime, Utc};

use super::super::request::{GriefPath, LossType, SleepState, TogetherRange};
use super::super::response::{SupportPlanResponse, TaskFocusResponse};
use super::GriefProfile;

/// 과제별 (과제, 강조, 어조). TS 의 `TASK_FOCUSES` 그대로.
const TASK_FOCUSES: [(u8, &str, &str); 4] = [
    (
        1,
        "Acknowledge the reality of the loss gently.",
        "soft, unhurried",
    ),
    (
        2,
        "Make room for whatever feeling rises.",
        "warm, validating",
    ),
    (
        3,
        "Notice the everyday gaps the absence leaves.",
        "grounded, patient",
    ),
    (
        4,
        "Help carry the bond forward, not let it go.",
        "hopeful, tender",
    ),
];

/// 세션의 지원 계획. `created_at` 은 부르는 쪽이 정한다(세션 시작 시각).
pub fn plan(profile: &GriefProfile, created_at: DateTime<Utc>) -> SupportPlanResponse {
    SupportPlanResponse {
        created_at,
        path_focus: path_focus(profile.grief_path).to_owned(),
        task_focuses: TASK_FOCUSES
            .iter()
            .map(|(task, emphasis, tone)| TaskFocusResponse {
                task: *task,
                emphasis: (*emphasis).to_owned(),
                tone: (*tone).to_owned(),
            })
            .collect(),
        cautions: cautions_for(profile),
    }
}

/// 애도 경로(떠나보낸 뒤, 떠나보내기 전)에서 나오는 전체 방향.
fn path_focus(path: GriefPath) -> &'static str {
    match path {
        GriefPath::AfterLoss => {
            "Hold space for the loss that already happened; let the story come at its own pace."
        }
        GriefPath::BeforeLoss => {
            "Stay with anticipatory grief; honor the time that remains without rushing goodbye."
        }
    }
}

/// 프로필(잠, 함께한 기간, 떠난 방식)에서 나오는 주의할 점. TS 와 같은 순서.
fn cautions_for(profile: &GriefProfile) -> Vec<String> {
    let sleep = profile.daily_state.as_ref().and_then(|daily| daily.sleep);
    let mut cautions = Vec::new();
    if sleep == Some(SleepState::Disturbed) {
        cautions.push("Sleep is disturbed — keep turns short and low-demand.");
    }
    if profile.together_range == Some(TogetherRange::TwelvePlus) {
        cautions.push("Long bond — expect identity-level grief, not just sadness.");
    }
    match profile.loss_type {
        Some(LossType::Sudden) => {
            cautions.push("Sudden loss — allow for shock and disbelief before meaning-making.");
        }
        Some(LossType::Euthanasia) => {
            cautions.push("Euthanasia — watch for guilt; affirm the care behind the decision.");
        }
        _ => {}
    }
    cautions.into_iter().map(str::to_owned).collect()
}

#[cfg(test)]
mod tests;

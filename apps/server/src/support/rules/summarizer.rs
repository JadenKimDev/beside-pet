//! Summarizer: 닫힌 세션의 한 쪽 요약(도달 과제, 턴 수, 가장 높은 지원 수준, 한 줄 요약, 후속 제안)을 결정론적으로 구한다. 모델을 부르지 않는다.
//!
//! 요약은 저장하지 않는다. 세션의 구조에서만 나오므로 응답 때 다시 구한다.

use chrono::{DateTime, Utc};

use super::super::response::SessionSummaryResponse;
use super::{SupportLevel, Task};

/// 요약. `at` 은 부르는 쪽이 정한다.
pub fn summarize(
    reached_task: Task,
    turn_count: u32,
    highest_support_level: SupportLevel,
    at: DateTime<Utc>,
) -> SessionSummaryResponse {
    SessionSummaryResponse {
        at,
        reached_task: reached_task.number(),
        turn_count,
        highest_support_level: highest_support_level.number(),
        headline: headline_for(reached_task, turn_count),
        follow_up: follow_up_for(highest_support_level).to_owned(),
    }
}

/// 클로징(5)에 닿았으면 네 과제를 모두 지났다.
fn headline_for(reached_task: Task, turn_count: u32) -> String {
    if reached_task.is_closing() {
        format!("Worked through all 4 grief tasks across {turn_count} turns.")
    } else {
        format!(
            "Reached task {} of 4 across {turn_count} turns.",
            reached_task.number()
        )
    }
}

fn follow_up_for(level: SupportLevel) -> &'static str {
    match level {
        SupportLevel::Crisis => {
            "Crisis resources were surfaced — encourage professional follow-up."
        }
        SupportLevel::Watch => "A gentle check-in soon is suggested.",
        SupportLevel::Safe => "Open to continue at their own pace.",
    }
}

#[cfg(test)]
mod tests;

use chrono::{TimeZone, Utc};

use super::summarize;
use crate::support::SessionSummaryResponse;
use crate::support::rules::{SupportLevel, Task};

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

#[test]
fn 클로징에_닿으면_네_과제를_모두_지났다() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    assert_eq!(
        summarize(task(5), 14, SupportLevel::Safe, at),
        SessionSummaryResponse {
            at,
            reached_task: 5,
            turn_count: 14,
            highest_support_level: 1,
            headline: "Worked through all 4 grief tasks across 14 turns.".to_owned(),
            follow_up: "Open to continue at their own pace.".to_owned(),
        }
    );
}

#[test]
fn 도중이면_도달_과제를_적는다() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    let summary = summarize(task(2), 4, SupportLevel::Crisis, at);
    assert_eq!(summary.headline, "Reached task 2 of 4 across 4 turns.");
    assert_eq!(summary.highest_support_level, 3);
    assert_eq!(
        summary.follow_up,
        "Crisis resources were surfaced — encourage professional follow-up."
    );
    assert_eq!(
        summarize(task(3), 1, SupportLevel::Watch, at).follow_up,
        "A gentle check-in soon is suggested."
    );
}

use chrono::{TimeZone, Utc};
use serde_json::json;

use super::{MindReport, REPORT_MIN_TASK, REPORT_SECTION_ORDER, is_report_available};
use crate::identity::ChatLanguage;
use crate::support::rules::Task;
use crate::support::{MindReportSectionResponse, ReportSectionKey};

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

fn report() -> MindReport {
    MindReport {
        at: Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap(),
        pet_name: "Mochi".to_owned(),
        reached_task: task(3),
        locale: ChatLanguage::En,
        sections: REPORT_SECTION_ORDER
            .iter()
            .map(|key| MindReportSectionResponse {
                key: *key,
                body: "A made-up body.".to_owned(),
            })
            .collect(),
    }
}

#[test]
fn 닫혔고_과제_2_이상일_때만_열린다() {
    assert_eq!(REPORT_MIN_TASK, task(2));
    assert!(!is_report_available(task(5), false));
    assert!(!is_report_available(task(1), true));
    assert!(!is_report_available(task(0), true));
    assert!(is_report_available(task(2), true));
    assert!(is_report_available(task(5), true));
}

#[test]
fn 장_순서() {
    assert_eq!(
        REPORT_SECTION_ORDER,
        [
            ReportSectionKey::Journey,
            ReportSectionKey::Emotions,
            ReportSectionKey::Keepsake,
            ReportSectionKey::Encouragement,
        ]
    );
}

#[test]
fn 응답의_진행률은_도달_과제에서_구한다() {
    let response = report().to_response();
    assert_eq!(response.progress, 0.5);
    assert_eq!(response.reached_task, 3);
    assert_eq!(response.pet_name, "Mochi");
    assert_eq!(response.locale, ChatLanguage::En);
    assert_eq!(response.at, report().at);
    assert_eq!(response.sections, report().sections);
}

#[test]
fn jsonb_로_오가도_같고_진행률은_싣지_않는다() {
    let value = serde_json::to_value(report()).unwrap();
    assert_eq!(value["at"], json!("2026-10-16T09:00:00.000Z"));
    assert_eq!(value["reachedTask"], json!(3));
    assert_eq!(value["sections"][0]["key"], json!("journey"));
    assert!(value.get("progress").is_none());
    let back: MindReport = serde_json::from_value(value).unwrap();
    assert_eq!(back, report());
}

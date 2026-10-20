use chrono::{DateTime, Duration, Utc};

use super::Period;
use crate::shared::{ApiError, Message};

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

fn now() -> DateTime<Utc> {
    at("2026-10-20T12:00:00.500Z")
}

#[test]
fn 비우면_지금까지_7일이다() {
    let period = Period::resolve(None, None, now()).unwrap();
    assert_eq!(period.to, now());
    assert_eq!(period.from, now() - Duration::days(7));
}

#[test]
fn to_만_주면_그_7일_전부터다() {
    let period = Period::resolve(None, Some("2026-10-10T00:00:00.000Z"), now()).unwrap();
    assert_eq!(period.to, at("2026-10-10T00:00:00Z"));
    assert_eq!(period.from, at("2026-10-03T00:00:00Z"));
}

#[test]
fn 시각과_날짜를_읽는다() {
    let period =
        Period::resolve(Some("2026-10-01"), Some("2026-10-05T09:30:15.250Z"), now()).unwrap();
    assert_eq!(period.from, at("2026-10-01T00:00:00Z"));
    assert_eq!(period.to, at("2026-10-05T09:30:15.250Z"));

    let period = Period::resolve(Some("2026-10-01T09:00:00+09:00"), None, now()).unwrap();
    assert_eq!(period.from, at("2026-10-01T00:00:00Z"));
    assert_eq!(period.to, now());
}

#[test]
fn 읽지_못하면_칸마다_class_validator_문구다() {
    let error = Period::resolve(Some("yesterday"), Some("2026-13-40"), now()).unwrap_err();
    assert_eq!(
        error,
        ApiError::BadRequest(Message::Many(vec![
            "from must be a valid ISO 8601 date string".to_owned(),
            "to must be a valid ISO 8601 date string".to_owned(),
        ]))
    );
}

#[test]
fn to_가_from_보다_앞이면_400() {
    let error = Period::resolve(Some("2026-10-05"), Some("2026-10-04"), now()).unwrap_err();
    assert_eq!(error, ApiError::bad_request("to must not be before from"));
}

#[test]
fn 구십일까지만_받는다() {
    let ok = Period::resolve(Some("2026-07-01"), Some("2026-09-29"), now()).unwrap();
    assert_eq!(ok.to - ok.from, Duration::days(90));

    let error =
        Period::resolve(Some("2026-07-01"), Some("2026-09-29T00:00:00.001Z"), now()).unwrap_err();
    assert_eq!(
        error,
        ApiError::bad_request("Range must be at most 90 days")
    );
}

#[test]
fn 날짜별_집계는_기간이_걸친_utc_날짜를_본다() {
    let period = Period::resolve(
        Some("2026-10-01T23:30:00+00:00"),
        Some("2026-10-03T00:00:00Z"),
        now(),
    )
    .unwrap();
    assert_eq!(
        period.days(),
        (
            chrono::NaiveDate::from_ymd_opt(2026, 10, 1).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 10, 3).unwrap()
        )
    );
}

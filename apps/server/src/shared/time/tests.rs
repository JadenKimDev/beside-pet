use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{from_iso, to_iso};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Example {
    #[serde(with = "super::iso_millis")]
    created_at: DateTime<Utc>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "super::iso_millis_opt"
    )]
    expires_at: Option<DateTime<Utc>>,
}

fn at() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 5, 7).unwrap() + chrono::Duration::microseconds(123_456)
}

#[test]
fn 밀리초까지_z_로_적는다() {
    assert_eq!(to_iso(&at()), "2026-10-16T09:05:07.123Z");
    let whole = Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap();
    assert_eq!(to_iso(&whole), "2026-01-02T03:04:05.000Z");
}

#[test]
fn iso_를_읽는다() {
    let parsed = from_iso("2026-10-16T18:05:07.123+09:00").unwrap();
    assert_eq!(to_iso(&parsed), "2026-10-16T09:05:07.123Z");
    assert!(from_iso("nope").is_none());
}

#[test]
fn 없는_시각은_칸을_뺀다() {
    let value = serde_json::to_value(Example {
        created_at: at(),
        expires_at: None,
    })
    .unwrap();
    assert_eq!(value, json!({ "createdAt": "2026-10-16T09:05:07.123Z" }));
}

#[test]
fn 있는_시각은_칸을_적는다() {
    let value = serde_json::to_value(Example {
        created_at: at(),
        expires_at: Some(at()),
    })
    .unwrap();
    assert_eq!(
        value,
        json!({ "createdAt": "2026-10-16T09:05:07.123Z", "expiresAt": "2026-10-16T09:05:07.123Z" })
    );
}

#[test]
fn json_에서_다시_읽는다() {
    let parsed: Example =
        serde_json::from_value(json!({ "createdAt": "2026-10-16T09:05:07.123Z" })).unwrap();
    assert_eq!(parsed.expires_at, None);
    assert_eq!(to_iso(&parsed.created_at), "2026-10-16T09:05:07.123Z");
}

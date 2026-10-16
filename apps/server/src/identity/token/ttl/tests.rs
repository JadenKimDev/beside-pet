use chrono::Duration;

use super::parse_ttl;

#[test]
fn reads_short_units() {
    assert_eq!(parse_ttl("7d"), Some(Duration::days(7)));
    assert_eq!(parse_ttl("12h"), Some(Duration::hours(12)));
    assert_eq!(parse_ttl("30m"), Some(Duration::minutes(30)));
    assert_eq!(parse_ttl("60s"), Some(Duration::seconds(60)));
    assert_eq!(parse_ttl("2w"), Some(Duration::weeks(2)));
    assert_eq!(parse_ttl("1500ms"), Some(Duration::milliseconds(1500)));
}

#[test]
fn bare_number_is_seconds() {
    assert_eq!(parse_ttl("3600"), Some(Duration::seconds(3600)));
}

#[test]
fn reads_long_units_spaces_and_case() {
    assert_eq!(parse_ttl("2 days"), Some(Duration::days(2)));
    assert_eq!(parse_ttl("1 hour"), Some(Duration::hours(1)));
    assert_eq!(parse_ttl("10 Minutes"), Some(Duration::minutes(10)));
    assert_eq!(parse_ttl("7D"), Some(Duration::days(7)));
    assert_eq!(parse_ttl(" 7d "), Some(Duration::days(7)));
}

#[test]
fn reads_fractions() {
    assert_eq!(parse_ttl("1.5h"), Some(Duration::minutes(90)));
}

#[test]
fn rejects_unreadable_and_non_positive() {
    for text in [
        "",
        "d",
        "7x",
        "seven days",
        "7d7",
        "0",
        "0d",
        "-1d",
        "1..5h",
        "NaN",
    ] {
        assert_eq!(parse_ttl(text), None, "{text:?}");
    }
}

//! 토큰 수명의 기간 글(`JWT_TTL`: `7d`, `12h`, `30m`, `60s`, 숫자는 초)을 읽는다. I/O 는 없다.

use chrono::Duration;

/// 기간 글을 읽는다. 단위는 대소문자를 가리지 않고 `ms`, `s`, `m`, `h`, `d`, `w`, `y` 와 그 긴 이름
/// (`seconds`, `minutes`, `hours`, `days`, `weeks`, `years` 등)을 받는다. 단위가 없으면 초다.
/// 0 이하이거나 읽지 못하면 `None`.
pub fn parse_ttl(text: &str) -> Option<Duration> {
    let text = text.trim();
    let split = text
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(text.len());
    let (number, unit) = text.split_at(split);
    if !number.bytes().any(|b| b.is_ascii_digit()) {
        return None;
    }
    let value: f64 = number.parse().ok()?;
    let millis = value * unit_millis(&unit.trim_start().to_ascii_lowercase())?;
    if !millis.is_finite() || millis < 1.0 {
        return None;
    }
    // 소수는 밀리초 아래를 버린다. `as` 는 범위를 넘으면 포화하므로 아래에서 거른다.
    Duration::try_milliseconds(millis as i64)
}

const SECOND: f64 = 1_000.0;
const MINUTE: f64 = 60.0 * SECOND;
const HOUR: f64 = 60.0 * MINUTE;
const DAY: f64 = 24.0 * HOUR;

/// 단위 하나의 밀리초. 이름은 `jsonwebtoken`(JS) 이 쓰는 `ms` 의 것과 같다.
fn unit_millis(unit: &str) -> Option<f64> {
    let millis = match unit {
        "" | "s" | "sec" | "secs" | "second" | "seconds" => SECOND,
        "ms" | "msec" | "msecs" | "millisecond" | "milliseconds" => 1.0,
        "m" | "min" | "mins" | "minute" | "minutes" => MINUTE,
        "h" | "hr" | "hrs" | "hour" | "hours" => HOUR,
        "d" | "day" | "days" => DAY,
        "w" | "week" | "weeks" => 7.0 * DAY,
        "y" | "yr" | "yrs" | "year" | "years" => 365.25 * DAY,
        _ => return None,
    };
    Some(millis)
}

#[cfg(test)]
mod tests;

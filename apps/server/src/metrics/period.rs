//! 계측의 기간: 요청의 `from`, `to` 문자열과 지금 시각에서 기간을 정하고 그 한도를 본다(I/O 없음).

use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};

use crate::shared::{ApiError, Message, from_iso};

/// 비운 `from` 은 `to` 에서 이만큼 앞이다.
const DEFAULT_DAYS: i64 = 7;
/// 한 번에 묻는 기간의 상한.
const MAX_DAYS: i64 = 90;

/// `from` 이상 `to` 이하의 기간.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Period {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

impl Period {
    /// 비운 쪽은 기본값(`to` 는 지금, `from` 은 `to` 의 7일 전)으로 채운다. 읽지 못한 칸, 거꾸로 된 기간,
    /// 90일을 넘는 기간은 400 이다.
    pub fn resolve(
        from: Option<&str>,
        to: Option<&str>,
        now: DateTime<Utc>,
    ) -> Result<Period, ApiError> {
        let mut messages = Vec::new();
        let mut read = |name: &str, text: Option<&str>| match text.map(parse) {
            Some(None) => {
                // class-validator `@IsISO8601` 의 문구(shared 의 `Rule::IsIso8601` 과 같다).
                messages.push(format!("{name} must be a valid ISO 8601 date string"));
                None
            }
            Some(at) => at,
            None => None,
        };
        let from = read("from", from);
        let to = read("to", to);
        if !messages.is_empty() {
            return Err(ApiError::BadRequest(Message::Many(messages)));
        }
        let to = to.unwrap_or(now);
        let from = from.unwrap_or(to - Duration::days(DEFAULT_DAYS));
        if to < from {
            return Err(ApiError::bad_request("to must not be before from"));
        }
        if to - from > Duration::days(MAX_DAYS) {
            return Err(ApiError::bad_request("Range must be at most 90 days"));
        }
        Ok(Period { from, to })
    }

    /// 기간이 걸친 UTC 날짜의 처음과 끝(양 끝 포함).
    pub fn days(&self) -> (NaiveDate, NaiveDate) {
        (self.from.date_naive(), self.to.date_naive())
    }
}

/// 시간대가 있는 시각, 시간대가 없는 시각(UTC 로 본다), 날짜(그날 0시 UTC).
fn parse(text: &str) -> Option<DateTime<Utc>> {
    from_iso(text)
        .or_else(|| {
            NaiveDateTime::parse_from_str(text, "%Y-%m-%dT%H:%M:%S%.f")
                .ok()
                .map(|at| at.and_utc())
        })
        .or_else(|| {
            NaiveDate::parse_from_str(text, "%Y-%m-%d")
                .ok()
                .and_then(|day| day.and_hms_opt(0, 0, 0))
                .map(|at| at.and_utc())
        })
}

#[cfg(test)]
mod tests;

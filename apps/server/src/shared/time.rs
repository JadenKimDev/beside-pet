//! timestamptz 와 JSON 의 ISO-8601 문자열(밀리초, `Z`) 사이의 변환.

use chrono::{DateTime, SecondsFormat, Utc};

/// `2026-10-16T09:05:07.123Z` 꼴. JS 의 `Date#toISOString` 과 같다.
pub fn to_iso(at: &DateTime<Utc>) -> String {
    at.to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// RFC 3339 문자열을 UTC 시각으로 읽는다. 읽지 못하면 `None`.
pub fn from_iso(text: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(text)
        .ok()
        .map(|at| at.with_timezone(&Utc))
}

/// `#[serde(with = "iso_millis")]`: `DateTime<Utc>` 칸을 ISO 밀리초 문자열로.
pub mod iso_millis {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(at: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&super::to_iso(at))
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<DateTime<Utc>, D::Error> {
        let text = String::deserialize(deserializer)?;
        super::from_iso(&text).ok_or_else(|| D::Error::custom("not an ISO 8601 timestamp"))
    }
}

/// `#[serde(default, skip_serializing_if = "Option::is_none", with = "iso_millis_opt")]`:
/// 없는 시각은 JSON 에서 칸을 뺀다(TS 의 `undefined`).
pub mod iso_millis_opt {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Deserializer, Serializer, de::Error};

    pub fn serialize<S: Serializer>(
        at: &Option<DateTime<Utc>>,
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        match at {
            Some(at) => serializer.serialize_str(&super::to_iso(at)),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<DateTime<Utc>>, D::Error> {
        match Option::<String>::deserialize(deserializer)? {
            None => Ok(None),
            Some(text) => super::from_iso(&text)
                .map(Some)
                .ok_or_else(|| D::Error::custom("not an ISO 8601 timestamp")),
        }
    }
}

#[cfg(test)]
mod tests;

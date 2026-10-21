//! 위기 때 안내할 지원 기관 목록과 고정 위기 문구(순수 데이터).
//!
//! 위기 답은 모델이 만들지 않는다. 안전을 위해 고정 문구와 확인한 연락처만 쓴다. 번호는 TS 의 `safety-resources.ts` 그대로이고, 글은 ADR-0003 의 금지어를 쓰지 않는다(테스트가 본다).

use serde::Serialize;

/// 지원 기관 하나. `GET /v1/safety/resources` 의 원소 모양이기도 하다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SafetyResource {
    pub name: &'static str,
    pub phone: &'static str,
    pub hours: &'static str,
    pub note: &'static str,
}

const RESOURCES: &[SafetyResource] = &[
    SafetyResource {
        name: "Suicide Prevention Hotline (Korea)",
        phone: "109",
        hours: "24h",
        note: "Call right away, any time of day.",
    },
    SafetyResource {
        name: "Danuri Helpline (multilingual)",
        phone: "1577-1366",
        hours: "24h",
        note: "Support in several languages for residents in Korea.",
    },
];

const CRISIS_REPLY: &str = "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach the crisis line right now at 109 (24h), or the multilingual Danuri Helpline at 1577-1366.";

pub fn safety_resources() -> &'static [SafetyResource] {
    RESOURCES
}

/// 위기 단계에서 사용자에게 보내는 고정 답.
pub fn crisis_reply() -> &'static str {
    CRISIS_REPLY
}

#[cfg(test)]
mod tests;

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

/// 영어(와 한국어가 아닌 모든 언어)의 고정 위기 답.
const CRISIS_REPLY_EN: &str = "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach the crisis line right now at 109 (24h), or the multilingual Danuri Helpline at 1577-1366.";

/// 한국어 세션의 고정 위기 답. 뜻은 영어 문구와 같고, "상담"은 기관 이름 안에서만 쓴다.
const CRISIS_REPLY_KO: &str = "아주 힘든 시간을 지나고 있는 것 같아요. 혼자 짊어지지 않아도 돼요. 지금 바로 자살예방상담전화 109(24시간)나 다국어로 도움을 받을 수 있는 다누리콜센터 1577-1366으로 연락할 수 있어요.";

pub fn safety_resources() -> &'static [SafetyResource] {
    RESOURCES
}

/// 위기 단계에서 사용자에게 보내는 고정 답. `language` 는 대화 언어 코드이고, `ko` 면 한국어, 그 밖은 영어다.
pub fn crisis_reply(language: &str) -> &'static str {
    match language {
        "ko" => CRISIS_REPLY_KO,
        _ => CRISIS_REPLY_EN,
    }
}

#[cfg(test)]
mod tests;

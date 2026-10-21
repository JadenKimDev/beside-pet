use regex::Regex;
use serde_json::json;

use super::{crisis_reply, safety_resources};

#[test]
fn 자원_목록은_고정값이다() {
    let body = serde_json::to_value(safety_resources()).unwrap();
    assert_eq!(
        body,
        json!([
            {
                "name": "Suicide Prevention Hotline (Korea)",
                "phone": "109",
                "hours": "24h",
                "note": "Call right away, any time of day."
            },
            {
                "name": "Danuri Helpline (multilingual)",
                "phone": "1577-1366",
                "hours": "24h",
                "note": "Support in several languages for residents in Korea."
            }
        ])
    );
}

#[test]
fn 위기_문구는_고정이고_자원의_번호를_싣는다() {
    assert_eq!(
        crisis_reply(),
        "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach the crisis line right now at 109 (24h), or the multilingual Danuri Helpline at 1577-1366."
    );
    for resource in safety_resources() {
        assert!(
            crisis_reply().contains(resource.phone),
            "{}",
            resource.phone
        );
    }
}

/// ADR-0003: 사용자에게 보이는 글에 쓰지 않는 말. 웹 `apps/web/i18n/catalog.test.ts` 의 BANNED 와 같은 범위다.
const BANNED: &[&str] = &[
    r"(?i)\bcounsel(?:ing|ling|or|lor|ors|lors)?\b",
    r"(?i)\btherap(?:y|ies|ist|ists|eutic)\b",
    r"(?i)\btreatments?\b",
    r"(?i)\bclinical(?:ly)?\b",
    r"(?i)\bdiagnos(?:e|es|is|ed|ing)\b",
    r"(?i)\bcure[sd]?\b",
    r"(?i)\bpatients?\b",
    r"상담",
    r"치료",
];

/// 바깥 기관의 고유 이름. 이 제품을 설명하는 말이 아니다.
const PROPER_NAMES: &[&str] = &["자살예방상담전화"];

/// ADR-0003 의 유일한 예외: 부정형 면책("not a substitute for …").
const DISCLAIMER_NEGATIVE: &str = r"대신하지 않아요|not a substitute";

fn banned_hits(text: &str) -> Vec<String> {
    let disclaimer = Regex::new(DISCLAIMER_NEGATIVE).unwrap();
    if disclaimer.is_match(text) {
        return Vec::new();
    }
    let stripped = PROPER_NAMES
        .iter()
        .fold(text.to_owned(), |acc, name| acc.replace(name, ""));
    BANNED
        .iter()
        .filter(|pattern| Regex::new(pattern).unwrap().is_match(&stripped))
        .map(|pattern| format!("{pattern} in {text:?}"))
        .collect()
}

#[test]
fn 금지어_검사는_변형과_예외를_가른다() {
    assert!(!banned_hits("Talk to a trained counselor.").is_empty());
    assert!(!banned_hits("Counselling support").is_empty());
    assert!(!banned_hits("마음 상담").is_empty());
    assert!(banned_hits("자살예방상담전화 109").is_empty());
    assert!(banned_hits("This is not a substitute for therapy.").is_empty());
}

#[test]
fn 사용자에게_보이는_고정_문구에_금지어가_없다() {
    let texts = std::iter::once(crisis_reply()).chain(
        safety_resources()
            .iter()
            .flat_map(|resource| [resource.name, resource.note]),
    );
    let hits: Vec<String> = texts.flat_map(banned_hits).collect();
    assert!(hits.is_empty(), "{hits:#?}");
}

//! Supervisor: 만든 답의 품질을 뒤에서 본다. 넘어간 턴, 주의 이상의 수준, 표본 턴에만 돈다(게이트). 결정론적이고 모델을 부르지 않는다.

use super::super::response::{SupervisionQuality, SupervisionResponse};
use super::SupportLevel;

/// 다른 이유가 없어도 N 번째 턴마다 본다.
pub const SAMPLE_EVERY: usize = 3;

/// 값의 게이트: 넘어간 턴, 주의 이상, 표본(`turn_index` 가 `SAMPLE_EVERY` 의 배수)만 본다.
/// `turn_index` 는 이 턴 전까지 쌓인 턴 분석의 수다.
pub fn should_review(advanced: bool, level: SupportLevel, turn_index: usize) -> bool {
    advanced || level >= SupportLevel::Watch || turn_index.is_multiple_of(SAMPLE_EVERY)
}

/// 답 하나를 본다.
pub fn review(reply: &str, level: SupportLevel) -> SupervisionResponse {
    let mut flags = Vec::new();
    if reply.trim().is_empty() {
        flags.push("empty-reply".to_owned());
    }
    if level >= SupportLevel::Watch {
        flags.push("elevated-support-level".to_owned());
    }
    let flagged = !flags.is_empty();
    SupervisionResponse {
        evaluated: true,
        quality: if flagged {
            SupervisionQuality::Review
        } else {
            SupervisionQuality::Ok
        },
        flags,
        note: flagged.then(|| "Flagged for human review.".to_owned()),
    }
}

#[cfg(test)]
mod tests;

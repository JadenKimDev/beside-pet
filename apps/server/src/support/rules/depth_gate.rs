//! 깊이 게이트: 한 과제 안에서 받은 사용자 답들로 다음 과제로 넘어갈지 정한다(ADR-0005). 카운터를 따로 두지 않고 전사에서 구한다.
//!
//! - 진솔한 답(engaged): "모르겠어요" 류가 아니고, 앞뒤 공백을 뺀 길이가 8 을 넘는다.
//! - 넘어가는 때: `MIN_DEPTH` 턴 이상 머물렀고 마지막 답이 진솔할 때, 비몰입이 `DISENGAGE_EXIT` 번 이어질 때, `MAX_DEPTH` 턴에 닿을 때.

use std::sync::LazyLock;

use regex::Regex;

/// 보통의 전이 전에 한 과제에 머무는 최소 턴.
pub const MIN_DEPTH: usize = 3;
/// 한 과제에 머무는 최대 턴(상한).
pub const MAX_DEPTH: usize = 5;
/// 부드럽게 일찍 넘어가게 하는 연속 비몰입 답의 수.
pub const DISENGAGE_EXIT: usize = 2;

/// 진솔한 답으로 치는 최소 길이(이보다 길어야 한다). TS 의 `string.length`(UTF-16 단위)로 센다.
const MIN_MEANINGFUL_LENGTH: usize = 8;

/// 비몰입 신호("모르겠어요", 한 단어 답). 대소문자를 가리지 않고 아포스트로피는 없어도 된다(TS 와 같은 패턴).
static DUNNO_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)i don['’]?t know|dunno|don['’]?t remember|can['’]?t remember|not sure|no idea|hard to say",
    )
    .expect("비몰입 패턴은 올바른 정규식이다")
});

/// 한 번의 전이 판정.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Progression {
    /// 이 턴에 다음 과제로 넘어갔는가.
    pub advanced: bool,
    /// 마지막 답이 진솔했는가(더 깊이 묻기와 부드럽게 다시 묻기를 가른다).
    pub last_engaged: bool,
}

/// 답 하나가 질문에 몰입했는가.
pub fn is_engaged(text: &str) -> bool {
    !DUNNO_PATTERN.is_match(text) && text.trim().encode_utf16().count() > MIN_MEANINGFUL_LENGTH
}

/// 지금 과제 안에서 받은 답들(이번 턴을 포함해 순서대로)로 전이를 정한다.
pub fn evaluate(answers_in_stage: &[&str]) -> Progression {
    let depth = answers_in_stage.len();
    let last_engaged = answers_in_stage.last().is_some_and(|text| is_engaged(text));
    let disengage_streak = answers_in_stage
        .iter()
        .rev()
        .take_while(|text| !is_engaged(text))
        .count();
    let advanced = (depth >= MIN_DEPTH && last_engaged)
        || disengage_streak >= DISENGAGE_EXIT
        || depth >= MAX_DEPTH;
    Progression {
        advanced,
        last_engaged,
    }
}

#[cfg(test)]
mod tests;

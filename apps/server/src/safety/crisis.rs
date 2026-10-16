//! 위기 발화(자해, 자살 의도)를 가리는 결정적 키워드 검사. 이 패턴은 여기에만 둔다(ADR-0004).
//!
//! 규칙 기반이라 회귀가 재현된다. 영어 키워드만 본다. 다른 언어는 모델의 검사가 맡는다.
//! 감지만 한다. 위기 때의 답은 고정 문구(`crisis_reply`)다. 반려동물을 그리워하는 과장 표현은 대상이 아니다.

use std::sync::LazyLock;

use regex::Regex;

/// TS 의 `/kill myself|killing myself|end my life|want to die|suicid|self[-\s]?harm/i` 와 같다.
static CRISIS_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)kill myself|killing myself|end my life|want to die|suicid|self[-\s]?harm")
        .expect("고정 패턴은 올바른 정규식이다")
});

/// 사용자 메시지 하나가 위기 키워드 검사에 걸리는가.
pub fn matches_crisis(text: &str) -> bool {
    CRISIS_PATTERN.is_match(text)
}

#[cfg(test)]
mod tests;

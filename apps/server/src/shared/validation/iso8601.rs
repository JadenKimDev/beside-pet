//! validator.js(13.15.35) `isISO8601` 의 엄격하지 않은 판정을 역참조와 전방 탐색 없이 옮긴 것.
//!
//! 원래 정규식의 `\3`(날짜 구분자)과 `\17`(분 구분자)은 구분자를 고정한 네 갈래로 펼치고,
//! 연도 뒤의 `(?!\d{2}\b)` 와 소수 뒤의 `(?!:)` 는 따로 검사한다.

use std::sync::OnceLock;

use regex::Regex;

fn pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        let zone = r"(?:[zZ]|[+-](?:[01][0-9]|2[0-3]):?(?:[0-5][0-9])?)";
        let frac = r"(?:[.,][0-9]+)?";
        let date = |s: &str| {
            format!(
                "{s}(?:(?:0[1-9]|1[0-2])(?:{s}(?:[12][0-9]|0[1-9]|3[01]))?|W(?:[0-4][0-9]|5[0-3])(?:-?[1-7])?|(?:00[1-9]|0[1-9][0-9]|[12][0-9]{{2}}|3(?:[0-5][0-9]|6[1-6])))"
            )
        };
        // 분을 `:` 로 적은 시각: 시와 분이 있고, 초도 `:` 로 적는다.
        let time_colon = format!(
            r"(?:[T\s](?:[01][0-9]|2[0-3]):[0-5][0-9]{frac}(?::[0-5][0-9]{frac})?{zone}?)"
        );
        // 구분자 없는 시각(분이 없거나 `24:?00` 이면 초의 구분자도 없다).
        let time_bare = format!(
            r"(?:[T\s](?:(?:(?:[01][0-9]|2[0-3])(?:[0-5][0-9])?|24:?00){frac})?(?:[0-5][0-9]{frac})?{zone}?)"
        );
        let alternatives: Vec<String> = ["-", ""]
            .iter()
            .flat_map(|s| {
                let date = date(s);
                [format!("{date}{time_colon}?"), format!("{date}{time_bare}?")]
            })
            .collect();
        Regex::new(&format!("^[+-]?[0-9]{{4}}(?:{})?$", alternatives.join("|"))).unwrap()
    })
}

fn fraction_before_colon() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"[.,][0-9]+:").unwrap())
}

/// 연도 네 자리 바로 뒤에 숫자 두 개가 오고 거기서 낱말이 끝나면 거절한다(`YYYYMM` 꼴).
fn year_followed_by_two_digits(text: &str) -> bool {
    let rest = text.strip_prefix(['+', '-']).unwrap_or(text);
    let bytes = rest.as_bytes();
    if bytes.len() < 6 || !bytes[..6].iter().all(u8::is_ascii_digit) {
        return false;
    }
    bytes
        .get(6)
        .is_none_or(|b| !(b.is_ascii_alphanumeric() || *b == b'_'))
}

pub fn is_iso8601(text: &str) -> bool {
    !year_followed_by_two_digits(text)
        && !fraction_before_colon().is_match(text)
        && pattern().is_match(text)
}

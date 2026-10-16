// ADR-0005 의 깊이 게이트 표: 3턴 뒤 진솔한 답, 비몰입 2연속, 5턴 상한.

use super::{DISENGAGE_EXIT, MAX_DEPTH, MIN_DEPTH, Progression, evaluate, is_engaged};

/// 진솔한 답(여덟 글자를 넘는 문장). 지어낸 값이다.
const ENGAGED: &str = "We used to walk by the river every morning.";
/// 비몰입 답.
const DUNNO: &str = "I don't know";

fn step(advanced: bool, last_engaged: bool) -> Progression {
    Progression {
        advanced,
        last_engaged,
    }
}

#[test]
fn 상수는_adr_0005_의_값이다() {
    assert_eq!((MIN_DEPTH, DISENGAGE_EXIT, MAX_DEPTH), (3, 2, 5));
}

#[test]
fn 진솔한_답의_기준() {
    assert!(is_engaged(ENGAGED));
    assert!(is_engaged("123456789"));
    assert!(!is_engaged("12345678"), "여덟 글자는 넘지 않는다");
    assert!(!is_engaged("   12345678   "), "앞뒤 공백은 세지 않는다");
    assert!(!is_engaged("ok"));
    assert!(!is_engaged(""));
    assert!(is_engaged("산책을 정말 좋아하던 아이였어요"));
}

#[test]
fn 모르겠다는_신호는_길어도_비몰입이다() {
    for text in [
        "I don't know what to say about that",
        "i dont know, honestly it is all a blur",
        "I DON’T KNOW anymore what I feel",
        "dunno, it was a long time ago",
        "I don't remember much of that day",
        "I can't remember when it started",
        "I'm not sure how to describe it",
        "no idea where to even begin here",
        "it's hard to say what I miss most",
    ] {
        assert!(!is_engaged(text), "{text}");
    }
}

#[test]
fn 길이는_utf16_단위로_센다() {
    // 이모지 하나는 UTF-16 으로 2 다(TS 의 length). 넷이면 8 이라 넘지 않고, 다섯이면 10 이다.
    assert!(!is_engaged("🐾🐾🐾🐾"));
    assert!(is_engaged("🐾🐾🐾🐾🐾"));
}

#[test]
fn 깊이_게이트의_표() {
    let cases: &[(&[&str], Progression, &str)] = &[
        (
            &[ENGAGED],
            step(false, true),
            "1턴 진솔: 머물러 깊이 묻는다",
        ),
        (
            &[ENGAGED, ENGAGED],
            step(false, true),
            "2턴 진솔: 아직 머문다",
        ),
        (
            &[ENGAGED, ENGAGED, ENGAGED],
            step(true, true),
            "3턴 뒤 진솔한 답: 넘어간다",
        ),
        (&[DUNNO], step(false, false), "1턴 비몰입: 다시 묻는다"),
        (
            &[DUNNO, DUNNO],
            step(true, false),
            "비몰입 2연속: 부드럽게 넘어간다",
        ),
        (&[ENGAGED, DUNNO], step(false, false), "비몰입 1번: 머문다"),
        (
            &[ENGAGED, ENGAGED, DUNNO],
            step(false, false),
            "3턴이지만 마지막이 비몰입: 머문다",
        ),
        (
            &[ENGAGED, DUNNO, DUNNO],
            step(true, false),
            "3턴, 비몰입 2연속: 넘어간다",
        ),
        (
            &[DUNNO, ENGAGED],
            step(false, true),
            "비몰입 뒤 진솔: 연속이 끊긴다",
        ),
        (
            &[DUNNO, ENGAGED, DUNNO],
            step(false, false),
            "번갈아: 연속 1",
        ),
        (
            &[DUNNO, ENGAGED, DUNNO, ENGAGED],
            step(true, true),
            "4턴 진솔: 넘어간다",
        ),
        (
            &[ENGAGED, DUNNO, ENGAGED, DUNNO, "ok"],
            step(true, false),
            "5턴 상한: 넘어간다",
        ),
        (
            &[DUNNO, ENGAGED, DUNNO, ENGAGED, DUNNO],
            step(true, false),
            "5턴 상한, 연속 1",
        ),
        (&[], step(false, false), "답이 없으면 넘어가지 않는다"),
    ];
    for (answers, expected, why) in cases {
        assert_eq!(evaluate(answers), *expected, "{why}");
    }
}

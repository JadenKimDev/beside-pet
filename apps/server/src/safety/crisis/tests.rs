// 픽스처 문장은 모두 지어낸 것이다. 실제 사용자의 대화를 넣지 않는다.
// 키워드마다 그 키워드 하나로만 잡히는 문장을 둔다. 패턴에서 키워드 하나를 지우면 그 줄이 실패한다.
// TS 의 `apps/api/src/safety/domain/crisis-pattern.test.ts` 와 같은 표다.

use super::matches_crisis;

const SINGLE_KEYWORD_CASES: &[(&str, &str)] = &[
    ("kill myself", "Some nights I think I should kill myself."),
    (
        "killing myself",
        "I keep thinking about killing myself since Bori left.",
    ),
    ("end my life", "I want to end my life tonight."),
    ("want to die", "Without him I just want to die."),
    ("suicid (suicide)", "I have been thinking about suicide."),
    ("suicid (suicidal)", "I feel suicidal since the funeral."),
    ("self-harm", "I started to self-harm again last week."),
    ("self harm", "I am worried I will self harm."),
    ("selfharm", "selfharm feels like the only way out."),
];

#[test]
fn 키워드마다_잡는다() {
    for (keyword, text) in SINGLE_KEYWORD_CASES {
        assert!(matches_crisis(text), "{keyword}: {text}");
    }
}

#[test]
fn 대소문자를_가리지_않는다() {
    for text in [
        "I WANT TO DIE",
        "Kill Myself",
        "End My Life",
        "SUICIDAL thoughts",
        "Self-Harm",
        "SELF HARM",
    ] {
        assert!(matches_crisis(text), "{text}");
    }
}

#[test]
fn 그리움의_과장과_일반_슬픔은_잡지_않는다() {
    for text in [
        // 반려동물을 그리워하는 과장 표현
        "I could just die, I miss her so much.",
        "Losing Coco is killing me.",
        "This grief is going to kill me.",
        "I would die for one more walk with him.",
        "My life feels empty without my cat.",
        // 일반 슬픔 표현
        "I miss my dog every morning.",
        "I cried all day looking at his old toys.",
        "It hurts to come home to a quiet house.",
        // 빈 문자열
        "",
    ] {
        assert!(!matches_crisis(text), "{text}");
    }
}

#[test]
fn self_와_harm_사이의_공백은_한_글자까지다() {
    assert!(matches_crisis("self\tharm"));
    assert!(!matches_crisis("self  harm"));
}

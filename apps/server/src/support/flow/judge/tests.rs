use std::collections::BTreeMap;

use futures_util::FutureExt;

use super::{JudgeError, JudgeInput, Judgement, ReplyLabel, SharedReplyJudge, Unimplemented};

/// 지어낸 입력.
fn input() -> JudgeInput {
    JudgeInput {
        recent_user: vec!["지어낸 첫 말".to_owned(), "지어낸 둘째 말".to_owned()],
        reply: "지어낸 답".to_owned(),
        language: "ko".to_owned(),
    }
}

#[test]
fn 라벨은_글과_왕복한다() {
    for (label, text) in [
        (ReplyLabel::GenericComfort, "generic_comfort"),
        (ReplyLabel::SpecificReflection, "specific_reflection"),
        (ReplyLabel::Question, "question"),
    ] {
        assert_eq!(label.as_str(), text);
        assert_eq!(ReplyLabel::parse(text), Some(label));
    }
    assert_eq!(ReplyLabel::ALL.len(), 3);
    for label in ReplyLabel::ALL {
        assert_eq!(ReplyLabel::parse(label.as_str()), Some(label));
    }
}

#[test]
fn 모르는_라벨은_읽지_않는다() {
    for text in ["", "Generic_Comfort", "comfort", " question", "question "] {
        assert_eq!(ReplyLabel::parse(text), None, "{text:?}");
    }
}

#[test]
fn 판정은_라벨의_확률을_돌려준다() {
    let mut probabilities = BTreeMap::new();
    probabilities.insert(ReplyLabel::GenericComfort, 0.7);
    probabilities.insert(ReplyLabel::Question, 0.1);
    let with = Judgement {
        label: ReplyLabel::GenericComfort,
        probabilities: Some(probabilities),
        judge: "fixture",
        version: "0.0.1",
    };
    assert_eq!(with.probability(ReplyLabel::GenericComfort), Some(0.7));
    assert_eq!(with.probability(ReplyLabel::SpecificReflection), None);
    assert_eq!(with.label_probability(), Some(0.7));
    let without = Judgement {
        label: ReplyLabel::Question,
        probabilities: None,
        judge: "fixture",
        version: "0.0.1",
    };
    assert_eq!(without.probability(ReplyLabel::Question), None);
    assert_eq!(without.label_probability(), None);
}

#[test]
fn 판정기가_없으면_판정하지_않는다() {
    let judge: SharedReplyJudge = std::sync::Arc::new(Unimplemented);
    let result = judge.judge(input()).now_or_never().expect("곧바로 끝난다");
    assert!(matches!(result, Ok(None)), "{result:?}");
}

#[test]
fn 판정_실패의_문구에는_본문이_없다() {
    for error in [
        JudgeError::Timeout,
        JudgeError::Unavailable,
        JudgeError::BadResponse,
    ] {
        let text = error.to_string();
        assert!(!text.is_empty());
        assert!(!text.contains("지어낸"), "{text}");
    }
}

#[test]
fn 입력의_디버그_표시에_본문이_없다() {
    let text = format!("{:?}", input());
    assert!(!text.contains("지어낸"), "{text}");
    assert!(text.contains("ko"), "{text}");
}

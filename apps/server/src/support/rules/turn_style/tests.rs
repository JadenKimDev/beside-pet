mod decisions;
mod short_and_action;

use super::{QuestionPolicy, TurnStyle};
use crate::support::rules::ReplyJudgement;
use crate::support::{ReplyLabel, ReplyPhase};

fn style(phase: ReplyPhase, companion: &[&str], user: &[&str]) -> TurnStyle {
    TurnStyle::from_history(phase, companion, user)
}

const LONG_USER: &str = "오늘은 산책길을 혼자 걸었는데 자꾸 뒤를 돌아보게 되더라고요.";

#[test]
fn 첫_인사는_질문을_권한다() {
    let s = style(ReplyPhase::Intro, &[], &[]);
    assert_eq!(s.question, QuestionPolicy::Invite);
    assert!(
        s.instruction()
            .contains("Open the story of the pet with one gentle question.")
    );
}

#[test]
fn 첫_인사는_짧은_말과_거부_뒤에도_질문을_권한다() {
    let s = style(ReplyPhase::Intro, &["어떤 아이였나요?"], &["몰라", "응"]);
    assert_eq!(s.question, QuestionPolicy::Invite);
}

#[test]
fn 거부_뒤에는_질문하지_않는다() {
    let s = style(
        ReplyPhase::Task,
        &["그 시간이 길게 느껴졌겠어요."],
        &[
            "질문 그만 좀 해 줄래요. 대답하기가 힘들어요",
            LONG_USER,
            LONG_USER,
        ],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
    assert!(
        s.instruction()
            .contains("Do not ask any question in this reply.")
    );
}

#[test]
fn 질문_좀_그만해요도_거부다() {
    let s = style(
        ReplyPhase::Deepen,
        &["창가에 앉아 있던 모습이 떠오르네요."],
        &[LONG_USER, "질문 좀 그만해요"],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
}

#[test]
fn 거부는_최근_사용자_말_세_개까지만_본다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그 시간이 길게 느껴졌겠어요."],
        &[
            "모르겠어요 정말 아무것도 모르겠어요",
            LONG_USER,
            LONG_USER,
            LONG_USER,
        ],
    );
    assert_eq!(s.question, QuestionPolicy::Allow);
}

#[test]
fn 영어_거부도_본다() {
    let s = style(
        ReplyPhase::Deepen,
        &["That sounds like a long walk home."],
        &["Please stop asking me things, I just want to sit here for a while."],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
}

#[test]
fn 짧은_답_둘_뒤에는_질문하지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그날 밤이 많이 길었겠어요."],
        &[LONG_USER, "응", "그냥요"],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
}

#[test]
fn 짧은_답이_하나뿐이면_질문을_막지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그날 밤이 많이 길었겠어요."],
        &[LONG_USER, "응"],
    );
    assert_eq!(s.question, QuestionPolicy::Allow);
    let s = style(ReplyPhase::Deepen, &["그날 밤이 많이 길었겠어요."], &["응"]);
    assert_eq!(s.question, QuestionPolicy::Allow);
}

#[test]
fn 열다섯_자는_짧은_답이_아니다() {
    let fifteen = "가나다라마바사아자차카타파하가";
    assert_eq!(fifteen.chars().count(), 15);
    let s = style(
        ReplyPhase::Deepen,
        &["그날 밤이 많이 길었겠어요."],
        &[fifteen, "응"],
    );
    assert_eq!(s.question, QuestionPolicy::Allow);
}

#[test]
fn 직전_답이_질문이면_질문하지_않는다() {
    let s = style(
        ReplyPhase::Task,
        &["그날 산책은 어떤가요? (예: 산책)"],
        &[LONG_USER],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
    let s = style(
        ReplyPhase::Deepen,
        &["어떤 간식을 좋아했나요？ "],
        &[LONG_USER],
    );
    assert_eq!(s.question, QuestionPolicy::Forbid);
}

#[test]
fn 이전_답의_질문은_막지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "어떤 간식을 좋아했나요?",
            "그 소리가 아직 귀에 남아 있겠어요.",
        ],
        &[LONG_USER, LONG_USER],
    );
    assert_eq!(s.question, QuestionPolicy::Allow);
}

#[test]
fn 과제_단계에서_조건이_없으면_질문을_권한다() {
    let s = style(
        ReplyPhase::Task,
        &["그 소리가 아직 귀에 남아 있겠어요."],
        &[LONG_USER, LONG_USER],
    );
    assert_eq!(s.question, QuestionPolicy::Invite);
    assert!(
        s.instruction()
            .contains("If it feels natural, open the next topic with one gentle question.")
    );
}

#[test]
fn 깊어지기_단계에서_조건이_없으면_허용만_한다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그 소리가 아직 귀에 남아 있겠어요."],
        &[LONG_USER, LONG_USER],
    );
    assert_eq!(s.question, QuestionPolicy::Allow);
    let line = s.instruction();
    assert!(!line.contains("Do not ask"));
    assert!(!line.contains("question"));
}

#[test]
fn 최근_넷_중_정상화가_있으면_쉬게_한다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "그렇게 느끼는 건 자연스러워요.",
            "산책길이 길었겠어요.",
            "저녁이 조용했겠어요.",
            "그 담요가 남아 있군요.",
        ],
        &[LONG_USER],
    );
    assert!(s.avoid_reassure);
    assert!(s.instruction().contains("Do not say their feelings are natural, understandable, or proof of how much they loved the pet; you said that recently."));
}

#[test]
fn 다섯_번째_전의_정상화는_보지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "그만큼 사랑했다는 뜻이에요.",
            "산책길이 길었겠어요.",
            "저녁이 조용했겠어요.",
            "그 담요가 남아 있군요.",
            "아침 햇빛이 들었군요.",
        ],
        &[LONG_USER],
    );
    assert!(!s.avoid_reassure);
    assert!(!s.instruction().contains("feelings are natural"));
}

#[test]
fn 영어_정상화는_대소문자를_가리지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &["It is Normal to miss her this much."],
        &[LONG_USER],
    );
    assert!(s.avoid_reassure);
}

#[test]
fn 직전_두_답의_어미가_같으면_넘긴다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "그날 산책길이 많이 힘들었겠네요.",
            "밤이 길게 느껴졌을 텐데, 많이 지루했었겠네요 !",
        ],
        &[LONG_USER],
    );
    assert_eq!(s.repeated_ending.as_deref(), Some("었겠네요"));
    assert!(s.instruction().contains(
        "Your last two replies ended the same way (\"…었겠네요\"); end this one differently."
    ));
}

#[test]
fn 어미가_다르거나_답이_하나면_넘기지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그 길이 많이 허전했겠네요.", "그 담요가 남아 있군요."],
        &[LONG_USER],
    );
    assert_eq!(s.repeated_ending, None);
    let s = style(
        ReplyPhase::Deepen,
        &["그 길이 많이 허전했겠네요."],
        &[LONG_USER],
    );
    assert_eq!(s.repeated_ending, None);
    assert!(!s.instruction().contains("ended the same way"));
}

#[test]
fn 이미_쓴_상투구를_넘긴다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "천천히 이야기해도 괜찮아요. 여기 있을게요.",
            "코끝이 시큰했겠어요.",
        ],
        &[LONG_USER],
    );
    assert_eq!(s.used_stock, vec!["천천히", "여기 있을게", "코끝"]);
    assert!(s.instruction().contains(
        "Already said earlier in this chat, so say something else instead: \"천천히\", \"여기 있을게\", \"코끝\"."
    ));
}

#[test]
fn 사용자가_쓴_낱말은_상투구로_넘기지_않는다() {
    let s = style(
        ReplyPhase::Deepen,
        &["꼬리를 흔들며 반기던 모습이 떠오르네요. 천천히 말해 줘요."],
        &["현관에서 꼬리치던 게 아직도 생각나요.", LONG_USER],
    );
    assert_eq!(s.used_stock, vec!["천천히"]);
}

#[test]
fn 상투구가_없으면_넘김_문장이_없다() {
    let s = style(
        ReplyPhase::Deepen,
        &["그 담요가 남아 있군요."],
        &[LONG_USER],
    );
    assert!(s.used_stock.is_empty());
    assert!(!s.instruction().contains("Already said"));
}

#[test]
fn 지시_줄은_늘_되받지_말라는_말로_끝난다() {
    let s = style(ReplyPhase::Deepen, &[], &[]);
    assert_eq!(
        s.instruction(),
        "For this reply: Refer to what they said in your own words; do not open by repeating their sentence."
    );
}

#[test]
fn 지시_줄은_힌트를_순서대로_공백으로_잇는다() {
    let s = style(
        ReplyPhase::Deepen,
        &[
            "그건 당연한 마음이에요. 천천히 해요.",
            "그 마음이 당연해요.",
        ],
        &["응", "몰라"],
    );
    assert_eq!(
        s.instruction(),
        "For this reply: Keep this reply to one or two sentences, ask no question, and stay with the one thing they said. \
Do not say their feelings are natural, understandable, or proof of how much they loved the pet; you said that recently. \
Already said earlier in this chat, so say something else instead: \"천천히\". \
Refer to what they said in your own words; do not open by repeating their sentence."
    );
}

/// 직전 답의 판정(지어낸 값).
fn judged(label: ReplyLabel, probability: Option<f32>) -> ReplyJudgement {
    ReplyJudgement {
        label,
        label_probability: probability,
        judge: "fixture@0.0.1".to_owned(),
    }
}

const AFTER_GENERIC: &str =
    "Your last reply was general comfort; this time pick up one concrete thing they said.";

#[test]
fn 직전_답이_임계값_이상의_일반_위로면_구체_하나를_받는_줄이_붙는다() {
    let previous = judged(ReplyLabel::GenericComfort, Some(0.5));
    let s = style(
        ReplyPhase::Task,
        &["그 시간이 길게 느껴졌겠어요."],
        &[LONG_USER],
    )
    .after_judgement(Some(&previous), 0.5);
    assert!(s.after_generic);
    assert!(
        s.instruction().contains(AFTER_GENERIC),
        "{}",
        s.instruction()
    );
}

#[test]
fn 직전_답의_일반_위로_확률이_임계값_밑이면_줄이_없다() {
    let previous = judged(ReplyLabel::GenericComfort, Some(0.49));
    let s = style(ReplyPhase::Task, &[], &[LONG_USER]).after_judgement(Some(&previous), 0.5);
    assert!(!s.after_generic);
    assert!(!s.instruction().contains(AFTER_GENERIC));
}

#[test]
fn 확률이_없는_판정기는_라벨만으로_본다() {
    let generic = judged(ReplyLabel::GenericComfort, None);
    let s = style(ReplyPhase::Task, &[], &[LONG_USER]).after_judgement(Some(&generic), 0.5);
    assert!(s.instruction().contains(AFTER_GENERIC));
    let question = judged(ReplyLabel::Question, None);
    let s = style(ReplyPhase::Task, &[], &[LONG_USER]).after_judgement(Some(&question), 0.5);
    assert!(!s.instruction().contains(AFTER_GENERIC));
}

#[test]
fn 다른_라벨이나_판정_없음이면_지금과_같다() {
    let base = style(ReplyPhase::Deepen, &["어떤 아이였나요?"], &[LONG_USER]);
    let specific = judged(ReplyLabel::SpecificReflection, Some(0.9));
    assert_eq!(base.clone().after_judgement(None, 0.5), base);
    assert_eq!(base.clone().after_judgement(Some(&specific), 0.5), base);
}

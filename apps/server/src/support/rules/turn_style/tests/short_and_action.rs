//! 짧은 말 뒤의 짧은 답, 직전 답의 동작(감정 추정·뜻 부여·허락) 넘기기.

use super::super::{ActionKind, QuestionPolicy, TurnStyle};
use super::LONG_USER;
use crate::support::ReplyPhase;

const SHORT_LINE: &str = "Keep this reply to one or two sentences, ask no question, and stay with the one thing they said.";
const ACTION_LINE: &str = "Your last reply explained their feelings; this time say only what you notice, or answer what they asked.";
const PLAIN_REPLY: &str = "그 담요가 아직 소파 위에 있군요.";

fn style(companion: &[&str], user: &[&str]) -> TurnStyle {
    TurnStyle::from_history(ReplyPhase::Deepen, companion, user)
}

#[test]
fn 열다섯_자_이하의_말_뒤에는_짧은_답_줄이_붙는다() {
    let fifteen = "가나다라마바사아자차카타파하가";
    assert_eq!(fifteen.chars().count(), 15);
    for said in ["응", "그냥요", fifteen] {
        let s = style(&[PLAIN_REPLY], &[LONG_USER, said]);
        assert!(s.short_reply, "{said}");
        assert!(s.instruction().contains(SHORT_LINE), "{}", s.instruction());
    }
}

#[test]
fn 열여섯_자_이상이면_짧은_답_줄이_없다() {
    let sixteen = "가나다라마바사아자차카타파하가나";
    assert_eq!(sixteen.chars().count(), 16);
    let s = style(&[PLAIN_REPLY], &["응", sixteen]);
    assert!(!s.short_reply);
    assert!(!s.instruction().contains(SHORT_LINE));
}

#[test]
fn 짧은_답_줄은_질문_금지와_겹쳐도_한_번만_말한다() {
    let s = style(&["어떤 아이였나요?"], &["응", "몰라"]);
    assert_eq!(s.question, QuestionPolicy::Forbid);
    let line = s.instruction();
    assert!(line.contains(SHORT_LINE));
    assert!(!line.contains("Do not ask any question"), "{line}");
    assert_eq!(line.matches("question").count(), 1, "{line}");
}

#[test]
fn 짧은_답_줄은_질문_권유를_대신한다() {
    let s = TurnStyle::from_history(ReplyPhase::Task, &[PLAIN_REPLY], &[LONG_USER, "네"]);
    let line = s.instruction();
    assert!(line.contains(SHORT_LINE));
    assert!(!line.contains("gentle question"), "{line}");
}

#[test]
fn 첫_인사_단계에는_짧은_답_줄이_없다() {
    let s = TurnStyle::from_history(ReplyPhase::Intro, &[], &["응"]);
    assert!(!s.short_reply);
    assert!(!s.instruction().contains(SHORT_LINE));
}

#[test]
fn 직전_답의_감정_추정을_넘긴다() {
    let s = style(
        &["혼자 감당하시는 무게가 더 크게 느껴지셨을 것 같아요."],
        &[LONG_USER],
    );
    assert_eq!(s.after_action, vec![ActionKind::FeelingGuess]);
    assert!(s.instruction().contains(ACTION_LINE), "{}", s.instruction());
}

#[test]
fn 직전_답의_뜻_부여를_넘긴다() {
    let s = style(
        &["모르겠다는 말도 지금 마음이 있는 자리를 보여 주는 거예요."],
        &[LONG_USER],
    );
    assert_eq!(s.after_action, vec![ActionKind::MeaningGiven]);
    assert!(s.instruction().contains(ACTION_LINE));
}

#[test]
fn 직전_답의_허락을_넘긴다() {
    let s = style(&["오늘은 그 자리를 그냥 곁에 두셔도 돼요."], &[LONG_USER]);
    assert_eq!(s.after_action, vec![ActionKind::Permission]);
    assert!(s.instruction().contains(ACTION_LINE));
}

#[test]
fn 여러_유형은_정해진_순서로_모두_적고_줄은_하나다() {
    let s = style(
        &["많이 아프셨겠어요. 그만큼 아꼈다는 뜻이에요. 울어도 괜찮아요, 울어도 돼요."],
        &[LONG_USER],
    );
    assert_eq!(
        s.after_action,
        vec![
            ActionKind::FeelingGuess,
            ActionKind::MeaningGiven,
            ActionKind::Permission
        ]
    );
    assert_eq!(
        s.instruction().matches("your last reply explained").count(),
        0
    );
    assert_eq!(
        s.instruction().matches("Your last reply explained").count(),
        1
    );
}

#[test]
fn 이전_답의_동작은_보지_않는다() {
    let s = style(&["많이 아프셨겠어요.", PLAIN_REPLY], &[LONG_USER]);
    assert!(s.after_action.is_empty());
    assert!(!s.instruction().contains(ACTION_LINE));
}

#[test]
fn 직전_사용자_말에_있던_낱말은_동작으로_넘기지_않는다() {
    let s = style(
        &["그만큼 함께한 시간이 길었다는 뜻이에요."],
        &["그만큼 오래 같이 살았다는 뜻이겠죠, 그래서 더 허전해요."],
    );
    assert!(s.after_action.is_empty(), "{:?}", s.after_action);
    assert!(!s.instruction().contains(ACTION_LINE));
}

#[test]
fn 사용자_낱말_제외는_그_패턴만_뺀다() {
    let s = style(
        &["울어도 괜찮아요. 많이 아프셨겠어요."],
        &["울어도 괜찮은 건가요 이렇게 계속 울어도"],
    );
    assert_eq!(s.after_action, vec![ActionKind::FeelingGuess]);
}

#[test]
fn 정상화와_뜻_부여가_함께여도_줄이_겹치지_않는다() {
    let s = style(&["그만큼 사랑했다는 증거예요."], &[LONG_USER]);
    assert!(s.avoid_reassure);
    assert_eq!(s.after_action, vec![ActionKind::MeaningGiven]);
    let line = s.instruction();
    assert_eq!(
        line.matches("Your last reply explained their feelings")
            .count(),
        1,
        "{line}"
    );
    assert!(
        !line.contains("Do not say their feelings are natural"),
        "{line}"
    );
    assert!(line.contains("natural"), "{line}");
}

#[test]
fn 영어_감정_추정을_넘긴다() {
    let s = style(&["You Must Have Felt so alone that night."], &[LONG_USER]);
    assert_eq!(s.after_action, vec![ActionKind::FeelingGuess]);
}

#[test]
fn 영어_뜻_부여를_넘긴다() {
    let s = style(
        &["Missing her like this shows how much she mattered."],
        &[LONG_USER],
    );
    assert_eq!(s.after_action, vec![ActionKind::MeaningGiven]);
}

#[test]
fn 영어_허락을_넘긴다() {
    let s = style(&["It's okay to leave her bowl where it is."], &[LONG_USER]);
    assert_eq!(s.after_action, vec![ActionKind::Permission]);
}

#[test]
fn 동작이_없는_답_뒤에는_줄이_없다() {
    let s = style(&[PLAIN_REPLY], &[LONG_USER]);
    assert!(s.after_action.is_empty());
    assert!(!s.instruction().contains(ACTION_LINE));
}

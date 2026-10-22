//! sandbox 턴 추적에 남길 화법 결정의 직렬화 모양.

use super::super::{TurnStyle, TurnStyleDecisions};
use super::LONG_USER;
use crate::support::ReplyPhase;

fn json(decisions: &TurnStyleDecisions) -> String {
    serde_json::to_string(decisions).expect("직렬화")
}

#[test]
fn 결정은_정해진_칸_이름으로_직렬화된다() {
    let s = TurnStyle::from_history(
        ReplyPhase::Deepen,
        &[
            "천천히 해요. 그날 산책길이 많이 힘들었겠네요.",
            "그만큼 아꼈다는 뜻이에요. 많이 지루했었겠네요.",
        ],
        &["응", "네"],
    );
    assert_eq!(
        json(&s.decisions()),
        r#"{"questionPolicy":"forbid","reassureCooldown":true,"endingAvoid":"었겠네요","stockPassed":["천천히"],"judgeLine":false,"shortRule":true,"actionRule":["feelingGuess","meaningGiven"]}"#
    );
}

#[test]
fn 결정이_없으면_어미_칸은_빠지고_목록은_빈다() {
    let s = TurnStyle::from_history(
        ReplyPhase::Task,
        &["그 담요가 아직 소파 위에 있군요."],
        &[LONG_USER],
    );
    assert_eq!(
        json(&s.decisions()),
        r#"{"questionPolicy":"invite","reassureCooldown":false,"stockPassed":[],"judgeLine":false,"shortRule":false,"actionRule":[]}"#
    );
}

#[test]
fn 질문_정책은_소문자_이름이다() {
    let allow = TurnStyle::from_history(ReplyPhase::Deepen, &[], &[LONG_USER]);
    assert!(json(&allow.decisions()).starts_with(r#"{"questionPolicy":"allow""#));
}

// 턴 분석에 답의 판정을 적기(ADR-0031). 값은 모두 지어낸 것이다.

use std::collections::BTreeMap;

use super::{ENGAGED, at, id, safe_turn, session};
use crate::support::rules::ReplyJudgement;
use crate::support::session::{Session, SessionError};
use crate::support::{Judgement, ReplyLabel, RiskDetector};

fn systemone(label: ReplyLabel, probability: f32) -> Judgement {
    Judgement {
        label,
        probabilities: Some(BTreeMap::from([
            (label, probability),
            (ReplyLabel::Question, 1.0 - probability),
        ])),
        judge: "systemone",
        version: "0.1.0",
    }
}

fn haiku(label: ReplyLabel) -> Judgement {
    Judgement {
        label,
        probabilities: None,
        judge: "haiku",
        version: "0.1.0",
    }
}

/// 끝난 사용자 턴 둘(턴 1, 2)의 세션.
fn two_turns() -> Session {
    let mut session = session();
    safe_turn(&mut session, ENGAGED, 1);
    safe_turn(&mut session, ENGAGED, 2);
    session
}

#[test]
fn 끝난_턴의_분석에만_판정을_적는다() {
    let mut session = two_turns();
    session
        .record_reply_judgement(&id(1), systemone(ReplyLabel::GenericComfort, 0.75))
        .unwrap();
    assert_eq!(
        session.analyses[0].reply,
        Some(ReplyJudgement {
            label: ReplyLabel::GenericComfort,
            label_probability: Some(0.75),
            judge: "systemone@0.1.0".to_owned(),
        })
    );
    assert_eq!(session.analyses[1].reply, None, "다른 턴의 분석은 그대로다");
}

#[test]
fn 확률이_없는_판정기는_확률_없이_적는다() {
    let mut session = two_turns();
    session
        .record_reply_judgement(&id(2), haiku(ReplyLabel::Question))
        .unwrap();
    assert_eq!(
        session.analyses[1].reply,
        Some(ReplyJudgement {
            label: ReplyLabel::Question,
            label_probability: None,
            judge: "haiku@0.1.0".to_owned(),
        })
    );
}

#[test]
fn 범위_밖의_확률은_적지_않고_라벨만_남는다() {
    for probability in [1.5, -0.1, f32::NAN] {
        let mut session = two_turns();
        session
            .record_reply_judgement(&id(1), systemone(ReplyLabel::GenericComfort, probability))
            .unwrap();
        let reply = session.analyses[0].reply.clone().unwrap();
        assert_eq!(reply.label, ReplyLabel::GenericComfort);
        assert_eq!(reply.label_probability, None, "{probability}");
    }
}

#[test]
fn 다시_적으면_새_판정으로_덮는다() {
    let mut session = two_turns();
    session
        .record_reply_judgement(&id(1), systemone(ReplyLabel::GenericComfort, 0.75))
        .unwrap();
    session
        .record_reply_judgement(&id(1), haiku(ReplyLabel::SpecificReflection))
        .unwrap();
    assert_eq!(
        session.analyses[0].reply.as_ref().map(|reply| reply.label),
        Some(ReplyLabel::SpecificReflection)
    );
}

#[test]
fn 판정은_스냅샷으로_오가도_남는다() {
    let mut session = two_turns();
    session
        .record_reply_judgement(&id(2), systemone(ReplyLabel::SpecificReflection, 0.5))
        .unwrap();
    let back = Session::rehydrate(session.snapshot());
    assert_eq!(back, session);
    let mut again = back;
    again
        .record_reply_judgement(&id(1), haiku(ReplyLabel::Question))
        .unwrap();
    assert!(
        again.analyses[0].reply.is_some(),
        "되살린 세션에서도 턴과 분석을 잇는다"
    );
}

#[test]
fn 없는_턴과_끝나지_않은_턴은_거절하고_아무것도_바꾸지_않는다() {
    let mut session = two_turns();
    session.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    let before = session.clone();
    assert_eq!(
        session.record_reply_judgement(&id(9), haiku(ReplyLabel::Question)),
        Err(SessionError::TurnNotFound)
    );
    assert_eq!(
        session.record_reply_judgement(&id(3), haiku(ReplyLabel::Question)),
        Err(SessionError::TurnNotPending)
    );
    assert_eq!(session, before);
}

#[test]
fn 첫_인사_턴과_위기_턴은_판정하지_않는다() {
    let mut session = session();
    session.greet(id(1), "A made-up greeting.", at(1)).unwrap();
    safe_turn(&mut session, ENGAGED, 2);
    session
        .accept_crisis_turn(
            id(3),
            "made-up crisis text",
            "A fixed crisis reply.",
            RiskDetector::Keyword,
            at(3),
        )
        .unwrap();
    let before = session.clone();
    assert_eq!(
        session.record_reply_judgement(&id(1), haiku(ReplyLabel::Question)),
        Err(SessionError::TurnNotPending),
        "첫 인사 턴에는 분석이 없다"
    );
    assert_eq!(
        session.record_reply_judgement(&id(3), haiku(ReplyLabel::GenericComfort)),
        Err(SessionError::TurnNotPending),
        "위기 고정 문구 턴은 판정하지 않는다"
    );
    assert_eq!(session, before);
}

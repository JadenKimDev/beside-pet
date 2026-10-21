// 턴의 받기와 전이 적용, 턴 상태. 픽스처는 지어낸 값이다.

use super::{DUNNO, ENGAGED, at, profile, session, session_at, t0, task};
use crate::support::rules::{SupportLevel, Task};
use crate::support::session::{Session, SessionError, Turn, TurnErrorKind, TurnStatus};
use crate::support::{MessageRole, ReplyPhase};

const CRISIS_REPLY: &str = "A made-up fixed crisis reply.";

fn id(n: u32) -> String {
    format!("00000000-0000-4000-8000-{n:012}")
}

/// 받고 바로 답까지 끝낸 턴.
fn done_turn(session: &mut Session, n: u32, text: &str, minute: i64) {
    session.accept_user_turn(id(n), text, at(minute)).unwrap();
    session
        .complete_turn(
            &id(n),
            SupportLevel::Safe,
            "A made-up reply.",
            vec![],
            at(minute),
        )
        .unwrap();
}

#[test]
fn 메시지_받기는_전사와_pending_턴만_더하고_상태를_바꾸지_않는다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    assert_eq!(session.task(), Task::FIRST);
    assert_eq!(session.retry_count, 0);
    assert_eq!(session.support_level(), SupportLevel::Safe);
    assert!(!session.closed());
    assert!(session.analyses.is_empty());
    let message = session.history().last().unwrap();
    assert_eq!(message.role, MessageRole::User);
    assert_eq!(message.text, ENGAGED);
    assert_eq!(message.task, Task::FIRST);
    assert_eq!(message.turn_id.as_deref(), Some(id(1).as_str()));
    assert_eq!(
        session.turns(),
        &[Turn {
            id: id(1),
            status: TurnStatus::Pending,
            started_at: at(1),
            finished_at: None,
            error_kind: None,
        }]
    );
}

#[test]
fn 전이_적용은_답과_분석을_적고_턴을_done_으로_닫는다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    let step = session
        .complete_turn(
            &id(1),
            SupportLevel::Watch,
            "A made-up reply.",
            vec![],
            at(2),
        )
        .unwrap();
    assert_eq!(step.phase, ReplyPhase::Deepen);
    assert_eq!(session.retry_count, 1);
    assert_eq!(session.support_level(), SupportLevel::Watch);
    assert_eq!(session.analyses.len(), 1);
    let reply = session.history().last().unwrap();
    assert_eq!(reply.role, MessageRole::Assistant);
    assert_eq!(reply.turn_id.as_deref(), Some(id(1).as_str()));
    let turn = &session.turns()[0];
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(turn.finished_at, Some(at(2)));
    assert_eq!(turn.error_kind, None);
}

#[test]
fn 전이_계산은_상태를_바꾸지_않고_적용과_같은_결과를_낸다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    done_turn(&mut session, 2, ENGAGED, 2);
    session.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    let before = session.clone();
    let planned = session.transition(&id(3), SupportLevel::Safe).unwrap();
    assert_eq!(session, before, "계산은 세션을 바꾸지 않는다");
    assert!(planned.advanced);
    assert_eq!(planned.to, task(2));
    let applied = session
        .complete_turn(
            &id(3),
            SupportLevel::Safe,
            "A made-up reply.",
            vec![],
            at(4),
        )
        .unwrap();
    assert_eq!(applied, planned);
    assert_eq!(session.task(), task(2));
}

#[test]
fn 실패한_턴은_전이를_움직이지_않고_같은_메시지에서_같은_전이가_나온다() {
    let mut failed = session();
    done_turn(&mut failed, 1, ENGAGED, 1);
    done_turn(&mut failed, 2, ENGAGED, 2);
    failed.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    let before_fail = failed.transition(&id(3), SupportLevel::Safe).unwrap();
    failed
        .fail_turn(&id(3), TurnErrorKind::Timeout, at(4))
        .unwrap();
    assert_eq!(failed.task(), Task::FIRST);
    assert_eq!(failed.retry_count, 2);
    assert_eq!(failed.analyses.len(), 2);
    let turn = failed.turns().last().unwrap();
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Timeout));
    assert_eq!(turn.finished_at, Some(at(4)));
    assert_eq!(
        failed.history().last().unwrap().text,
        ENGAGED,
        "사용자 메시지는 남는다"
    );
    assert_eq!(
        failed.transition(&id(3), SupportLevel::Safe),
        Err(SessionError::TurnNotPending),
        "끝난 턴은 다시 적용하지 않는다"
    );

    // 실패한 턴의 메시지는 다음 턴의 깊이에 세지 않는다: 같은 메시지를 새 턴으로 받으면 같은 전이다.
    failed.accept_user_turn(id(4), ENGAGED, at(5)).unwrap();
    assert_eq!(
        failed.transition(&id(4), SupportLevel::Safe),
        Ok(before_fail)
    );
}

#[test]
fn 같은_턴_id_는_받지_않고_아무것도_바뀌지_않는다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    let before = session.clone();
    assert_eq!(
        session.accept_user_turn(id(1), DUNNO, at(2)),
        Err(SessionError::TurnAlreadyReceived)
    );
    assert_eq!(session, before);
    assert_eq!(
        session.greet(id(1), "A made-up greeting.", at(2)),
        Err(SessionError::TurnAlreadyReceived)
    );
    assert_eq!(session, before);
}

#[test]
fn 닫힌_세션은_메시지를_받지_않는다() {
    let mut session = session();
    session.close();
    let before = session.clone();
    assert_eq!(
        session.accept_user_turn(id(1), ENGAGED, at(1)),
        Err(SessionError::Closed)
    );
    assert_eq!(session, before);
}

#[test]
fn 없는_턴은_적용하거나_실패로_닫을_수_없다() {
    let mut session = session();
    assert_eq!(
        session.transition(&id(9), SupportLevel::Safe),
        Err(SessionError::TurnNotFound)
    );
    assert_eq!(
        session.complete_turn(&id(9), SupportLevel::Safe, "x", vec![], at(1)),
        Err(SessionError::TurnNotFound)
    );
    assert_eq!(
        session.fail_turn(&id(9), TurnErrorKind::Provider, at(1)),
        Err(SessionError::TurnNotFound)
    );
}

#[test]
fn 끝난_턴은_다시_닫지_않는다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    let before = session.clone();
    assert_eq!(
        session.fail_turn(&id(1), TurnErrorKind::Restart, at(2)),
        Err(SessionError::TurnNotPending)
    );
    assert_eq!(
        session.complete_turn(&id(1), SupportLevel::Safe, "x", vec![], at(2)),
        Err(SessionError::TurnNotPending)
    );
    assert_eq!(session, before);
}

#[test]
fn 클로징에_닿은_턴은_적용과_함께_닫힌다() {
    let mut session = session_at(task(4));
    done_turn(&mut session, 1, ENGAGED, 1);
    done_turn(&mut session, 2, ENGAGED, 2);
    assert!(!session.closed());
    session.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    assert!(!session.closed(), "받기만 해서는 닫히지 않는다");
    let step = session
        .complete_turn(
            &id(3),
            SupportLevel::Safe,
            "A made-up closing.",
            vec![],
            at(4),
        )
        .unwrap();
    assert!(step.closes());
    assert!(session.closed());
    assert_eq!(session.task(), Task::CLOSING);
}

#[test]
fn 위기_턴은_받자마자_닫고_고정_문구를_적고_done_이다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    let step = session
        .accept_crisis_turn(id(2), "made-up crisis text", CRISIS_REPLY, at(2))
        .unwrap();
    assert!(step.is_crisis());
    assert!(step.closes());
    assert_eq!(step.from, task(1));
    assert_eq!(step.to, task(1));
    assert!(session.closed());
    assert_eq!(session.support_level(), SupportLevel::Crisis);
    assert_eq!(session.task(), task(1));
    assert_eq!(
        session.retry_count, 1,
        "위기 턴은 깊이 게이트를 거치지 않는다"
    );
    let history = session.history();
    assert_eq!(history.len(), 4);
    assert_eq!(history[2].role, MessageRole::User);
    assert_eq!(history[2].turn_id.as_deref(), Some(id(2).as_str()));
    assert_eq!(history[3].role, MessageRole::Assistant);
    assert_eq!(history[3].text, CRISIS_REPLY);
    assert_eq!(history[3].turn_id.as_deref(), Some(id(2).as_str()));
    let turn = session.turns().last().unwrap();
    assert_eq!(turn.status, TurnStatus::Done);
    assert_eq!(turn.started_at, at(2));
    assert_eq!(turn.finished_at, Some(at(2)));
    let analysis = session.analyses.last().unwrap();
    assert_eq!(analysis.risk.level, SupportLevel::Crisis);
    assert_eq!(analysis.phase, ReplyPhase::Closing);
}

#[test]
fn 위기_턴도_같은_턴_id_와_닫힌_세션을_받지_않는다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    assert_eq!(
        session.accept_crisis_turn(id(1), "made-up crisis text", CRISIS_REPLY, at(2)),
        Err(SessionError::TurnAlreadyReceived)
    );
    let mut closed = super::session();
    closed.close();
    assert_eq!(
        closed.accept_crisis_turn(id(2), "made-up crisis text", CRISIS_REPLY, at(2)),
        Err(SessionError::Closed)
    );
}

#[test]
fn 첫_인사는_사용자_메시지_없는_done_턴이다() {
    let mut session = session();
    session.greet(id(1), "A made-up greeting.", t0()).unwrap();
    let history = session.history();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].role, MessageRole::Assistant);
    assert_eq!(history[0].task, Task::FIRST);
    assert_eq!(history[0].turn_id.as_deref(), Some(id(1).as_str()));
    assert_eq!(
        session.turns(),
        &[Turn {
            id: id(1),
            status: TurnStatus::Done,
            started_at: t0(),
            finished_at: Some(t0()),
            error_kind: None,
        }]
    );
    assert!(
        session.analyses.is_empty(),
        "인사는 턴 분석을 남기지 않는다"
    );
    assert_eq!(session.retry_count, 0);
}

#[test]
fn 턴_상태와_오류_종류의_문자열() {
    for (status, text) in [
        (TurnStatus::Pending, "pending"),
        (TurnStatus::Done, "done"),
        (TurnStatus::Failed, "failed"),
    ] {
        assert_eq!(status.as_str(), text);
        assert_eq!(TurnStatus::parse(text), Some(status));
    }
    assert_eq!(TurnStatus::parse("running"), None);
    for (kind, text) in [
        (TurnErrorKind::Timeout, "timeout"),
        (TurnErrorKind::Provider, "provider"),
        (TurnErrorKind::Restart, "restart"),
    ] {
        assert_eq!(kind.as_str(), text);
        assert_eq!(TurnErrorKind::parse(text), Some(kind));
    }
    assert_eq!(TurnErrorKind::parse("unknown"), None);
}

#[test]
fn 스냅샷에_턴이_들어가고_되살려도_같다() {
    let mut session = session();
    session.greet(id(1), "A made-up greeting.", t0()).unwrap();
    done_turn(&mut session, 2, ENGAGED, 1);
    session.accept_user_turn(id(3), DUNNO, at(2)).unwrap();
    session
        .fail_turn(&id(3), TurnErrorKind::Provider, at(3))
        .unwrap();
    session.accept_user_turn(id(4), ENGAGED, at(4)).unwrap();

    let snapshot = session.snapshot();
    assert_eq!(snapshot.grief_profile, profile());
    assert_eq!(snapshot.turns.len(), 4);
    assert_eq!(snapshot.turns[2].status, TurnStatus::Failed);
    assert_eq!(snapshot.turns[3].status, TurnStatus::Pending);
    assert_eq!(snapshot.history.len(), 5);

    let mut back = Session::rehydrate(snapshot.clone());
    assert_eq!(back, session);
    assert_eq!(back.snapshot(), snapshot);
    assert_eq!(
        back.accept_user_turn(id(2), ENGAGED, at(5)),
        Err(SessionError::TurnAlreadyReceived),
        "되살린 세션도 받은 턴 id 를 안다"
    );
    back.complete_turn(
        &id(4),
        SupportLevel::Safe,
        "A made-up reply.",
        vec![],
        at(5),
    )
    .unwrap();
    assert_eq!(back.turns()[3].status, TurnStatus::Done);
}

#[test]
fn 옛_메서드는_턴_없이_그대로_돈다() {
    let mut session = session();
    super::safe_turn(&mut session, ENGAGED, 1);
    session.record_reply("A made-up reply.", at(2));
    assert!(session.turns().is_empty());
    assert!(session.history().iter().all(|m| m.turn_id.is_none()));
}

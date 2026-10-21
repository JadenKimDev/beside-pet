// 턴의 흐름 상태(streaming), 중단(cancelled), 숨김, 상태 응답의 진행 중·실패 턴. 픽스처는 지어낸 값이다.

use super::{DUNNO, ENGAGED, answered, at, id, safe, session};
use crate::support::MessageRole;
use crate::support::rules::Task;
use crate::support::session::{Message, Session, SessionError, TurnErrorKind, TurnStatus};

const PARTIAL: &str = "A made-up partial rep";

fn done_turn(session: &mut Session, n: u32, text: &str, minute: i64) {
    answered(session, n, text, safe(), "A made-up reply.", vec![], minute);
}

fn status_of(session: &Session, n: u32) -> TurnStatus {
    session
        .turns()
        .iter()
        .find(|turn| turn.id == id(n))
        .unwrap()
        .status
}

fn texts<'a>(messages: impl IntoIterator<Item = &'a Message>) -> Vec<&'a str> {
    messages.into_iter().map(|m| m.text.as_str()).collect()
}

#[test]
fn 답이_시작하면_streaming_이고_끝나면_done_이다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    session.start_streaming(&id(1), at(2)).unwrap();
    let turn = &session.turns()[0];
    assert_eq!(turn.status, TurnStatus::Streaming);
    assert_eq!(turn.finished_at, None, "흐르는 턴은 아직 끝나지 않았다");
    assert_eq!(
        session.start_streaming(&id(1), at(2)),
        Err(SessionError::TurnNotPending),
        "streaming 은 pending 에서만"
    );
    let planned = session.transition(&id(1), safe()).unwrap();
    let step = session
        .complete_turn(&id(1), safe(), "A made-up reply.", vec![], at(3))
        .unwrap();
    assert_eq!(step, planned);
    assert_eq!(status_of(&session, 1), TurnStatus::Done);
    assert_eq!(session.turns()[0].finished_at, Some(at(3)));
    assert_eq!(
        session.start_streaming(&id(1), at(4)),
        Err(SessionError::TurnNotPending)
    );
    assert_eq!(
        session.start_streaming(&id(9), at(4)),
        Err(SessionError::TurnNotFound)
    );
}

#[test]
fn 흐르던_턴도_실패로_닫힌다() {
    let mut session = session();
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    session.start_streaming(&id(1), at(2)).unwrap();
    session
        .fail_turn(&id(1), TurnErrorKind::Timeout, at(3))
        .unwrap();
    let turn = &session.turns()[0];
    assert_eq!(turn.status, TurnStatus::Failed);
    assert_eq!(turn.error_kind, Some(TurnErrorKind::Timeout));
    assert_eq!(turn.finished_at, Some(at(3)));
}

#[test]
fn 중단은_부분_답을_그_턴으로_적고_분석과_상태를_건드리지_않는다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    session.accept_user_turn(id(2), ENGAGED, at(2)).unwrap();
    session.start_streaming(&id(2), at(3)).unwrap();
    let task = session.task();
    let level = session.support_level();
    let analyses = session.analyses.len();
    let retry = session.retry_count;
    session.cancel_turn(&id(2), Some(PARTIAL), at(4)).unwrap();

    let turn = &session.turns()[1];
    assert_eq!(turn.status, TurnStatus::Cancelled);
    assert_eq!(turn.finished_at, Some(at(4)));
    assert_eq!(turn.error_kind, None);
    assert_eq!(session.task(), task);
    assert_eq!(session.support_level(), level);
    assert_eq!(session.retry_count, retry);
    assert_eq!(session.analyses.len(), analyses, "턴 분석은 쓰지 않는다");
    assert!(!session.closed());

    let stored = session.snapshot().history;
    let last = stored.last().unwrap();
    assert_eq!(last.role, MessageRole::Assistant);
    assert_eq!(last.text, PARTIAL);
    assert_eq!(last.turn_id.as_deref(), Some(id(2).as_str()));
    assert_eq!(last.at, at(4));
    assert_eq!(stored.len(), 4, "사용자 말과 부분 답이 저장에 남는다");
}

#[test]
fn pending_턴도_중단되고_부분_답이_없으면_답을_적지_않는다() {
    let mut session = session();
    session.accept_user_turn(id(1), DUNNO, at(1)).unwrap();
    session.cancel_turn(&id(1), None, at(2)).unwrap();
    assert_eq!(status_of(&session, 1), TurnStatus::Cancelled);
    assert_eq!(session.snapshot().history.len(), 1);
    // 빈 부분 답도 적지 않는다.
    session.accept_user_turn(id(2), DUNNO, at(3)).unwrap();
    session.start_streaming(&id(2), at(3)).unwrap();
    session.cancel_turn(&id(2), Some(""), at(4)).unwrap();
    assert_eq!(session.snapshot().history.len(), 2);
}

#[test]
fn 중단은_멱등이고_끝난_턴은_중단하지_않는다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    session.accept_user_turn(id(2), ENGAGED, at(2)).unwrap();
    session
        .fail_turn(&id(2), TurnErrorKind::Provider, at(3))
        .unwrap();
    session.accept_user_turn(id(3), ENGAGED, at(4)).unwrap();
    session.cancel_turn(&id(3), Some(PARTIAL), at(5)).unwrap();
    let before = session.clone();
    assert_eq!(session.cancel_turn(&id(3), Some("more"), at(6)), Ok(()));
    assert_eq!(session, before, "다시 중단해도 아무것도 바뀌지 않는다");
    for n in [1, 2] {
        assert_eq!(
            session.cancel_turn(&id(n), None, at(6)),
            Err(SessionError::TurnNotPending)
        );
    }
    assert_eq!(
        session.cancel_turn(&id(9), None, at(6)),
        Err(SessionError::TurnNotFound)
    );
    assert_eq!(session, before);
    assert_eq!(
        session.complete_turn(&id(3), safe(), "x", vec![], at(7)),
        Err(SessionError::TurnNotPending),
        "중단한 턴은 끝내지 않는다"
    );
    assert_eq!(
        session.start_streaming(&id(3), at(7)),
        Err(SessionError::TurnNotPending)
    );
}

#[test]
fn 중단한_턴은_history_와_기록에서_빠지고_스냅샷에는_남는다() {
    let mut session = session();
    session.greet(id(1), "A made-up greeting.", at(0)).unwrap();
    done_turn(&mut session, 2, ENGAGED, 1);
    session
        .accept_user_turn(id(3), "made-up cancelled words", at(2))
        .unwrap();
    session.start_streaming(&id(3), at(2)).unwrap();
    session.cancel_turn(&id(3), Some(PARTIAL), at(3)).unwrap();

    let shown = vec!["A made-up greeting.", ENGAGED, "A made-up reply."];
    assert_eq!(texts(session.history()), shown);
    assert_eq!(texts(session.visible_messages()), shown);
    assert_eq!(
        session
            .history_response()
            .iter()
            .map(|m| m.text.as_str())
            .collect::<Vec<_>>(),
        shown,
        "기록 응답에도 나오지 않는다"
    );
    let snapshot = session.snapshot();
    assert_eq!(snapshot.history.len(), 5, "숨은 행도 스냅샷에 든다");
    let back = Session::rehydrate(snapshot.clone());
    assert_eq!(back, session);
    assert_eq!(texts(back.history()), shown, "되살려도 숨는다");
    assert_eq!(back.snapshot(), snapshot);
}

#[test]
fn 중단한_턴의_말은_깊이에_세지_않는다() {
    let mut cancelled = session();
    done_turn(&mut cancelled, 1, ENGAGED, 1);
    done_turn(&mut cancelled, 2, ENGAGED, 2);
    cancelled.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    cancelled.cancel_turn(&id(3), Some(PARTIAL), at(3)).unwrap();
    cancelled.accept_user_turn(id(4), DUNNO, at(4)).unwrap();
    let step = cancelled.transition(&id(4), safe()).unwrap();
    assert!(!step.advanced, "중단한 진솔한 답은 셋째로 세지 않는다");
    assert_eq!(step.to, Task::FIRST);
}

#[test]
fn 실패한_턴의_말은_history_에서_빠지고_기록에는_보인다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    session
        .accept_user_turn(id(2), "made-up failed words", at(2))
        .unwrap();
    session
        .fail_turn(&id(2), TurnErrorKind::Timeout, at(3))
        .unwrap();
    assert_eq!(texts(session.history()), vec![ENGAGED, "A made-up reply."]);
    assert_eq!(
        texts(session.visible_messages()),
        vec![ENGAGED, "A made-up reply.", "made-up failed words"]
    );
    assert_eq!(session.history_response().len(), 3);
    // 다음 턴의 프롬프트 창에는 지금 턴의 말이 든다.
    session.accept_user_turn(id(3), DUNNO, at(4)).unwrap();
    assert_eq!(texts(session.history()).last(), Some(&DUNNO));
    assert_eq!(session.history().len(), 3);
}

#[test]
fn 실패한_턴을_다시_받으면_pending_으로_돌아가고_같은_전이가_나온다() {
    let mut session = session();
    done_turn(&mut session, 1, ENGAGED, 1);
    done_turn(&mut session, 2, ENGAGED, 2);
    session.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    let planned = session.transition(&id(3), safe()).unwrap();
    session
        .fail_turn(&id(3), TurnErrorKind::Provider, at(4))
        .unwrap();
    assert_eq!(session.failed_turn(), Some(id(3).as_str()));

    session.retry_turn(&id(3)).unwrap();
    let turn = &session.turns()[2];
    assert_eq!(turn.status, TurnStatus::Pending);
    assert_eq!(turn.finished_at, None);
    assert_eq!(turn.error_kind, None);
    assert_eq!(turn.started_at, at(3), "시작 시각은 처음 값이다");
    assert_eq!(
        texts(session.history()).last(),
        Some(&ENGAGED),
        "다시 창에 든다"
    );
    assert_eq!(session.transition(&id(3), safe()), Ok(planned));
    assert_eq!(session.failed_turn(), None);
    assert_eq!(
        session.active_turn(),
        Some((id(3).as_str(), TurnStatus::Pending))
    );
    session.start_streaming(&id(3), at(5)).unwrap();
    session
        .complete_turn(&id(3), safe(), "A made-up retried reply.", vec![], at(6))
        .unwrap();
    assert_eq!(session.task(), Task::new(2).unwrap());
    assert_eq!(session.turn_reply(&id(3)), Some("A made-up retried reply."));
    assert_eq!(session.failed_turn(), None, "답을 받으면 사라진다");

    for n in [3, 9] {
        assert!(
            session.retry_turn(&id(n)).is_err(),
            "실패한 턴만 다시 받는다"
        );
    }
    assert_eq!(session.retry_turn(&id(9)), Err(SessionError::TurnNotFound));
}

#[test]
fn 진행_중_턴은_pending_이나_streaming_인_마지막_턴이다() {
    let mut session = session();
    assert_eq!(session.active_turn(), None);
    session.greet(id(1), "A made-up greeting.", at(0)).unwrap();
    assert_eq!(session.active_turn(), None, "첫 인사는 바로 끝난다");
    session.accept_user_turn(id(2), ENGAGED, at(1)).unwrap();
    assert_eq!(
        session.active_turn(),
        Some((id(2).as_str(), TurnStatus::Pending))
    );
    session.start_streaming(&id(2), at(1)).unwrap();
    assert_eq!(
        session.active_turn(),
        Some((id(2).as_str(), TurnStatus::Streaming))
    );
    session.cancel_turn(&id(2), None, at(2)).unwrap();
    assert_eq!(session.active_turn(), None);
    session.accept_user_turn(id(3), ENGAGED, at(3)).unwrap();
    session
        .complete_turn(&id(3), safe(), "A made-up reply.", vec![], at(4))
        .unwrap();
    assert_eq!(session.active_turn(), None);
}

#[test]
fn 실패_턴은_답이_없는_마지막_실패_턴이고_뒤에_끝난_턴이_오면_없다() {
    let mut session = session();
    assert_eq!(session.failed_turn(), None);
    session.accept_user_turn(id(1), ENGAGED, at(1)).unwrap();
    session
        .fail_turn(&id(1), TurnErrorKind::Restart, at(2))
        .unwrap();
    assert_eq!(session.failed_turn(), Some(id(1).as_str()));
    // 뒤의 턴을 중단하면 숨으므로 실패 턴이 다시 보인다.
    session.accept_user_turn(id(2), DUNNO, at(3)).unwrap();
    assert_eq!(session.failed_turn(), None, "뒤의 턴이 도는 동안은 없다");
    session.cancel_turn(&id(2), None, at(4)).unwrap();
    assert_eq!(session.failed_turn(), Some(id(1).as_str()));
    // 다음 턴이 끝나면 그 아래에 답이 있으므로 없다.
    done_turn(&mut session, 3, ENGAGED, 5);
    assert_eq!(session.failed_turn(), None);
}

// 세션 애그리게이트의 전이. 픽스처는 지어낸 값이다.

mod turn;
mod view;

use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{Message, Session, SessionError, SessionSnapshot, TurnStep};
use crate::identity::ChatLanguage;
use crate::support::rules::{GriefProfile, MindReport, REPORT_SECTION_ORDER, SupportLevel, Task};
use crate::support::{
    GriefPath, KnowledgeRefResponse, MessageRole, MindReportSectionResponse, ReplyPhase,
    SupervisionQuality,
};

const ENGAGED: &str = "She loved napping in the sun by the window.";
const DUNNO: &str = "I don't know";

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

fn t0() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap()
}

fn at(minutes: i64) -> DateTime<Utc> {
    t0() + Duration::minutes(minutes)
}

fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("Mochi".to_owned()),
        together_range: None,
        loss_type: None,
        situation: None,
        weeks_since_loss: None,
        daily_state: None,
        preferred_language: None,
    }
}

fn session_at(start: Task) -> Session {
    Session::start(
        "session-1".to_owned(),
        "owner-1".to_owned(),
        profile(),
        t0(),
        start,
    )
}

fn session() -> Session {
    session_at(Task::FIRST)
}

fn safe_turn(session: &mut Session, text: &str, minute: i64) -> TurnStep {
    session
        .apply_user_turn(text, SupportLevel::Safe, at(minute))
        .unwrap()
}

fn report() -> MindReport {
    MindReport {
        at: at(30),
        pet_name: "Mochi".to_owned(),
        reached_task: task(2),
        locale: ChatLanguage::En,
        sections: REPORT_SECTION_ORDER
            .iter()
            .map(|key| MindReportSectionResponse {
                key: *key,
                body: "A made-up body.".to_owned(),
                tags: None,
            })
            .collect(),
    }
}

/// 과제 1 에서 진솔한 답 셋으로 과제 2 에 닿은 세션.
fn at_task_two() -> Session {
    let mut session = session();
    for minute in 1..=3 {
        safe_turn(&mut session, ENGAGED, minute);
    }
    session
}

#[test]
fn 시작() {
    let session = session();
    assert_eq!(session.id(), "session-1");
    assert_eq!(session.owner_id(), "owner-1");
    assert_eq!(session.started_at, t0());
    assert_eq!(session.task(), Task::FIRST);
    assert_eq!(session.retry_count, 0);
    assert_eq!(session.support_level(), SupportLevel::Safe);
    assert!(!session.closed());
    assert!(session.history().is_empty());
    assert!(session.analyses.is_empty());
    assert!(session.report().is_none());
    assert_eq!(session.progress(), 0.0);
    assert_eq!(session_at(task(3)).task(), task(3));
}

#[test]
fn 사용자_턴은_그때의_과제로_전사에_적힌다() {
    let mut session = session();
    let step = safe_turn(&mut session, ENGAGED, 1);
    assert_eq!(
        session.history(),
        &[Message {
            role: MessageRole::User,
            text: ENGAGED.to_owned(),
            task: Task::FIRST,
            at: at(1),
            turn_id: None,
        }]
    );
    assert_eq!(
        step,
        TurnStep {
            from: Task::FIRST,
            to: Task::FIRST,
            advanced: false,
            phase: ReplyPhase::Deepen,
            level: SupportLevel::Safe,
        }
    );
    assert_eq!(session.retry_count, 1);
}

#[test]
fn 세_턴_진솔하면_다음_과제로_넘어가고_재시도가_0이_된다() {
    let mut session = session();
    safe_turn(&mut session, ENGAGED, 1);
    safe_turn(&mut session, ENGAGED, 2);
    assert_eq!(session.retry_count, 2);
    let step = safe_turn(&mut session, ENGAGED, 3);
    assert_eq!(step.from, task(1));
    assert_eq!(step.to, task(2));
    assert!(step.advanced);
    assert_eq!(step.phase, ReplyPhase::Task);
    assert_eq!(session.task(), task(2));
    assert_eq!(session.progress(), 0.25);
    assert_eq!(session.retry_count, 0);
    assert_eq!(
        session.history()[2].task,
        task(1),
        "넘어간 턴의 답은 그 전 과제로 적힌다"
    );
}

#[test]
fn 새_과제의_깊이는_그_과제의_답만_센다() {
    let mut session = at_task_two();
    let step = safe_turn(&mut session, ENGAGED, 4);
    assert!(!step.advanced, "과제 2 의 첫 답이다");
    assert_eq!(step.phase, ReplyPhase::Deepen);
}

#[test]
fn 비몰입_2연속이면_부드럽게_넘어간다() {
    let mut session = session();
    let first = safe_turn(&mut session, DUNNO, 1);
    assert_eq!(first.phase, ReplyPhase::Retry);
    let second = safe_turn(&mut session, DUNNO, 2);
    assert!(second.advanced);
    assert_eq!(second.phase, ReplyPhase::Task);
    assert_eq!(session.task(), task(2));
}

#[test]
fn 클로징에_닿으면_답_뒤에_닫는다() {
    let mut session = session_at(task(4));
    safe_turn(&mut session, ENGAGED, 1);
    safe_turn(&mut session, ENGAGED, 2);
    let step = safe_turn(&mut session, ENGAGED, 3);
    assert_eq!(step.to, Task::CLOSING);
    assert_eq!(step.phase, ReplyPhase::Closing);
    assert!(step.closes());
    assert!(!step.is_crisis());
    assert!(!session.closed(), "닫기는 답을 적은 뒤 부르는 쪽이 한다");
    session.record_reply("A made-up closing reply.", at(4));
    session.close();
    assert!(session.closed());
    assert_eq!(session.progress(), 1.0);
}

#[test]
fn 위기면_과제를_넘기지_않고_바로_닫는다() {
    let mut session = session();
    safe_turn(&mut session, ENGAGED, 1);
    let step = session
        .apply_user_turn("made-up crisis text", SupportLevel::Crisis, at(2))
        .unwrap();
    assert_eq!(
        step,
        TurnStep {
            from: task(1),
            to: task(1),
            advanced: false,
            phase: ReplyPhase::Closing,
            level: SupportLevel::Crisis,
        }
    );
    assert!(step.is_crisis());
    assert!(step.closes());
    assert!(session.closed());
    assert_eq!(session.support_level(), SupportLevel::Crisis);
    assert_eq!(session.task(), task(1));
    assert_eq!(
        session.retry_count, 1,
        "위기 턴은 깊이 게이트를 거치지 않는다"
    );
    assert_eq!(session.history().len(), 2, "위기 발화도 전사에 남는다");
}

#[test]
fn 닫힌_세션의_턴은_오류이고_아무것도_바뀌지_않는다() {
    let mut session = session();
    session.close();
    let before = session.clone();
    assert_eq!(
        session.apply_user_turn(ENGAGED, SupportLevel::Safe, at(1)),
        Err(SessionError::Closed)
    );
    assert_eq!(session, before);
}

#[test]
fn 지원_수준은_내려가지_않는다() {
    let mut session = session();
    session
        .apply_user_turn(ENGAGED, SupportLevel::Watch, at(1))
        .unwrap();
    assert_eq!(session.support_level(), SupportLevel::Watch);
    safe_turn(&mut session, ENGAGED, 2);
    assert_eq!(session.support_level(), SupportLevel::Watch);
}

#[test]
fn 답은_지금_과제로_적히고_닫힌_뒤에도_적힌다() {
    let mut session = at_task_two();
    session.record_reply("A made-up reply.", at(4));
    let last = session.history().last().unwrap();
    assert_eq!(last.role, MessageRole::Assistant);
    assert_eq!(last.task, task(2));
    session.close();
    session.record_reply("A made-up crisis reply.", at(5));
    assert_eq!(session.history().len(), 5);
}

#[test]
fn 턴_분석과_감독_게이트() {
    let mut session = session();
    let knowledge = vec![KnowledgeRefResponse {
        source: "made-up source".to_owned(),
        tags: vec!["task1".to_owned()],
    }];
    // 첫 턴: turn_index 0 은 표본이라 감독이 돈다.
    let step = safe_turn(&mut session, ENGAGED, 1);
    session.record_turn(&step, "A reply.", knowledge.clone(), at(2));
    // 둘째 턴: 넘어가지 않았고 안전, turn_index 1 이라 돌지 않는다.
    let step = safe_turn(&mut session, ENGAGED, 3);
    session.record_turn(&step, "A reply.", vec![], at(4));
    // 셋째 턴: 넘어갔다.
    let step = safe_turn(&mut session, ENGAGED, 5);
    session.record_turn(&step, "", vec![], at(6));

    let analyses = session.analyses;
    assert_eq!(analyses.len(), 3);
    let first = &analyses[0];
    assert_eq!(first.at, at(2));
    assert_eq!(first.task, task(1));
    assert_eq!(first.phase, ReplyPhase::Deepen);
    assert_eq!(first.risk.level, SupportLevel::Safe);
    assert_eq!(first.transition.from, task(1));
    assert_eq!(first.transition.retry_count, 1);
    assert_eq!(first.knowledge, knowledge);
    assert_eq!(
        first.supervision.as_ref().map(|s| s.quality),
        Some(SupervisionQuality::Ok)
    );
    assert!(analyses[1].supervision.is_none());
    assert_eq!(analyses[1].transition.retry_count, 2);
    let third = &analyses[2];
    assert_eq!(third.task, task(2));
    assert!(third.transition.advanced);
    assert_eq!(third.transition.retry_count, 0);
    assert_eq!(
        third.supervision.as_ref().map(|s| s.flags.clone()),
        Some(vec!["empty-reply".to_owned()])
    );
}

#[test]
fn 위기_턴의_분석() {
    let mut session = session();
    safe_turn(&mut session, ENGAGED, 1);
    let step = session
        .apply_user_turn("made-up crisis text", SupportLevel::Crisis, at(2))
        .unwrap();
    session.record_reply("A fixed crisis reply.", at(3));
    session.record_turn(&step, "A fixed crisis reply.", vec![], at(3));
    let analysis = session.analyses.last().unwrap();
    assert_eq!(analysis.phase, ReplyPhase::Closing);
    assert_eq!(analysis.risk.level, SupportLevel::Crisis);
    assert_eq!(analysis.transition.from, analysis.transition.to);
    assert!(!analysis.transition.advanced);
    assert!(analysis.knowledge.is_empty());
    assert_eq!(
        analysis.supervision.as_ref().map(|s| s.flags.clone()),
        Some(vec!["elevated-support-level".to_owned()])
    );
}

#[test]
fn 닫기는_여러_번_해도_같다() {
    let mut session = session();
    session.close();
    session.close();
    assert!(session.closed());
}

#[test]
fn 리포트는_닫혔고_과제_2_이상일_때만_붙는다() {
    let mut open = at_task_two();
    assert!(!open.report_available());
    assert_eq!(
        open.attach_report(report()),
        Err(SessionError::ReportUnavailable)
    );

    let mut early = session();
    early.close();
    assert!(!early.report_available());
    assert_eq!(
        early.attach_report(report()),
        Err(SessionError::ReportUnavailable)
    );
    assert!(early.report().is_none());
}

#[test]
fn 리포트는_한_번_붙으면_바뀌지_않는다() {
    let mut session = at_task_two();
    session.close();
    assert!(session.report_available());
    assert_eq!(session.attach_report(report()), Ok(()));
    let mut other = report();
    other.pet_name = "Someone else".to_owned();
    assert_eq!(
        session.attach_report(other),
        Err(SessionError::ReportAlreadyWritten)
    );
    assert_eq!(session.report(), Some(&report()));
}

#[test]
fn 스냅샷으로_오가도_같다() {
    let mut session = at_task_two();
    session.record_reply("A made-up reply.", at(4));
    let step = safe_turn(&mut session, DUNNO, 5);
    session.record_turn(&step, "A reply.", vec![], at(6));
    session.close();
    session.attach_report(report()).unwrap();

    let snapshot = session.snapshot();
    assert_eq!(snapshot.id, "session-1");
    assert_eq!(snapshot.owner_id, "owner-1");
    assert_eq!(snapshot.started_at, t0());
    assert_eq!(snapshot.grief_profile, profile());
    assert_eq!(snapshot.task, task(2));
    assert_eq!(snapshot.retry_count, 1);
    assert_eq!(snapshot.support_level, SupportLevel::Safe);
    assert!(snapshot.closed);
    assert_eq!(snapshot.history.len(), 5);
    assert_eq!(snapshot.analyses.len(), 1);
    assert_eq!(snapshot.report, Some(report()));

    let back = Session::rehydrate(snapshot.clone());
    assert_eq!(back, session);
    assert_eq!(back.snapshot(), snapshot);
}

#[test]
fn 되살린_세션에서도_전이가_이어진다() {
    let mut session = session();
    safe_turn(&mut session, ENGAGED, 1);
    safe_turn(&mut session, ENGAGED, 2);
    let snapshot: SessionSnapshot = session.snapshot();
    let mut back = Session::rehydrate(snapshot);
    let step = safe_turn(&mut back, ENGAGED, 3);
    assert!(step.advanced, "깊이는 전사에서 구한다");
}

#[test]
fn 계정의_대화_언어를_따른다() {
    let mut session = session();
    assert_eq!(session.grief_profile().language(), ChatLanguage::En);
    session.adopt_language(ChatLanguage::Ko);
    assert_eq!(session.grief_profile().language(), ChatLanguage::Ko);
    assert_eq!(
        session.grief_profile().preferred_language,
        Some(ChatLanguage::Ko)
    );
}

#[test]
fn 계획은_프로필에서_다시_구하고_시각은_시작_시각이다() {
    let session = session();
    let plan = session.plan();
    assert_eq!(plan.created_at, t0());
    assert_eq!(plan.task_focuses.len(), 4);
    assert_eq!(plan, crate::support::rules::plan(&profile(), t0()));
}

#[test]
fn 요약은_닫힌_세션에만_있고_분석에서_다시_구한다() {
    let mut session = at_task_two();
    assert!(session.summary().is_none());
    let step = safe_turn(&mut session, ENGAGED, 4);
    session.record_turn(&step, "A reply.", vec![], at(5));
    session.record_reply("A reply.", at(5));
    session.close();
    let summary = session.summary().unwrap();
    assert_eq!(summary.at, at(5), "마지막 메시지의 시각");
    assert_eq!(summary.reached_task, 2);
    assert_eq!(summary.turn_count, 1);
    assert_eq!(summary.highest_support_level, 1);
    assert_eq!(summary.headline, "Reached task 2 of 4 across 1 turns.");

    let mut empty = session_at(task(1));
    empty.close();
    assert_eq!(
        empty.summary().unwrap().at,
        t0(),
        "메시지가 없으면 시작 시각"
    );
}

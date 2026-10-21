// 세션을 응답 모양으로 옮기기.

use chrono::{DateTime, TimeZone, Utc};

use crate::identity::ChatLanguage;
use crate::support::rules::{GriefProfile, RiskAssessment, SupportLevel, Task};
use crate::support::session::{MessageActivity, Session};
use crate::support::{
    GriefPath, MessageResponse, MessageRole, RiskDetector, StreamEvent, TurnResponse,
};

const ENGAGED: &str = "He waited at the door every evening for me.";

fn t0() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap()
}

fn session(pet_name: Option<&str>) -> Session {
    Session::start(
        "session-9".to_owned(),
        "owner-9".to_owned(),
        GriefProfile {
            grief_path: GriefPath::BeforeLoss,
            pet_name: pet_name.map(str::to_owned),
            together_range: None,
            loss_type: None,
            situation: None,
            weeks_since_loss: None,
            daily_state: None,
            preferred_language: Some(ChatLanguage::Ko),
        },
        t0(),
        Task::FIRST,
    )
}

/// 진솔한 답 셋으로 과제 2 에 닿고 닫힌 세션.
fn closed_at_two() -> Session {
    let mut session = session(Some("Bori"));
    let safe = RiskAssessment {
        level: SupportLevel::Safe,
        detected_by: RiskDetector::None,
    };
    for minute in 1..=3 {
        let at = t0() + chrono::Duration::minutes(minute);
        let turn_id = format!("turn-{minute}");
        session
            .accept_user_turn(turn_id.clone(), ENGAGED, at)
            .unwrap();
        session
            .complete_turn(&turn_id, safe, "A reply.", vec![], at)
            .unwrap();
    }
    session.close();
    session
}

#[test]
fn 턴_결과와_meta() {
    let session = closed_at_two();
    assert_eq!(
        session.turn_response("A reply.".to_owned()),
        TurnResponse {
            reply: "A reply.".to_owned(),
            task: 2,
            progress: 0.25,
            support_level: 1,
            done: true,
        }
    );
    assert_eq!(
        session.meta_event(),
        StreamEvent::Meta {
            task: 2,
            progress: 0.25,
            support_level: 1,
            done: true,
        }
    );
}

#[test]
fn 상태와_목록_항목() {
    let open = session(None);
    let state = open.state_response();
    assert_eq!(state.session_id, "session-9");
    assert_eq!(state.task, 1);
    assert!(!state.closed);
    assert!(!state.report_available);
    let item = open.list_item(&MessageActivity::default());
    assert_eq!(item.last_message_at, None);
    assert_eq!(item.duration_minutes, None);
    assert_eq!(item.message_count, 0);
    assert_eq!(
        item.pet_name, None,
        "펫 이름이 없으면 칸을 뺀다(자리표시를 넣지 않는다)"
    );
    assert_eq!(item.preferred_language, ChatLanguage::Ko);
    assert_eq!(item.started_at, t0());
    assert_eq!(item.reached_task, 1);

    let closed = closed_at_two();
    assert!(closed.state_response().report_available);
    let activity = MessageActivity {
        last_message_at: Some(t0() + chrono::Duration::minutes(3)),
        duration_minutes: Some(3),
        message_count: 6,
    };
    let item = closed.list_item(&activity);
    assert_eq!(item.last_message_at, activity.last_message_at);
    assert_eq!(item.duration_minutes, Some(3));
    assert_eq!(item.message_count, 6);
    assert_eq!(item.pet_name.as_deref(), Some("Bori"));
    assert!(item.report_available);
    assert_eq!(item.progress, 0.25);
}

#[test]
fn 기록() {
    let session = closed_at_two();
    let history = session.history_response();
    assert_eq!(history.len(), 6);
    assert_eq!(
        history[0],
        MessageResponse {
            role: MessageRole::User,
            text: ENGAGED.to_owned(),
            task: 1,
            at: t0() + chrono::Duration::minutes(1),
            turn_id: Some("turn-1".to_owned()),
        }
    );
}

#[test]
fn 분석_보기는_계획과_요약을_다시_구한다() {
    let open = session(None);
    let view = open.analysis_response();
    assert_eq!(view.plan, Some(open.plan()));
    assert_eq!(view.summary, None);
    assert!(view.analyses.is_empty());

    let closed = closed_at_two();
    let view = closed.analysis_response();
    assert!(view.closed);
    assert_eq!(view.summary, closed.summary());
    assert_eq!(view.analyses.len(), 3);
    assert_eq!(view.analyses[2], closed.analyses[2].to_response());
    assert_eq!(view.history.len(), 6);
}

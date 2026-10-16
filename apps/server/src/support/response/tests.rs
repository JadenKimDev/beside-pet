// 응답의 JSON 모양: `apps/api/src/support/interface/dto/*.response.ts` 와 `apps/web/lib/api/types.ts`.

use chrono::{TimeZone, Utc};
use serde_json::json;

use super::{
    KnowledgeRefResponse, MessageResponse, MessageRole, MindReportResponse,
    MindReportSectionResponse, ReplyPhase, ReportSectionKey, RiskAssessmentResponse, RiskDetector,
    SessionAnalysisResponse, SessionListItemResponse, SessionStateResponse, SessionSummaryResponse,
    StreamEvent, SupervisionQuality, SupervisionResponse, SupportPlanResponse, TaskFocusResponse,
    TaskTransitionResponse, TurnAnalysisResponse, TurnResponse,
};
use crate::identity::ChatLanguage;

fn at() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 5, 7).unwrap() + chrono::Duration::milliseconds(123)
}

fn turn() -> TurnResponse {
    TurnResponse {
        reply: "hi".to_owned(),
        task: 1,
        progress: 0.25,
        support_level: 1,
        done: false,
    }
}

#[test]
fn 턴() {
    assert_eq!(
        serde_json::to_value(turn()).unwrap(),
        json!({ "reply": "hi", "task": 1, "progress": 0.25, "supportLevel": 1, "done": false })
    );
}

#[test]
fn 스트림_이벤트는_kind_로_가른다() {
    let meta = StreamEvent::Meta {
        task: 2,
        progress: 0.25,
        support_level: 1,
        done: false,
    };
    assert_eq!(
        serde_json::to_value(meta).unwrap(),
        json!({ "kind": "meta", "task": 2, "progress": 0.25, "supportLevel": 1, "done": false })
    );
    let token = StreamEvent::Token {
        text: "he".to_owned(),
    };
    assert_eq!(
        serde_json::to_value(token).unwrap(),
        json!({ "kind": "token", "text": "he" })
    );
    let done = StreamEvent::Done { result: turn() };
    assert_eq!(
        serde_json::to_value(done).unwrap(),
        json!({ "kind": "done", "result": { "reply": "hi", "task": 1, "progress": 0.25, "supportLevel": 1, "done": false } })
    );
}

#[test]
fn 상태와_목록() {
    let state = SessionStateResponse {
        session_id: "s1".to_owned(),
        task: 3,
        progress: 0.5,
        support_level: 2,
        closed: true,
        report_available: true,
    };
    assert_eq!(
        serde_json::to_value(state).unwrap(),
        json!({ "sessionId": "s1", "task": 3, "progress": 0.5, "supportLevel": 2, "closed": true, "reportAvailable": true })
    );
    let item = SessionListItemResponse {
        session_id: "s1".to_owned(),
        started_at: at(),
        closed: false,
        reached_task: 1,
        progress: 0.0,
        pet_name: None,
        preferred_language: ChatLanguage::En,
        report_available: false,
    };
    assert_eq!(
        serde_json::to_value(item).unwrap(),
        json!({
            "sessionId": "s1", "startedAt": "2026-10-16T09:05:07.123Z", "closed": false,
            "reachedTask": 1, "progress": 0.0, "preferredLanguage": "en", "reportAvailable": false
        })
    );
}

#[test]
fn 메시지() {
    let message = MessageResponse {
        role: MessageRole::Assistant,
        text: "hello".to_owned(),
        task: 0,
        at: at(),
    };
    assert_eq!(
        serde_json::to_value(message).unwrap(),
        json!({ "role": "assistant", "text": "hello", "task": 0, "at": "2026-10-16T09:05:07.123Z" })
    );
}

#[test]
fn 분석의_없는_칸은_빠진다() {
    let analysis = SessionAnalysisResponse {
        session_id: "s1".to_owned(),
        closed: false,
        plan: None,
        analyses: vec![TurnAnalysisResponse {
            at: at(),
            task: 1,
            phase: ReplyPhase::Deepen,
            risk: RiskAssessmentResponse {
                level: 1,
                detected_by: RiskDetector::None,
            },
            transition: TaskTransitionResponse {
                from: 1,
                to: 1,
                advanced: false,
                retry_count: 0,
            },
            knowledge: vec![],
            supervision: None,
        }],
        summary: None,
        history: vec![],
    };
    assert_eq!(
        serde_json::to_value(analysis).unwrap(),
        json!({
            "sessionId": "s1", "closed": false,
            "analyses": [{
                "at": "2026-10-16T09:05:07.123Z", "task": 1, "phase": "deepen",
                "risk": { "level": 1, "detectedBy": "none" },
                "transition": { "from": 1, "to": 1, "advanced": false, "retryCount": 0 },
                "knowledge": []
            }],
            "history": []
        })
    );
}

#[test]
fn 분석의_모든_칸() {
    let analysis = SessionAnalysisResponse {
        session_id: "s1".to_owned(),
        closed: true,
        plan: Some(SupportPlanResponse {
            created_at: at(),
            path_focus: "afterLoss".to_owned(),
            task_focuses: vec![TaskFocusResponse {
                task: 1,
                emphasis: "e".to_owned(),
                tone: "t".to_owned(),
            }],
            cautions: vec!["c".to_owned()],
        }),
        analyses: vec![TurnAnalysisResponse {
            at: at(),
            task: 2,
            phase: ReplyPhase::Intro,
            risk: RiskAssessmentResponse {
                level: 3,
                detected_by: RiskDetector::Keyword,
            },
            transition: TaskTransitionResponse {
                from: 1,
                to: 2,
                advanced: true,
                retry_count: 1,
            },
            knowledge: vec![KnowledgeRefResponse {
                source: "src".to_owned(),
                tags: vec!["tag".to_owned()],
            }],
            supervision: Some(SupervisionResponse {
                evaluated: true,
                quality: SupervisionQuality::Review,
                flags: vec!["f".to_owned()],
                note: Some("n".to_owned()),
            }),
        }],
        summary: Some(SessionSummaryResponse {
            at: at(),
            reached_task: 2,
            turn_count: 4,
            highest_support_level: 3,
            headline: "h".to_owned(),
            follow_up: "f".to_owned(),
        }),
        history: vec![],
    };
    let value = serde_json::to_value(analysis).unwrap();
    assert_eq!(
        value["plan"],
        json!({
            "createdAt": "2026-10-16T09:05:07.123Z", "pathFocus": "afterLoss",
            "taskFocuses": [{ "task": 1, "emphasis": "e", "tone": "t" }], "cautions": ["c"]
        })
    );
    assert_eq!(
        value["analyses"][0]["supervision"],
        json!({ "evaluated": true, "quality": "review", "flags": ["f"], "note": "n" })
    );
    assert_eq!(value["analyses"][0]["phase"], "intro");
    assert_eq!(value["analyses"][0]["risk"]["detectedBy"], "keyword");
    assert_eq!(
        value["analyses"][0]["knowledge"],
        json!([{ "source": "src", "tags": ["tag"] }])
    );
    assert_eq!(
        value["summary"],
        json!({
            "at": "2026-10-16T09:05:07.123Z", "reachedTask": 2, "turnCount": 4,
            "highestSupportLevel": 3, "headline": "h", "followUp": "f"
        })
    );
}

#[test]
fn 마음_리포트() {
    let report = MindReportResponse {
        at: at(),
        pet_name: "Bori".to_owned(),
        reached_task: 4,
        progress: 0.75,
        locale: ChatLanguage::Ko,
        sections: vec![
            MindReportSectionResponse {
                key: ReportSectionKey::Journey,
                body: "j".to_owned(),
            },
            MindReportSectionResponse {
                key: ReportSectionKey::Encouragement,
                body: "e".to_owned(),
            },
        ],
    };
    assert_eq!(
        serde_json::to_value(report).unwrap(),
        json!({
            "at": "2026-10-16T09:05:07.123Z", "petName": "Bori", "reachedTask": 4, "progress": 0.75,
            "locale": "ko",
            "sections": [{ "key": "journey", "body": "j" }, { "key": "encouragement", "body": "e" }]
        })
    );
}

#[test]
fn 값_이름들() {
    let names = |v: serde_json::Value| v.as_str().unwrap().to_owned();
    assert_eq!(names(json!(MessageRole::User)), "user");
    for (phase, name) in [
        (ReplyPhase::Intro, "intro"),
        (ReplyPhase::Resume, "resume"),
        (ReplyPhase::Task, "task"),
        (ReplyPhase::Deepen, "deepen"),
        (ReplyPhase::Retry, "retry"),
        (ReplyPhase::Closing, "closing"),
    ] {
        assert_eq!(names(json!(phase)), name);
    }
    assert_eq!(names(json!(SupervisionQuality::Ok)), "ok");
    assert_eq!(names(json!(ReportSectionKey::Emotions)), "emotions");
    assert_eq!(names(json!(ReportSectionKey::Keepsake)), "keepsake");
}

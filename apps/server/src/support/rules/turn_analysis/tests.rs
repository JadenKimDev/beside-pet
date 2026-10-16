use chrono::{TimeZone, Utc};

use super::{RiskAssessment, TaskTransition, TurnAnalysis};
use crate::support::rules::{SupportLevel, Task};
use crate::support::{
    KnowledgeRefResponse, ReplyPhase, RiskAssessmentResponse, RiskDetector, SupervisionQuality,
    SupervisionResponse, TaskTransitionResponse,
};

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

#[test]
fn 위기_판정의_감지자() {
    assert_eq!(
        RiskAssessment::of(SupportLevel::Safe).detected_by,
        RiskDetector::None
    );
    assert_eq!(
        RiskAssessment::of(SupportLevel::Watch).detected_by,
        RiskDetector::Keyword
    );
    let crisis = RiskAssessment::of(SupportLevel::Crisis);
    assert_eq!(crisis.detected_by, RiskDetector::Keyword);
    assert_eq!(crisis.level, SupportLevel::Crisis);
}

#[test]
fn 응답_모양() {
    let at = Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap();
    let supervision = SupervisionResponse {
        evaluated: true,
        quality: SupervisionQuality::Ok,
        flags: vec![],
        note: None,
    };
    let knowledge = vec![KnowledgeRefResponse {
        source: "made-up source".to_owned(),
        tags: vec!["tag".to_owned()],
    }];
    let analysis = TurnAnalysis {
        at,
        task: task(2),
        phase: ReplyPhase::Task,
        risk: RiskAssessment::of(SupportLevel::Safe),
        transition: TaskTransition {
            from: task(1),
            to: task(2),
            advanced: true,
            retry_count: 0,
        },
        knowledge: knowledge.clone(),
        supervision: Some(supervision.clone()),
    };
    let response = analysis.to_response();
    assert_eq!(response.at, at);
    assert_eq!(response.task, 2);
    assert_eq!(response.phase, ReplyPhase::Task);
    assert_eq!(
        response.risk,
        RiskAssessmentResponse {
            level: 1,
            detected_by: RiskDetector::None,
        }
    );
    assert_eq!(
        response.transition,
        TaskTransitionResponse {
            from: 1,
            to: 2,
            advanced: true,
            retry_count: 0,
        }
    );
    assert_eq!(response.knowledge, knowledge);
    assert_eq!(response.supervision, Some(supervision));
}

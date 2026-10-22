use chrono::{TimeZone, Utc};

use super::{RiskAssessment, TaskTransition, TurnAnalysis};
use crate::safety::{self, RiskLevel, RiskVerdict};
use crate::support::rules::{SupportLevel, Task};
use crate::support::{
    KnowledgeRefResponse, ReplyPhase, RiskAssessmentResponse, RiskDetector, SupervisionQuality,
    SupervisionResponse, TaskTransitionResponse,
};

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

#[test]
fn 위기_판정은_safety_의_수준과_감지_주체를_그대로_옮긴다() {
    let cases = [
        (
            RiskVerdict {
                level: RiskLevel::Crisis,
                detector: safety::RiskDetector::Keyword,
            },
            SupportLevel::Crisis,
            RiskDetector::Keyword,
        ),
        (
            RiskVerdict {
                level: RiskLevel::Crisis,
                detector: safety::RiskDetector::Model,
            },
            SupportLevel::Crisis,
            RiskDetector::Model,
        ),
        (
            RiskVerdict {
                level: RiskLevel::Safe,
                detector: safety::RiskDetector::None,
            },
            SupportLevel::Safe,
            RiskDetector::None,
        ),
    ];
    for (verdict, level, detected_by) in cases {
        assert_eq!(
            RiskAssessment::from(verdict),
            RiskAssessment { level, detected_by },
            "{verdict:?}"
        );
    }
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
        risk: RiskAssessment {
            level: SupportLevel::Safe,
            detected_by: RiskDetector::None,
        },
        transition: TaskTransition {
            from: task(1),
            to: task(2),
            advanced: true,
            retry_count: 0,
        },
        knowledge: knowledge.clone(),
        supervision: Some(supervision.clone()),
        reply: None,
        trace: None,
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

#[test]
fn 추적이_없으면_응답에서_trace_칸이_빠지고_있으면_그대로_보인다() {
    use crate::support::response::{TraceBlock, TurnTrace};
    use crate::support::rules::TurnStyle;

    let analysis = TurnAnalysis {
        at: Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap(),
        task: task(2),
        phase: ReplyPhase::Task,
        risk: RiskAssessment {
            level: SupportLevel::Safe,
            detected_by: RiskDetector::None,
        },
        transition: TaskTransition {
            from: task(2),
            to: task(2),
            advanced: false,
            retry_count: 0,
        },
        knowledge: Vec::new(),
        supervision: None,
        reply: None,
        trace: None,
    };
    let json = serde_json::to_value(analysis.to_response()).unwrap();
    assert!(!json.as_object().unwrap().contains_key("trace"), "{json}");

    let trace = TurnTrace {
        prompt_version: "0.4.0".to_owned(),
        blocks: vec![TraceBlock {
            name: "identity".to_owned(),
            chars: 10,
        }],
        turn_style: TurnStyle::from_history(ReplyPhase::Task, &[], &[]).decisions(),
        system_prompt: "made-up prompt".to_owned(),
    };
    let traced = TurnAnalysis {
        trace: Some(trace.clone()),
        ..analysis
    };
    let response = traced.to_response();
    assert_eq!(response.trace, Some(trace));
    let json = serde_json::to_value(response).unwrap();
    assert_eq!(json["trace"]["promptVersion"], "0.4.0");
    assert_eq!(json["trace"]["blocks"][0]["name"], "identity");
    assert_eq!(json["trace"]["blocks"][0]["chars"], 10);
    assert_eq!(json["trace"]["systemPrompt"], "made-up prompt");
    assert!(json["trace"]["turnStyle"]["questionPolicy"].is_string());
}

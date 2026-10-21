//! 턴 분석의 모양: 한 턴의 위기 판정, 과제 전이, 근거 지식, 감독 결과, 답의 판정. 세션에 쌓이고 `turn_analyses` 행으로 저장된다.

use chrono::{DateTime, Utc};

use super::super::response::{
    KnowledgeRefResponse, ReplyPhase, RiskAssessmentResponse, RiskDetector, SupervisionResponse,
    TaskTransitionResponse, TurnAnalysisResponse,
};
use super::{SupportLevel, Task};
use crate::safety::{self, RiskVerdict};
use crate::support::ReplyLabel;

/// 한 사용자 턴의 위기 판정. 수준과 감지 주체는 `safety` 의 판정을 그대로 옮기고 수준에서 주체를 지어내지 않는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RiskAssessment {
    pub level: SupportLevel,
    pub detected_by: RiskDetector,
}

impl From<RiskVerdict> for RiskAssessment {
    fn from(verdict: RiskVerdict) -> RiskAssessment {
        RiskAssessment {
            level: SupportLevel::from(verdict.level),
            detected_by: RiskDetector::from(verdict.detector),
        }
    }
}

impl From<safety::RiskDetector> for RiskDetector {
    fn from(detector: safety::RiskDetector) -> RiskDetector {
        match detector {
            safety::RiskDetector::Keyword => RiskDetector::Keyword,
            safety::RiskDetector::Model => RiskDetector::Model,
            safety::RiskDetector::None => RiskDetector::None,
        }
    }
}

/// 한 턴에 과제가 어떻게 됐나.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskTransition {
    pub from: Task,
    pub to: Task,
    /// 넘어갔으면 참, 머물렀으면(다시 묻기·더 깊이) 거짓.
    pub advanced: bool,
    pub retry_count: u32,
}

/// 생성 뒤에 잰 답의 판정(ADR-0031). 판정기가 준 값 그대로이고 여기서 계산하지 않는다.
#[derive(Debug, Clone, PartialEq)]
pub struct ReplyJudgement {
    pub label: ReplyLabel,
    /// 판정기가 그 라벨에 준 확률(0~1). 확률을 주지 않는 판정기(Haiku)는 `None`.
    pub label_probability: Option<f32>,
    /// 판정기와 그 버전, `<이름>@<x.y.z>`(예: `systemone@0.1.0`).
    pub judge: String,
}

/// 한 턴의 구조화된 기록.
#[derive(Debug, Clone, PartialEq)]
pub struct TurnAnalysis {
    /// 턴을 처리한 시각.
    pub at: DateTime<Utc>,
    /// 전이 뒤의 과제.
    pub task: Task,
    pub phase: ReplyPhase,
    pub risk: RiskAssessment,
    pub transition: TaskTransition,
    pub knowledge: Vec<KnowledgeRefResponse>,
    /// 감독 게이트가 열린 턴에만 있다.
    pub supervision: Option<SupervisionResponse>,
    /// 답의 판정. 판정기를 껐거나 판정이 실패했거나 아직 적지 않았으면 `None`(`turn_analyses` 의 NULL).
    pub reply: Option<ReplyJudgement>,
}

impl TurnAnalysis {
    pub fn to_response(&self) -> TurnAnalysisResponse {
        TurnAnalysisResponse {
            at: self.at,
            task: self.task.number(),
            phase: self.phase,
            risk: RiskAssessmentResponse {
                level: self.risk.level.number(),
                detected_by: self.risk.detected_by,
            },
            transition: TaskTransitionResponse {
                from: self.transition.from.number(),
                to: self.transition.to.number(),
                advanced: self.transition.advanced,
                retry_count: self.transition.retry_count,
            },
            knowledge: self.knowledge.clone(),
            supervision: self.supervision.clone(),
        }
    }
}

#[cfg(test)]
mod tests;

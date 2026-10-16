//! 턴 분석의 모양: 한 턴의 위기 판정, 과제 전이, 근거 지식, 감독 결과. 세션에 쌓이고 `turn_analyses` 행으로 저장된다.

use chrono::{DateTime, Utc};

use super::super::response::{
    KnowledgeRefResponse, ReplyPhase, RiskAssessmentResponse, RiskDetector, SupervisionResponse,
    TaskTransitionResponse, TurnAnalysisResponse,
};
use super::{SupportLevel, Task};

/// 한 사용자 턴의 위기 판정.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RiskAssessment {
    pub level: SupportLevel,
    pub detected_by: RiskDetector,
}

impl RiskAssessment {
    /// 수준에서 판정을 적는다. 주의(2) 이상이면 `keyword`, 아니면 `none`(TS 와 같다).
    pub fn of(level: SupportLevel) -> RiskAssessment {
        let detected_by = if level >= SupportLevel::Watch {
            RiskDetector::Keyword
        } else {
            RiskDetector::None
        };
        RiskAssessment { level, detected_by }
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

/// 한 턴의 구조화된 기록.
#[derive(Debug, Clone, PartialEq, Eq)]
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

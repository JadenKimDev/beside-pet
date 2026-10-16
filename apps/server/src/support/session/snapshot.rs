//! 세션 스냅샷: 저장에 넘기고 저장에서 받는 평범한 데이터. `sessions` 행 + `messages` 행 + `turn_analyses` 행 + 저장된 리포트.
//!
//! 계획과 요약은 없다. 결정론적 파생값이라 저장하지 않는다.

use chrono::{DateTime, Utc};

use super::super::rules::{GriefProfile, MindReport, SupportLevel, Task, TurnAnalysis};
use super::Message;

#[derive(Debug, Clone, PartialEq)]
pub struct SessionSnapshot {
    pub id: String,
    pub owner_id: String,
    /// 대화를 시작한 시각.
    pub started_at: DateTime<Utc>,
    /// JSONB(`Serialize + Deserialize`).
    pub grief_profile: GriefProfile,
    pub task: Task,
    pub retry_count: u32,
    pub support_level: SupportLevel,
    pub closed: bool,
    /// 순서대로(순번 = 자리).
    pub history: Vec<Message>,
    /// 순서대로.
    pub analyses: Vec<TurnAnalysis>,
    /// JSONB(`Serialize + Deserialize`). 처음 요청 때 한 번 쓴다.
    pub report: Option<MindReport>,
}

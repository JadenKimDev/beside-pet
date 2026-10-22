//! 대화 경로의 응답 모양: TS 의 `support/interface/dto/*.response.ts` 와 대화 웹의 `lib/api/types.ts` 가 합의한 JSON.
//!
//! 칸 이름은 camelCase, 시각은 ISO-8601 밀리초 `Z`, `Option` 은 JSON 에서 칸을 뺀다(TS 의 `undefined`).
//! 단계(`task`, 0..=5)와 지원 단계(`supportLevel`, 1..=3)는 수다.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::rules::TurnStyleDecisions;
use crate::identity::ChatLanguage;

/// 한 턴의 결과.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnResponse {
    pub reply: String,
    pub task: u8,
    /// 0..=1
    pub progress: f64,
    pub support_level: u8,
    pub done: bool,
}

/// 스트림 턴의 이벤트 하나: `meta` → `token`* → `done`(또는 중단되면 `cancelled`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StreamEvent {
    /// 글보다 먼저 보내는 구조(단계, 진행, 지원 단계, 끝남).
    Meta {
        task: u8,
        progress: f64,
        support_level: u8,
        done: bool,
    },
    /// 답 글의 조각.
    Token { text: String },
    /// 마지막 이벤트: 모은 턴의 결과.
    Done { result: TurnResponse },
    /// 마지막 이벤트: 턴이 중단됐다(ADR-0030). 칸이 없다.
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStateResponse {
    pub session_id: String,
    pub task: u8,
    pub progress: f64,
    pub support_level: u8,
    pub closed: bool,
    pub report_available: bool,
    /// 답을 기다리거나 받는 중인 턴. 없으면 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_turn: Option<ActiveTurnResponse>,
    /// 답이 없는 마지막 실패 턴. 없으면 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_turn: Option<FailedTurnResponse>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActiveTurnStatus {
    Pending,
    Streaming,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTurnResponse {
    pub turn_id: String,
    pub status: ActiveTurnStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailedTurnResponse {
    pub turn_id: String,
}

/// 중단 요청의 응답. `status` 는 늘 `"cancelled"` 다(이미 중단된 턴도 같다).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelledTurnResponse {
    pub turn_id: String,
    pub status: CancelledStatus,
}

impl CancelledTurnResponse {
    pub fn of(turn_id: &str) -> CancelledTurnResponse {
        CancelledTurnResponse {
            turn_id: turn_id.to_owned(),
            status: CancelledStatus::Cancelled,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CancelledStatus {
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListItemResponse {
    pub session_id: String,
    #[serde(with = "crate::shared::iso_millis")]
    pub started_at: DateTime<Utc>,
    pub closed: bool,
    pub reached_task: u8,
    pub progress: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet_name: Option<String>,
    pub preferred_language: ChatLanguage,
    pub report_available: bool,
    /// 리포트가 있으나 지운 상태(보관함, ADR-0036). 그때 `report_available` 은 `false` 다.
    pub report_deleted: bool,
    /// 마지막 메시지의 시각. 메시지가 없으면 칸을 뺀다.
    #[serde(
        skip_serializing_if = "Option::is_none",
        with = "crate::shared::iso_millis_opt"
    )]
    pub last_message_at: Option<DateTime<Utc>>,
    /// 첫 메시지에서 마지막 메시지까지의 분(내림). 메시지가 없으면 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_minutes: Option<u32>,
    pub message_count: u32,
}

/// 보관함의 한 항목(`GET /v1/sessions/deleted`). `purge_at` 은 지운 시각에 보관 기간을 더해 저장이 구한 값이다.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletedSessionResponse {
    pub session_id: String,
    #[serde(with = "crate::shared::iso_millis")]
    pub started_at: DateTime<Utc>,
    #[serde(with = "crate::shared::iso_millis")]
    pub deleted_at: DateTime<Utc>,
    #[serde(with = "crate::shared::iso_millis")]
    pub purge_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pet_name: Option<String>,
    pub preferred_language: ChatLanguage,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
    Assistant,
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    pub role: MessageRole,
    pub text: String,
    /// 이 메시지를 적을 때의 단계.
    pub task: u8,
    #[serde(with = "crate::shared::iso_millis")]
    pub at: DateTime<Utc>,
    /// 이 메시지가 속한 턴. 턴을 두기 전의 메시지는 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionAnalysisResponse {
    pub session_id: String,
    pub closed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plan: Option<SupportPlanResponse>,
    pub analyses: Vec<TurnAnalysisResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<SessionSummaryResponse>,
    pub history: Vec<MessageResponse>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportPlanResponse {
    #[serde(with = "crate::shared::iso_millis")]
    pub created_at: DateTime<Utc>,
    pub path_focus: String,
    pub task_focuses: Vec<TaskFocusResponse>,
    pub cautions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskFocusResponse {
    pub task: u8,
    pub emphasis: String,
    pub tone: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplyPhase {
    Intro,
    Resume,
    Task,
    Deepen,
    Retry,
    Closing,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnAnalysisResponse {
    #[serde(with = "crate::shared::iso_millis")]
    pub at: DateTime<Utc>,
    pub task: u8,
    pub phase: ReplyPhase,
    pub risk: RiskAssessmentResponse,
    pub transition: TaskTransitionResponse,
    pub knowledge: Vec<KnowledgeRefResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supervision: Option<SupervisionResponse>,
    /// 답의 판정 라벨(ADR-0031). 판정이 없으면(끔, 실패, 위기 턴) 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_label: Option<String>,
    /// 판정기가 그 라벨에 준 확률. 확률을 주지 않는 판정기면 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_label_probability: Option<f32>,
    /// 판정기와 그 버전(`<이름>@<x.y.z>`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_judge: Option<String>,
    /// 이 턴에 발화 모델에 준 것(sandbox 전용 턴 추적). production 은 늘 없어 칸이 빠진다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace: Option<TurnTrace>,
}

/// 한 턴의 발화 프롬프트 추적: 지시문 버전, 조립한 블록의 이름과 길이, 이번 턴의 화법 결정, 시스템 프롬프트 전문.
/// `APP_ENV=sandbox` 에서만 만든다(sandbox 의 세션은 QA 계정과 지어낸 인물뿐이다). `turn_analyses.trace` 에 그대로 저장된다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnTrace {
    pub prompt_version: String,
    /// 시스템 프롬프트를 이룬 블록, 조립 순서대로.
    pub blocks: Vec<TraceBlock>,
    pub turn_style: TurnStyleDecisions,
    pub system_prompt: String,
}

/// 시스템 프롬프트의 블록 하나: 이름과 글자 수(유니코드 스칼라 수).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TraceBlock {
    pub name: String,
    pub chars: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RiskDetector {
    Keyword,
    Model,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskAssessmentResponse {
    pub level: u8,
    pub detected_by: RiskDetector,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTransitionResponse {
    pub from: u8,
    pub to: u8,
    pub advanced: bool,
    pub retry_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct KnowledgeRefResponse {
    pub source: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SupervisionQuality {
    Ok,
    Review,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SupervisionResponse {
    pub evaluated: bool,
    pub quality: SupervisionQuality,
    pub flags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryResponse {
    #[serde(with = "crate::shared::iso_millis")]
    pub at: DateTime<Utc>,
    pub reached_task: u8,
    pub turn_count: u32,
    pub highest_support_level: u8,
    pub headline: String,
    pub follow_up: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReportSectionKey {
    Journey,
    Emotions,
    Keepsake,
    Encouragement,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MindReportSectionResponse {
    pub key: ReportSectionKey,
    pub body: String,
    /// emotions 구역의 감정 낱말(2~4개). 모델이 리포트를 쓸 때 함께 쓴 사실이라 리포트 안에 둔다(#15). 옛 리포트와 다른 구역은 없다.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

/// 세션을 마칠 때 사용자에게 보이는 마음 리포트.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MindReportResponse {
    #[serde(with = "crate::shared::iso_millis")]
    pub at: DateTime<Utc>,
    /// 세션을 시작한 시각. 저장된 리포트에는 없고 응답 때 세션에서 붙인다(#15).
    #[serde(with = "crate::shared::iso_millis")]
    pub started_at: DateTime<Utc>,
    pub pet_name: String,
    pub reached_task: u8,
    pub progress: f64,
    pub locale: ChatLanguage,
    pub sections: Vec<MindReportSectionResponse>,
}

#[cfg(test)]
mod tests;

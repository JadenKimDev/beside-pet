//! 저장 칸의 값과 대화 값 사이의 변환: 역할·단계·감지자·감독 품질의 글, 과제·수준·횟수의 수, JSONB 문서.
//!
//! 모르는 글과 범위 밖의 수는 읽기 오류다(기본값으로 넘기지 않는다). 오류 문구에는 칸 이름과 그 태그만 싣고,
//! JSONB 의 오류는 줄과 칸 자리만 싣는다(serde 의 문구는 본문 조각을 품을 수 있다).

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::super::response::{
    KnowledgeRefResponse, MessageRole, ReplyPhase, RiskDetector, SupervisionQuality,
    SupervisionResponse,
};
use super::super::rules::{SupportLevel, Task};
use super::super::session::{TurnErrorKind, TurnStatus};

fn decode_error(message: String) -> sqlx::Error {
    sqlx::Error::Decode(message.into())
}

fn unknown(column: &str, text: &str) -> sqlx::Error {
    decode_error(format!("{column} has an unknown value {text:?}"))
}

fn out_of_range(column: &str, number: i32) -> sqlx::Error {
    decode_error(format!("{column} is out of range: {number}"))
}

pub(super) fn role_text(role: MessageRole) -> &'static str {
    match role {
        MessageRole::Assistant => "assistant",
        MessageRole::User => "user",
    }
}

pub(super) fn parse_role(text: &str) -> Result<MessageRole, sqlx::Error> {
    match text {
        "assistant" => Ok(MessageRole::Assistant),
        "user" => Ok(MessageRole::User),
        _ => Err(unknown("messages.role", text)),
    }
}

pub(super) fn phase_text(phase: ReplyPhase) -> &'static str {
    match phase {
        ReplyPhase::Intro => "intro",
        ReplyPhase::Resume => "resume",
        ReplyPhase::Task => "task",
        ReplyPhase::Deepen => "deepen",
        ReplyPhase::Retry => "retry",
        ReplyPhase::Closing => "closing",
    }
}

pub(super) fn parse_phase(text: &str) -> Result<ReplyPhase, sqlx::Error> {
    match text {
        "intro" => Ok(ReplyPhase::Intro),
        "resume" => Ok(ReplyPhase::Resume),
        "task" => Ok(ReplyPhase::Task),
        "deepen" => Ok(ReplyPhase::Deepen),
        "retry" => Ok(ReplyPhase::Retry),
        "closing" => Ok(ReplyPhase::Closing),
        _ => Err(unknown("turn_analyses.phase", text)),
    }
}

pub(super) fn detector_text(detector: RiskDetector) -> &'static str {
    match detector {
        RiskDetector::Keyword => "keyword",
        RiskDetector::None => "none",
    }
}

pub(super) fn parse_detector(text: &str) -> Result<RiskDetector, sqlx::Error> {
    match text {
        "keyword" => Ok(RiskDetector::Keyword),
        "none" => Ok(RiskDetector::None),
        _ => Err(unknown("turn_analyses.risk_detected_by", text)),
    }
}

pub(super) fn parse_turn_status(text: &str) -> Result<TurnStatus, sqlx::Error> {
    TurnStatus::parse(text).ok_or_else(|| unknown("turns.status", text))
}

pub(super) fn parse_turn_error_kind(text: &str) -> Result<TurnErrorKind, sqlx::Error> {
    TurnErrorKind::parse(text).ok_or_else(|| unknown("turns.error_kind", text))
}

/// `integer` 칸의 과제 번호.
pub(super) fn task_number(task: Task) -> i32 {
    i32::from(task.number())
}

pub(super) fn parse_task(column: &str, number: i32) -> Result<Task, sqlx::Error> {
    u8::try_from(number)
        .ok()
        .and_then(Task::new)
        .ok_or_else(|| out_of_range(column, number))
}

pub(super) fn level_number(level: SupportLevel) -> i32 {
    i32::from(level.number())
}

pub(super) fn parse_level(column: &str, number: i32) -> Result<SupportLevel, sqlx::Error> {
    u8::try_from(number)
        .ok()
        .and_then(SupportLevel::from_number)
        .ok_or_else(|| out_of_range(column, number))
}

/// 재시도 횟수와 순번. `integer` 에 들지 않으면 쓰기 오류다.
pub(super) fn count_number(column: &str, count: u32) -> Result<i32, sqlx::Error> {
    i32::try_from(count)
        .map_err(|_| sqlx::Error::Encode(format!("{column} does not fit integer").into()))
}

pub(super) fn parse_count(column: &str, number: i32) -> Result<u32, sqlx::Error> {
    u32::try_from(number).map_err(|_| out_of_range(column, number))
}

/// JSONB 칸에 쓸 글.
pub(super) fn to_document<T: Serialize>(column: &str, value: &T) -> Result<String, sqlx::Error> {
    serde_json::to_string(value)
        .map_err(|_| sqlx::Error::Encode(format!("{column} could not be written").into()))
}

/// JSONB 칸(`::text` 로 읽은 글)의 문서.
pub(super) fn from_document<T: DeserializeOwned>(
    column: &str,
    text: &str,
) -> Result<T, sqlx::Error> {
    serde_json::from_str(text).map_err(|error| {
        decode_error(format!(
            "{column} does not have the expected shape (line {}, column {})",
            error.line(),
            error.column()
        ))
    })
}

/// `turn_analyses.knowledge` 의 원소. TS 와 같은 `{ source, tags }`.
#[derive(Serialize, Deserialize)]
pub(super) struct KnowledgeDocument {
    source: String,
    tags: Vec<String>,
}

impl KnowledgeDocument {
    pub(super) fn of(knowledge: &KnowledgeRefResponse) -> KnowledgeDocument {
        KnowledgeDocument {
            source: knowledge.source.clone(),
            tags: knowledge.tags.clone(),
        }
    }

    pub(super) fn into_ref(self) -> KnowledgeRefResponse {
        KnowledgeRefResponse {
            source: self.source,
            tags: self.tags,
        }
    }
}

/// `turn_analyses.supervision`. TS 와 같은 `{ evaluated, quality, flags, note? }`.
#[derive(Serialize, Deserialize)]
pub(super) struct SupervisionDocument {
    evaluated: bool,
    quality: String,
    flags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

impl SupervisionDocument {
    pub(super) fn of(supervision: &SupervisionResponse) -> SupervisionDocument {
        let quality = match supervision.quality {
            SupervisionQuality::Ok => "ok",
            SupervisionQuality::Review => "review",
        };
        SupervisionDocument {
            evaluated: supervision.evaluated,
            quality: quality.to_owned(),
            flags: supervision.flags.clone(),
            note: supervision.note.clone(),
        }
    }

    pub(super) fn into_response(self) -> Result<SupervisionResponse, sqlx::Error> {
        let quality = match self.quality.as_str() {
            "ok" => SupervisionQuality::Ok,
            "review" => SupervisionQuality::Review,
            other => return Err(unknown("turn_analyses.supervision.quality", other)),
        };
        Ok(SupervisionResponse {
            evaluated: self.evaluated,
            quality,
            flags: self.flags,
            note: self.note,
        })
    }
}

//! 호출 기록: 모델 호출 한 번의 사실(`CallRecord`)을 적는 곳(`UsageSink` trait)과 메모리 구현.
//!
//! 기록은 본문 없이 누가(공급자, 모델), 무엇을 위해(역할, 프롬프트 버전, 세션), 얼마나(토큰, 시간), 어떻게 끝났는가만 갖는다.
//! 비용은 싣지 않는다(DB 의 단가 테이블과 뷰가 구한다). 메모리 구현은 테스트용이고, 적을 때 디버그 로그를 남긴다.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use chrono::{DateTime, Utc};

use super::{CallPurpose, LlmProvider};

mod postgres;

pub use postgres::PostgresUsageSink;

/// 실패한 호출의 종류. 원인의 글은 싣지 않는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CallErrorKind {
    /// 공급자 호출이 실패했다(연결, 상태 코드, 읽을 수 없는 응답, 공급자 쪽 시간 제한).
    Provider,
    /// 기본 모델의 공급자가 등록되지 않아 부르지 못했다.
    Unavailable,
    /// 끝나기 전에 부른 쪽이 기다리기를 멈췄다(대화의 시간 제한, 연결 끊김).
    Cancelled,
}

impl CallErrorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            CallErrorKind::Provider => "provider",
            CallErrorKind::Unavailable => "unavailable",
            CallErrorKind::Cancelled => "cancelled",
        }
    }
}

/// 호출이 어떻게 끝났는가.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CallOutcome {
    Ok,
    Error(CallErrorKind),
}

impl CallOutcome {
    /// `ok` 또는 `error`.
    pub fn as_str(self) -> &'static str {
        match self {
            CallOutcome::Ok => "ok",
            CallOutcome::Error(_) => "error",
        }
    }

    pub fn error_kind(self) -> Option<CallErrorKind> {
        match self {
            CallOutcome::Ok => None,
            CallOutcome::Error(kind) => Some(kind),
        }
    }
}

/// 끝난 호출 한 번.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallRecord {
    pub provider: LlmProvider,
    pub model: String,
    pub purpose: CallPurpose,
    pub prompt_version: String,
    pub session_id: Option<String>,
    /// 공급자가 알려 준 토큰. 실패했거나 알려 주지 않았으면 없다.
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    /// 부른 때부터 끝난 때까지.
    pub duration_ms: u32,
    /// 스트리밍에서 첫 글 조각까지. `generate` 에는 없다.
    pub first_token_ms: Option<u32>,
    pub outcome: CallOutcome,
    /// 호출이 끝난 시각.
    pub at: DateTime<Utc>,
}

/// 호출 기록을 적는 곳. 적기가 호출을 막거나 실패시키지 않는다.
pub trait UsageSink: Send + Sync {
    fn record(&self, record: CallRecord);
}

pub type SharedUsageSink = Arc<dyn UsageSink>;

/// 프로세스 메모리에 적는 싱크.
#[derive(Debug, Default)]
pub struct InMemoryUsageSink {
    records: Mutex<Vec<CallRecord>>,
}

impl InMemoryUsageSink {
    /// 지금까지 적은 것(적은 순서).
    pub fn list(&self) -> Vec<CallRecord> {
        self.records().clone()
    }

    /// 적다가 다른 스레드가 멈췄어도 쌓인 기록은 그대로 쓴다.
    fn records(&self) -> MutexGuard<'_, Vec<CallRecord>> {
        self.records.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl UsageSink for InMemoryUsageSink {
    fn record(&self, record: CallRecord) {
        tracing::debug!(
            provider = record.provider.as_str(),
            model = %record.model,
            purpose = record.purpose.as_str(),
            outcome = record.outcome.as_str(),
            error_kind = record.outcome.error_kind().map(CallErrorKind::as_str),
            input_tokens = record.input_tokens,
            output_tokens = record.output_tokens,
            duration_ms = record.duration_ms,
            "model call"
        );
        self.records().push(record);
    }
}

#[cfg(test)]
mod tests;

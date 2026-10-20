//! 계측 기능이 저장에 묻는 것(`MetricsSource`)과 그 답의 모양. 답의 항목은 응답의 항목과 같은 모양으로 직렬화한다.

use std::sync::Arc;

use chrono::NaiveDate;
use futures_util::future::BoxFuture;
use serde::Serialize;

use super::Period;
use crate::shared::ApiError;

/// 기간 안의 호출을 (공급자, 모델, 역할, 프롬프트 버전)으로 묶은 것. 시간은 ms 이고 비용은 USD 다.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub provider: String,
    pub model: String,
    pub purpose: String,
    pub prompt_version: String,
    pub calls: i64,
    pub errors: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub p50_ms: f64,
    pub p95_ms: f64,
    /// 스트리밍 호출이 하나도 없으면 칸을 뺀다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_token_p50_ms: Option<f64>,
    pub cost_usd: f64,
}

/// UTC 날짜, 공급자, 모델별 호출 집계(`llm_calls_daily`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: NaiveDate,
    pub provider: String,
    pub model: String,
    pub calls: i64,
    pub errors: i64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
}

/// 위기 턴 수를 잡은 쪽으로 나눈 것.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CrisisCounts {
    pub keyword: i64,
    pub model: i64,
}

/// UTC 날짜별 대화 집계(`conversations_daily`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ConversationDay {
    pub date: NaiveDate,
    pub sessions: i64,
    pub turns: i64,
    pub crisis: CrisisCounts,
}

/// 계측의 저장. 날짜별 집계는 기간이 걸친 UTC 날짜(양 끝 포함)를 본다.
pub trait MetricsSource: Send + Sync {
    /// 기간(`from` 이상 `to` 이하)의 호출을 묶은 것. 공급자, 모델, 역할, 버전 순이다.
    fn models(&self, period: Period) -> BoxFuture<'_, Result<Vec<ModelUsage>, ApiError>>;
    /// 기간이 걸친 날짜의 모델별 집계. 날짜, 공급자, 모델 순이다.
    fn model_days(&self, period: Period) -> BoxFuture<'_, Result<Vec<DailyUsage>, ApiError>>;
    /// 기간이 걸친 날짜의 대화 집계. 날짜 순이다.
    fn conversation_days(
        &self,
        period: Period,
    ) -> BoxFuture<'_, Result<Vec<ConversationDay>, ApiError>>;
}

pub type SharedMetricsSource = Arc<dyn MetricsSource>;

/// 아직 저장을 끼우지 않은 조립: 모두 `501 Not implemented`.
pub struct Unimplemented;

impl MetricsSource for Unimplemented {
    fn models(&self, _: Period) -> BoxFuture<'_, Result<Vec<ModelUsage>, ApiError>> {
        Box::pin(async { Err(ApiError::NotImplemented) })
    }

    fn model_days(&self, _: Period) -> BoxFuture<'_, Result<Vec<DailyUsage>, ApiError>> {
        Box::pin(async { Err(ApiError::NotImplemented) })
    }

    fn conversation_days(
        &self,
        _: Period,
    ) -> BoxFuture<'_, Result<Vec<ConversationDay>, ApiError>> {
        Box::pin(async { Err(ApiError::NotImplemented) })
    }
}

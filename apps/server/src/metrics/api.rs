//! 계측의 HTTP 겉: `/v1/admin/metrics/*` 의 라우터, 핸들러와 응답 타입. 관리자만 부른다.

use axum::extract::{FromRef, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{Map, Value};

use super::{ConversationDay, DailyUsage, ModelUsage, Period, SharedMetricsSource};
use crate::identity::{AdminAccount, SharedAuthenticator};
use crate::shared::{ApiError, Rule, Validator, iso_millis};

/// `GET /v1/admin/metrics/models` 의 응답.
#[derive(Debug, Serialize)]
pub struct ModelsResponse {
    #[serde(with = "iso_millis")]
    pub from: DateTime<Utc>,
    #[serde(with = "iso_millis")]
    pub to: DateTime<Utc>,
    pub models: Vec<ModelUsage>,
    pub daily: Vec<DailyUsage>,
}

/// `GET /v1/admin/metrics/conversations` 의 응답.
#[derive(Debug, Serialize)]
pub struct ConversationsResponse {
    #[serde(with = "iso_millis")]
    pub from: DateTime<Utc>,
    #[serde(with = "iso_millis")]
    pub to: DateTime<Utc>,
    pub daily: Vec<ConversationDay>,
}

/// 계측 경로 둘. 관리자 가드는 상태에서 `SharedAuthenticator` 를 꺼낸다.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    SharedMetricsSource: FromRef<S>,
    SharedAuthenticator: FromRef<S>,
{
    Router::new()
        .route("/v1/admin/metrics/models", get(models))
        .route("/v1/admin/metrics/conversations", get(conversations))
}

async fn models(
    _: AdminAccount,
    State(source): State<SharedMetricsSource>,
    Query(query): Query<Map<String, Value>>,
) -> Result<Json<ModelsResponse>, ApiError> {
    let period = period(&query)?;
    let (models, daily) = tokio::try_join!(source.models(period), source.model_days(period))?;
    Ok(Json(ModelsResponse {
        from: period.from,
        to: period.to,
        models,
        daily,
    }))
}

async fn conversations(
    _: AdminAccount,
    State(source): State<SharedMetricsSource>,
    Query(query): Query<Map<String, Value>>,
) -> Result<Json<ConversationsResponse>, ApiError> {
    let period = period(&query)?;
    let daily = source.conversation_days(period).await?;
    Ok(Json(ConversationsResponse {
        from: period.from,
        to: period.to,
        daily,
    }))
}

/// 질의 문자열의 검증(모르는 칸, ISO-8601)을 class-validator 문구로 하고 기간을 정한다.
fn period(query: &Map<String, Value>) -> Result<Period, ApiError> {
    let query = Value::Object(query.clone());
    Validator::new(&query)
        .optional("from", &[Rule::IsIso8601])
        .optional("to", &[Rule::IsIso8601])
        .finish()?;
    Period::resolve(
        query.get("from").and_then(Value::as_str),
        query.get("to").and_then(Value::as_str),
        Utc::now(),
    )
}

#[cfg(test)]
mod tests;

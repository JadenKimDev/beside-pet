//! 계측의 저장 SQL: `llm_call_costs`, `llm_calls_daily`, `conversations_daily`, `daily_reply_labels` 뷰를 기간으로 읽는다.
//! 묶음과 백분위는 쿼리가 구하고, 여기서는 행을 옮겨 담을 뿐이다. numeric 은 `float8` 로 읽는다.

use std::sync::Arc;

use chrono::NaiveDate;
use futures_util::future::BoxFuture;
use sqlx::PgPool;

use super::{
    ConversationDay, CrisisCounts, DailyUsage, MetricsSource, ModelUsage, Period, ReplyLabelCounts,
    SharedMetricsSource,
};
use crate::shared::ApiError;

/// Postgres 의 뷰를 읽는 `MetricsSource`.
pub struct PostgresMetrics {
    pool: PgPool,
}

impl PostgresMetrics {
    pub fn shared(pool: PgPool) -> SharedMetricsSource {
        Arc::new(PostgresMetrics { pool })
    }
}

/// 읽기 실패는 종류만 로그에 남기고 500 으로 돌린다(집계 쿼리라 본문이 실리지 않는다).
fn failed(query: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| {
        tracing::error!(query, error = %error, "metrics query failed");
        ApiError::Internal
    }
}

#[derive(sqlx::FromRow)]
struct ModelRow {
    provider: String,
    model: String,
    purpose: String,
    prompt_version: String,
    calls: i64,
    errors: i64,
    input_tokens: i64,
    output_tokens: i64,
    p50_ms: f64,
    p95_ms: f64,
    first_token_p50_ms: Option<f64>,
    cost_usd: f64,
}

#[derive(sqlx::FromRow)]
struct DailyRow {
    date: NaiveDate,
    provider: String,
    model: String,
    calls: i64,
    errors: i64,
    input_tokens: i64,
    output_tokens: i64,
    cost_usd: f64,
}

#[derive(sqlx::FromRow)]
struct ConversationRow {
    date: NaiveDate,
    sessions: i64,
    turns: i64,
    crisis_keyword: i64,
    crisis_model: i64,
    generic_comfort: i64,
    specific_reflection: i64,
    question: i64,
}

impl MetricsSource for PostgresMetrics {
    fn models(&self, period: Period) -> BoxFuture<'_, Result<Vec<ModelUsage>, ApiError>> {
        Box::pin(async move {
            let rows: Vec<ModelRow> = sqlx::query_as(
                "SELECT provider::text, model::text, purpose::text, prompt_version::text, \
                        count(*) AS calls, \
                        count(*) FILTER (WHERE outcome = 'error') AS errors, \
                        COALESCE(sum(input_tokens), 0)::int8 AS input_tokens, \
                        COALESCE(sum(output_tokens), 0)::int8 AS output_tokens, \
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms, \
                        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms, \
                        percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) \
                          FILTER (WHERE first_token_ms IS NOT NULL) AS first_token_p50_ms, \
                        COALESCE(sum(cost_usd), 0)::float8 AS cost_usd \
                 FROM llm_call_costs \
                 WHERE at >= $1 AND at <= $2 \
                 GROUP BY provider, model, purpose, prompt_version \
                 ORDER BY provider, model, purpose, prompt_version",
            )
            .bind(period.from)
            .bind(period.to)
            .fetch_all(&self.pool)
            .await
            .map_err(failed("models"))?;
            Ok(rows
                .into_iter()
                .map(|r| ModelUsage {
                    provider: r.provider,
                    model: r.model,
                    purpose: r.purpose,
                    prompt_version: r.prompt_version,
                    calls: r.calls,
                    errors: r.errors,
                    input_tokens: r.input_tokens,
                    output_tokens: r.output_tokens,
                    p50_ms: r.p50_ms,
                    p95_ms: r.p95_ms,
                    first_token_p50_ms: r.first_token_p50_ms,
                    cost_usd: r.cost_usd,
                })
                .collect())
        })
    }

    fn model_days(&self, period: Period) -> BoxFuture<'_, Result<Vec<DailyUsage>, ApiError>> {
        Box::pin(async move {
            let (first, last) = period.days();
            let rows: Vec<DailyRow> = sqlx::query_as(
                "SELECT date, provider::text, model::text, calls, errors, input_tokens, output_tokens, \
                        COALESCE(cost_usd, 0)::float8 AS cost_usd \
                 FROM llm_calls_daily \
                 WHERE date BETWEEN $1 AND $2 \
                 ORDER BY date, provider, model",
            )
            .bind(first)
            .bind(last)
            .fetch_all(&self.pool)
            .await
            .map_err(failed("model_days"))?;
            Ok(rows
                .into_iter()
                .map(|r| DailyUsage {
                    date: r.date,
                    provider: r.provider,
                    model: r.model,
                    calls: r.calls,
                    errors: r.errors,
                    input_tokens: r.input_tokens,
                    output_tokens: r.output_tokens,
                    cost_usd: r.cost_usd,
                })
                .collect())
        })
    }

    fn conversation_days(
        &self,
        period: Period,
    ) -> BoxFuture<'_, Result<Vec<ConversationDay>, ApiError>> {
        Box::pin(async move {
            let (first, last) = period.days();
            let rows: Vec<ConversationRow> = sqlx::query_as(
                "WITH l AS ( \
                   SELECT date, \
                          COALESCE(sum(count) FILTER (WHERE reply_label = 'generic_comfort'), 0)::int8 AS generic_comfort, \
                          COALESCE(sum(count) FILTER (WHERE reply_label = 'specific_reflection'), 0)::int8 AS specific_reflection, \
                          COALESCE(sum(count) FILTER (WHERE reply_label = 'question'), 0)::int8 AS question \
                   FROM daily_reply_labels WHERE date BETWEEN $1 AND $2 GROUP BY date \
                 ) \
                 SELECT COALESCE(c.date, l.date) AS date, \
                        COALESCE(c.sessions, 0)::int8 AS sessions, \
                        COALESCE(c.turns, 0)::int8 AS turns, \
                        COALESCE(c.crisis_keyword, 0)::int8 AS crisis_keyword, \
                        COALESCE(c.crisis_model, 0)::int8 AS crisis_model, \
                        COALESCE(l.generic_comfort, 0) AS generic_comfort, \
                        COALESCE(l.specific_reflection, 0) AS specific_reflection, \
                        COALESCE(l.question, 0) AS question \
                 FROM (SELECT * FROM conversations_daily WHERE date BETWEEN $1 AND $2) c \
                 FULL JOIN l ON l.date = c.date \
                 ORDER BY 1",
            )
            .bind(first)
            .bind(last)
            .fetch_all(&self.pool)
            .await
            .map_err(failed("conversation_days"))?;
            Ok(rows
                .into_iter()
                .map(|r| ConversationDay {
                    date: r.date,
                    sessions: r.sessions,
                    turns: r.turns,
                    crisis: CrisisCounts {
                        keyword: r.crisis_keyword,
                        model: r.crisis_model,
                    },
                    reply_labels: ReplyLabelCounts {
                        generic_comfort: r.generic_comfort,
                        specific_reflection: r.specific_reflection,
                        question: r.question,
                    },
                })
                .collect())
        })
    }
}

#[cfg(test)]
mod tests;

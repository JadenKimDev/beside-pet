//! #4 의 계측 경로: 관리자 가드와 응답 칸. 저장은 지어낸 행을 내는 더블이다.

use std::sync::Arc;

use axum::http::{Method, StatusCode};
use chrono::NaiveDate;
use futures_util::future::BoxFuture;
use serde_json::json;

use beside_pet_server::metrics::{
    ConversationDay, CrisisCounts, DailyUsage, MetricsSource, ModelUsage, Period, ReplyLabelCounts,
};
use beside_pet_server::shared::ApiError;

use crate::harness::{Harness, Unimplemented};

const MODELS: &str = "/v1/admin/metrics/models";
const CONVERSATIONS: &str = "/v1/admin/metrics/conversations";

struct Fixed;

fn day() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 10, 18).unwrap()
}

impl MetricsSource for Fixed {
    fn models(&self, _: Period) -> BoxFuture<'_, Result<Vec<ModelUsage>, ApiError>> {
        Box::pin(async {
            Ok(vec![ModelUsage {
                provider: "anthropic".to_owned(),
                model: "claude-haiku-5-5".to_owned(),
                purpose: "crisis".to_owned(),
                prompt_version: "0.1.0".to_owned(),
                calls: 2,
                errors: 0,
                input_tokens: 600,
                output_tokens: 4,
                p50_ms: 55.0,
                p95_ms: 59.5,
                first_token_p50_ms: None,
                cost_usd: 0.000062,
            }])
        })
    }

    fn model_days(&self, _: Period) -> BoxFuture<'_, Result<Vec<DailyUsage>, ApiError>> {
        Box::pin(async {
            Ok(vec![DailyUsage {
                date: day(),
                provider: "anthropic".to_owned(),
                model: "claude-haiku-5-5".to_owned(),
                calls: 2,
                errors: 0,
                input_tokens: 600,
                output_tokens: 4,
                cost_usd: 0.000062,
            }])
        })
    }

    fn conversation_days(
        &self,
        _: Period,
    ) -> BoxFuture<'_, Result<Vec<ConversationDay>, ApiError>> {
        Box::pin(async {
            Ok(vec![ConversationDay {
                date: day(),
                sessions: 1,
                turns: 3,
                crisis: CrisisCounts {
                    keyword: 0,
                    model: 1,
                },
                reply_labels: ReplyLabelCounts {
                    generic_comfort: 2,
                    specific_reflection: 1,
                    question: 0,
                },
            }])
        })
    }
}

#[tokio::test]
async fn 계측은_관리자만_부른다() {
    let h = Harness::new(Unimplemented);
    for path in [MODELS, CONVERSATIONS] {
        let reply = h.send(Method::GET, path, None, None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{path}");
        let reply = h.send(Method::GET, path, Some("viewer"), None).await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{path}");
        assert_eq!(reply.body["message"], json!("Insufficient role"));
    }
}

#[tokio::test]
async fn 계측의_기간이_90일을_넘으면_400() {
    let h = Harness::with_metrics(Arc::new(Fixed));
    let reply = h
        .send(
            Method::GET,
            &format!("{MODELS}?from=2026-01-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z"),
            Some("admin"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 400, "message": "Range must be at most 90 days", "error": "Bad Request" })
    );
}

#[tokio::test]
async fn 모델별_응답의_칸() {
    let h = Harness::with_metrics(Arc::new(Fixed));
    let reply = h
        .send(
            Method::GET,
            &format!("{MODELS}?from=2026-10-14&to=2026-10-20"),
            Some("admin"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["from"], json!("2026-10-14T00:00:00.000Z"));
    assert_eq!(reply.body["to"], json!("2026-10-20T00:00:00.000Z"));
    let model = reply.body["models"][0].as_object().unwrap();
    let mut keys: Vec<&str> = model.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "calls",
            "costUsd",
            "errors",
            "inputTokens",
            "model",
            "outputTokens",
            "p50Ms",
            "p95Ms",
            "promptVersion",
            "provider",
            "purpose"
        ]
    );
    assert_eq!(model["promptVersion"], json!("0.1.0"));
    assert_eq!(
        reply.body["daily"],
        json!([{
            "date": "2026-10-18", "provider": "anthropic", "model": "claude-haiku-5-5",
            "calls": 2, "errors": 0, "inputTokens": 600, "outputTokens": 4, "costUsd": 0.000062
        }])
    );
}

#[tokio::test]
async fn 대화별_응답의_칸() {
    let h = Harness::with_metrics(Arc::new(Fixed));
    let reply = h
        .send(
            Method::GET,
            &format!("{CONVERSATIONS}?from=2026-10-14&to=2026-10-20"),
            Some("admin"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        reply.body,
        json!({
            "from": "2026-10-14T00:00:00.000Z",
            "to": "2026-10-20T00:00:00.000Z",
            "daily": [{
                "date": "2026-10-18", "sessions": 1, "turns": 3, "crisis": { "keyword": 0, "model": 1 },
                "replyLabels": { "generic_comfort": 2, "specific_reflection": 1, "question": 0 }
            }]
        })
    );
}

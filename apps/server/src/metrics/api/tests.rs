//! 계측 라우터의 겉 테스트. 저장과 인증은 더블이고 DB 는 쓰지 않는다. 값은 모두 지어낸 것이다.

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::FromRef;
use axum::http::{Request, StatusCode};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::router;
use crate::identity::{
    AuthenticatedAccount, Authenticator, BoxFuture as IdentityFuture, Role, SharedAuthenticator,
};
use crate::metrics::{
    ConversationDay, CrisisCounts, DailyUsage, MetricsSource, ModelUsage, Period, ReplyLabelCounts,
    SharedMetricsSource,
};
use crate::shared::ApiError;

/// 토큰 `admin`·`viewer` 는 그 역할, 나머지는 읽지 못한 토큰.
struct FakeAuthenticator;

impl Authenticator for FakeAuthenticator {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> IdentityFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        let role = match token {
            "admin" => Some(Role::Admin),
            "viewer" => Some(Role::Viewer),
            _ => None,
        };
        let account = role.map(|role| AuthenticatedAccount {
            id: format!("{token}-id"),
            username: "maple".to_owned(),
            company: "Acme Pets".to_owned(),
            role,
        });
        Box::pin(async move { Ok(account) })
    }
}

fn day(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

/// 고정한 행을 내고 받은 기간을 적어 둔다.
#[derive(Default)]
struct FakeSource {
    periods: Mutex<Vec<Period>>,
}

impl FakeSource {
    fn seen(&self, period: Period) {
        self.periods.lock().unwrap().push(period);
    }
}

impl MetricsSource for FakeSource {
    fn models(&self, period: Period) -> BoxFuture<'_, Result<Vec<ModelUsage>, ApiError>> {
        self.seen(period);
        let streamed = ModelUsage {
            provider: "anthropic".to_owned(),
            model: "claude-haiku-5-5".to_owned(),
            purpose: "reply".to_owned(),
            prompt_version: "0.1.0".to_owned(),
            calls: 3,
            errors: 1,
            input_tokens: 4500,
            output_tokens: 600,
            p50_ms: 1200.0,
            p95_ms: 1980.5,
            first_token_p50_ms: Some(300.0),
            cost_usd: 0.00075,
        };
        let judged = ModelUsage {
            purpose: "crisis".to_owned(),
            first_token_p50_ms: None,
            ..streamed.clone()
        };
        Box::pin(async move { Ok(vec![streamed, judged]) })
    }

    fn model_days(&self, period: Period) -> BoxFuture<'_, Result<Vec<DailyUsage>, ApiError>> {
        self.seen(period);
        Box::pin(async {
            Ok(vec![DailyUsage {
                date: day("2026-10-18"),
                provider: "anthropic".to_owned(),
                model: "claude-haiku-5-5".to_owned(),
                calls: 3,
                errors: 1,
                input_tokens: 4500,
                output_tokens: 600,
                cost_usd: 0.00075,
            }])
        })
    }

    fn conversation_days(
        &self,
        period: Period,
    ) -> BoxFuture<'_, Result<Vec<ConversationDay>, ApiError>> {
        self.seen(period);
        Box::pin(async {
            Ok(vec![ConversationDay {
                date: day("2026-10-19"),
                sessions: 2,
                turns: 7,
                crisis: CrisisCounts {
                    keyword: 1,
                    model: 0,
                },
                reply_labels: ReplyLabelCounts {
                    generic_comfort: 4,
                    specific_reflection: 2,
                    question: 1,
                },
            }])
        })
    }
}

#[derive(Clone)]
struct TestState {
    source: SharedMetricsSource,
    authenticator: SharedAuthenticator,
}

impl FromRef<TestState> for SharedMetricsSource {
    fn from_ref(state: &TestState) -> SharedMetricsSource {
        state.source.clone()
    }
}

impl FromRef<TestState> for SharedAuthenticator {
    fn from_ref(state: &TestState) -> SharedAuthenticator {
        state.authenticator.clone()
    }
}

struct Harness {
    source: Arc<FakeSource>,
    app: Router,
}

impl Harness {
    fn new() -> Harness {
        let source = Arc::new(FakeSource::default());
        let state = TestState {
            source: source.clone(),
            authenticator: Arc::new(FakeAuthenticator),
        };
        Harness {
            source,
            app: router().with_state(state),
        }
    }

    fn periods(&self) -> Vec<Period> {
        self.source.periods.lock().unwrap().clone()
    }

    async fn get(&self, uri: &str, token: Option<&str>) -> (StatusCode, Value) {
        let mut request = Request::get(uri);
        if let Some(token) = token {
            request = request.header("cookie", format!("beside-pet.token={token}"));
        }
        let response = self
            .app
            .clone()
            .oneshot(request.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (
            status,
            serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        )
    }
}

const MODELS: &str = "/v1/admin/metrics/models";
const CONVERSATIONS: &str = "/v1/admin/metrics/conversations";

#[tokio::test]
async fn 인증이_없으면_401_관리자가_아니면_403_이고_저장을_묻지_않는다() {
    let h = Harness::new();
    for path in [MODELS, CONVERSATIONS] {
        let (status, body) = h.get(path, None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "{path}");
        assert_eq!(
            body,
            json!({ "statusCode": 401, "message": "Not authenticated", "error": "Unauthorized" })
        );
        let (status, body) = h.get(path, Some("viewer")).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{path}");
        assert_eq!(
            body,
            json!({ "statusCode": 403, "message": "Insufficient role", "error": "Forbidden" })
        );
    }
    assert!(h.periods().is_empty());
}

#[tokio::test]
async fn 모델별_응답은_기간과_묶음과_날짜별을_싣는다() {
    let h = Harness::new();
    let (status, body) = h
        .get(
            &format!("{MODELS}?from=2026-10-14&to=2026-10-20T12:00:00.000Z"),
            Some("admin"),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body,
        json!({
            "from": "2026-10-14T00:00:00.000Z",
            "to": "2026-10-20T12:00:00.000Z",
            "models": [
                {
                    "provider": "anthropic", "model": "claude-haiku-5-5", "purpose": "reply",
                    "promptVersion": "0.1.0", "calls": 3, "errors": 1, "inputTokens": 4500,
                    "outputTokens": 600, "p50Ms": 1200.0, "p95Ms": 1980.5, "firstTokenP50Ms": 300.0,
                    "costUsd": 0.00075
                },
                {
                    "provider": "anthropic", "model": "claude-haiku-5-5", "purpose": "crisis",
                    "promptVersion": "0.1.0", "calls": 3, "errors": 1, "inputTokens": 4500,
                    "outputTokens": 600, "p50Ms": 1200.0, "p95Ms": 1980.5, "costUsd": 0.00075
                }
            ],
            "daily": [
                {
                    "date": "2026-10-18", "provider": "anthropic", "model": "claude-haiku-5-5",
                    "calls": 3, "errors": 1, "inputTokens": 4500, "outputTokens": 600,
                    "costUsd": 0.00075
                }
            ]
        })
    );
    let want = Period {
        from: "2026-10-14T00:00:00Z".parse().unwrap(),
        to: "2026-10-20T12:00:00Z".parse().unwrap(),
    };
    assert_eq!(h.periods(), vec![want, want]);
}

#[tokio::test]
async fn 대화_응답은_날짜별_대화와_턴과_위기를_싣는다() {
    let h = Harness::new();
    let (status, body) = h.get(CONVERSATIONS, Some("admin")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["daily"],
        json!([{
            "date": "2026-10-19", "sessions": 2, "turns": 7, "crisis": { "keyword": 1, "model": 0 },
            "replyLabels": { "generic_comfort": 4, "specific_reflection": 2, "question": 1 }
        }])
    );
    let from: DateTime<Utc> = body["from"].as_str().unwrap().parse().unwrap();
    let to: DateTime<Utc> = body["to"].as_str().unwrap().parse().unwrap();
    assert_eq!(to - from, Duration::days(7));
    assert!((Utc::now() - to).num_seconds().abs() < 60, "{to}");
    assert!(body["to"].as_str().unwrap().ends_with('Z'));
}

#[tokio::test]
async fn 기간이_틀리면_400_이고_저장을_묻지_않는다() {
    let h = Harness::new();
    let cases = [
        (
            format!("{MODELS}?from=2026-10-05&to=2026-10-04"),
            json!("to must not be before from"),
        ),
        (
            format!("{CONVERSATIONS}?from=2026-01-01&to=2026-10-01"),
            json!("Range must be at most 90 days"),
        ),
        (
            format!("{MODELS}?from=yesterday"),
            json!(["from must be a valid ISO 8601 date string"]),
        ),
        (
            format!("{CONVERSATIONS}?limit=5"),
            json!(["property limit should not exist"]),
        ),
    ];
    for (uri, message) in cases {
        let (status, body) = h.get(&uri, Some("admin")).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{uri}");
        assert_eq!(
            body,
            json!({ "statusCode": 400, "message": message, "error": "Bad Request" }),
            "{uri}"
        );
    }
    assert!(h.periods().is_empty());
}

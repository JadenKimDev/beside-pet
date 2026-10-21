//! 통합 테스트의 더블과 요청 도우미. 기능 안의 더블은 `#[cfg(test)]` 라 여기서 따로 둔다.

use std::sync::Arc;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use chrono::{DateTime, Utc};
use futures_util::stream;
use serde_json::Value;
use tower::ServiceExt;

use beside_pet_server::app::{AppState, Services, router};
use beside_pet_server::identity::{
    AuthenticatedAccount, Authenticator, BoxFuture, ChatLanguage, Role, SharedAuthenticator,
};
use beside_pet_server::metrics::SharedMetricsSource;
use beside_pet_server::shared::{ApiError, Config};
use beside_pet_server::support::{
    MessageResponse, MindReportResponse, MindReportSectionResponse, ReportSectionKey, Requester,
    SendMessageRequest,
    SessionAnalysisResponse, SessionListItemResponse, SessionStateResponse, SharedSupportService,
    StartSessionRequest, StreamEvent, SupportService, TurnResponse, TurnStream,
};

pub use beside_pet_server::support::Unimplemented;

/// 토큰 `viewer`·`admin` 은 그 역할의 계정, 나머지는 `None`(읽을 수 없는 토큰).
pub struct TokenAuthenticator;

impl Authenticator for TokenAuthenticator {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        let role = match token {
            "viewer" => Some(Role::Viewer),
            "admin" => Some(Role::Admin),
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

/// 스트림 턴은 `meta`, `token`, `done` 셋을 흘리고, 목록과 리포트는 지어낸 값을 내고, 나머지는 `Unimplemented` 에 넘긴다.
pub struct Scripted;

pub fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

/// 메시지가 있는 세션과 없는 세션.
pub fn list_items() -> Vec<SessionListItemResponse> {
    let busy = SessionListItemResponse {
        session_id: "s-busy".to_owned(),
        started_at: at("2026-10-16T09:00:00Z"),
        closed: true,
        reached_task: 3,
        progress: 0.5,
        pet_name: Some("Dotori".to_owned()),
        preferred_language: ChatLanguage::Ko,
        report_available: true,
        last_message_at: Some(at("2026-10-16T09:42:30.250Z")),
        duration_minutes: Some(42),
        message_count: 9,
    };
    let quiet = SessionListItemResponse {
        session_id: "s-quiet".to_owned(),
        closed: false,
        report_available: false,
        last_message_at: None,
        duration_minutes: None,
        message_count: 0,
        ..busy.clone()
    };
    vec![busy, quiet]
}

pub fn mind_report() -> MindReportResponse {
    MindReportResponse {
        at: at("2026-10-16T10:00:00Z"),
        started_at: at("2026-10-16T09:00:00Z"),
        pet_name: "Dotori".to_owned(),
        reached_task: 3,
        progress: 0.5,
        locale: ChatLanguage::Ko,
        sections: vec![
            MindReportSectionResponse {
                key: ReportSectionKey::Journey,
                body: "made-up journey".to_owned(),
                tags: None,
            },
            MindReportSectionResponse {
                key: ReportSectionKey::Emotions,
                body: "made-up emotions".to_owned(),
                tags: Some(vec!["그리움".to_owned(), "고마움".to_owned()]),
            },
        ],
    }
}

pub fn three_events() -> Vec<StreamEvent> {
    vec![
        StreamEvent::Meta {
            task: 1,
            progress: 0.25,
            support_level: 2,
            done: false,
        },
        StreamEvent::Token {
            text: "곁에 있어요".to_owned(),
        },
        StreamEvent::Done {
            result: TurnResponse {
                reply: "곁에 있어요".to_owned(),
                task: 1,
                progress: 0.25,
                support_level: 2,
                done: false,
            },
        },
    ]
}

fn turn_stream() -> TurnStream {
    Box::pin(stream::iter(three_events().into_iter().map(Ok)))
}

impl SupportService for Scripted {
    fn start<'a>(
        &'a self,
        requester: &'a Requester,
        request: StartSessionRequest,
    ) -> futures_util::future::BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Unimplemented.start(requester, request)
    }
    fn start_stream(&self, _: Requester, _: StartSessionRequest) -> TurnStream {
        turn_stream()
    }
    fn send<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        request: SendMessageRequest,
    ) -> futures_util::future::BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Unimplemented.send(requester, session_id, request)
    }
    fn send_stream(&self, _: Requester, _: String, _: SendMessageRequest) -> TurnStream {
        turn_stream()
    }
    fn close<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        Unimplemented.close(requester, session_id)
    }
    fn delete<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<(), ApiError>> {
        Unimplemented.delete(requester, session_id)
    }
    fn list<'a>(
        &'a self,
        _: &'a Requester,
    ) -> futures_util::future::BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>> {
        Box::pin(async { Ok(list_items()) })
    }
    fn state<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        Unimplemented.state(requester, session_id)
    }
    fn history<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<Vec<MessageResponse>, ApiError>> {
        Unimplemented.history(requester, session_id)
    }
    fn analysis<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<SessionAnalysisResponse, ApiError>> {
        Unimplemented.analysis(requester, session_id)
    }
    fn report<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        Box::pin(async { Ok(mind_report()) })
    }
}

pub struct Reply {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub text: String,
    /// 본문이 JSON 이 아니면(빈 본문, SSE) `Null`.
    pub body: Value,
}

/// 계정 서비스와 모델은 `Unimplemented`, 인증은 `TokenAuthenticator`, 대화 서비스와 계측 저장은 고른 것.
pub struct Harness {
    app: Router,
}

impl Harness {
    /// 계측 저장은 `Unimplemented`.
    pub fn new(support: impl SupportService + Send + Sync + 'static) -> Harness {
        Harness::build(
            Arc::new(support),
            Arc::new(beside_pet_server::metrics::Unimplemented),
        )
    }

    /// 대화 서비스는 `Unimplemented`, 계측 저장은 고른 것.
    pub fn with_metrics(metrics: SharedMetricsSource) -> Harness {
        Harness::build(Arc::new(Unimplemented), metrics)
    }

    fn build(support: SharedSupportService, metrics: SharedMetricsSource) -> Harness {
        let authenticator: SharedAuthenticator = Arc::new(TokenAuthenticator);
        Harness::with_services(Services {
            authenticator,
            support,
            metrics,
            ..Services::unimplemented()
        })
    }

    /// 고른 구현을 그대로 끼운다(실제 DB 를 쓰는 구현도 된다). 설정은 sandbox 이고 앱 상태의 풀은 붙지 않는다.
    pub fn with_services(services: Services) -> Harness {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://u:p@127.0.0.1:1/none".to_owned()),
            "APP_ENV" => Some("sandbox".to_owned()),
            _ => None,
        })
        .unwrap();
        let state = AppState::lazy(Arc::new(config), services).unwrap();
        Harness { app: router(state) }
    }

    /// `token` 은 인증 쿠키의 값이다.
    pub async fn send(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Reply {
        let mut request = Request::builder().method(method).uri(path);
        if let Some(token) = token {
            request = request.header("cookie", format!("beside-pet.token={token}"));
        }
        let request = match body {
            Some(body) => request
                .header("content-type", "application/json")
                .body(Body::from(body.to_string())),
            None => request.body(Body::empty()),
        }
        .unwrap();
        let response = self.app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let text = String::from_utf8(bytes.to_vec()).unwrap();
        let body = serde_json::from_str(&text).unwrap_or(Value::Null);
        Reply {
            status,
            headers,
            text,
            body,
        }
    }
}

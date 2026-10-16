//! 통합 테스트의 더블과 요청 도우미. 기능 안의 더블은 `#[cfg(test)]` 라 여기서 따로 둔다.

use std::sync::Arc;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use futures_util::stream;
use serde_json::Value;
use tower::ServiceExt;

use beside_pet_server::app::{AppState, Services, router};
use beside_pet_server::identity::{
    AuthenticatedAccount, Authenticator, BoxFuture, Role, SharedAuthenticator,
};
use beside_pet_server::shared::{ApiError, Config};
use beside_pet_server::support::{
    MessageResponse, MindReportResponse, Requester, SessionAnalysisResponse,
    SessionListItemResponse, SessionStateResponse, SharedSupportService, StartSessionRequest,
    StreamEvent, SupportService, TurnResponse, TurnStream,
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

/// 스트림 턴은 `meta`, `token`, `done` 셋을 흘리고, 나머지는 `Unimplemented` 에 넘긴다.
pub struct ThreeEvents;

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

impl SupportService for ThreeEvents {
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
        text: String,
    ) -> futures_util::future::BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Unimplemented.send(requester, session_id, text)
    }
    fn send_stream(&self, _: Requester, _: String, _: String) -> TurnStream {
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
        requester: &'a Requester,
    ) -> futures_util::future::BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>> {
        Unimplemented.list(requester)
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
        requester: &'a Requester,
        session_id: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        Unimplemented.report(requester, session_id)
    }
}

pub struct Reply {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub text: String,
    /// 본문이 JSON 이 아니면(빈 본문, SSE) `Null`.
    pub body: Value,
}

/// 계정 서비스와 모델은 `Unimplemented`, 인증은 `TokenAuthenticator`, 대화 서비스는 고른 것.
pub struct Harness {
    app: Router,
}

impl Harness {
    pub fn new(support: impl SupportService + Send + Sync + 'static) -> Harness {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://u:p@127.0.0.1:1/none".to_owned()),
            _ => None,
        })
        .unwrap();
        let authenticator: SharedAuthenticator = Arc::new(TokenAuthenticator);
        let support: SharedSupportService = Arc::new(support);
        let services = Services {
            authenticator,
            support,
            ..Services::unimplemented()
        };
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

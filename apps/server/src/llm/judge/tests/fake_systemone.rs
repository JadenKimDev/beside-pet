//! 가짜 systemone 서버: 받은 요청을 적어 두고, 정해 둔 만큼 기다린 뒤 정해 둔 상태 코드와 본문을 돌려준다.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::response::Response;
use serde_json::Value;

/// 받은 요청 한 건.
#[derive(Debug, Clone)]
pub(super) struct Recorded {
    pub method: String,
    pub path: String,
    pub body: Value,
}

#[derive(Clone)]
struct Script {
    status: StatusCode,
    body: String,
    delay: Duration,
    recorded: Arc<Mutex<Vec<Recorded>>>,
}

pub(super) struct FakeSystemOne {
    pub base_url: String,
    recorded: Arc<Mutex<Vec<Recorded>>>,
}

impl FakeSystemOne {
    /// 곧바로 `200` 과 `body` 를 준다.
    pub async fn ok(body: &str) -> FakeSystemOne {
        FakeSystemOne::start(StatusCode::OK, body, Duration::ZERO).await
    }

    pub async fn start(status: StatusCode, body: &str, delay: Duration) -> FakeSystemOne {
        let recorded = Arc::new(Mutex::new(Vec::new()));
        let script = Script {
            status,
            body: body.to_owned(),
            delay,
            recorded: Arc::clone(&recorded),
        };
        let app = Router::new().fallback(handle).with_state(script);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        FakeSystemOne {
            base_url: format!("http://{addr}"),
            recorded,
        }
    }

    /// 받은 요청이 꼭 한 건이어야 한다.
    pub fn only_request(&self) -> Recorded {
        let requests = self.recorded.lock().unwrap().clone();
        assert_eq!(requests.len(), 1, "요청이 한 건이어야 한다");
        requests.into_iter().next().unwrap()
    }
}

async fn handle(State(script): State<Script>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let bytes = to_bytes(body, 1 << 20).await.unwrap();
    script.recorded.lock().unwrap().push(Recorded {
        method: parts.method.to_string(),
        path: parts.uri.path().to_owned(),
        body: serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    });
    tokio::time::sleep(script.delay).await;
    Response::builder()
        .status(script.status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(script.body))
        .unwrap()
}

/// 아무것도 듣지 않는 루프백 주소(연결 실패를 보려고).
pub(super) async fn closed_base_url() -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    format!("http://127.0.0.1:{port}")
}

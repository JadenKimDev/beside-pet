//! 테스트 안에서 띄우는 가짜 HTTP 서버: 받은 요청을 적어 두고 정해 둔 상태 코드와 본문(조각 여럿)을 돌려준다.

use std::convert::Infallible;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::Response;
use futures_util::stream;
use serde_json::Value;

/// 받은 요청 한 건.
#[derive(Debug, Clone)]
pub(super) struct Recorded {
    pub method: String,
    pub path: String,
    pub headers: HeaderMap,
    pub body: Value,
}

#[derive(Clone)]
struct Reply {
    status: StatusCode,
    content_type: &'static str,
    chunks: Vec<String>,
    recorded: Arc<Mutex<Vec<Recorded>>>,
}

pub(super) struct FakeServer {
    pub base_url: String,
    recorded: Arc<Mutex<Vec<Recorded>>>,
}

impl FakeServer {
    /// 모든 경로에 같은 응답을 준다. `chunks` 는 차례로 따로 흘려 보낸다.
    pub async fn start(
        status: StatusCode,
        content_type: &'static str,
        chunks: &[&str],
    ) -> FakeServer {
        let recorded = Arc::new(Mutex::new(Vec::new()));
        let reply = Reply {
            status,
            content_type,
            chunks: chunks.iter().map(|c| (*c).to_owned()).collect(),
            recorded: Arc::clone(&recorded),
        };
        let app = Router::new().fallback(handle).with_state(reply);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        FakeServer {
            base_url: format!("http://{addr}"),
            recorded,
        }
    }

    pub fn requests(&self) -> Vec<Recorded> {
        self.recorded.lock().unwrap().clone()
    }

    /// 받은 요청이 꼭 한 건이어야 한다.
    pub fn only_request(&self) -> Recorded {
        let requests = self.requests();
        assert_eq!(requests.len(), 1, "요청이 한 건이어야 한다");
        requests.into_iter().next().unwrap()
    }
}

async fn handle(State(reply): State<Reply>, request: Request) -> Response {
    let (parts, body) = request.into_parts();
    let bytes = to_bytes(body, 1 << 20).await.unwrap();
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    reply.recorded.lock().unwrap().push(Recorded {
        method: parts.method.to_string(),
        path: parts.uri.path().to_owned(),
        headers: parts.headers,
        body,
    });
    let chunks = reply.chunks.into_iter().map(Ok::<_, Infallible>);
    Response::builder()
        .status(reply.status)
        .header(header::CONTENT_TYPE, reply.content_type)
        .body(Body::from_stream(stream::iter(chunks)))
        .unwrap()
}

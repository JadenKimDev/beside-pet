//! 받은 JSON 본문을 적어 두고 정해 둔 JSON 하나를 돌려주는 가짜 모델 서버(127.0.0.1 임의 포트).

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::header;
use axum::response::IntoResponse;
use serde_json::Value;

#[derive(Clone)]
struct Shared {
    answer: &'static str,
    bodies: Arc<Mutex<Vec<Value>>>,
}

pub(super) struct ModelServer {
    pub base_url: String,
    bodies: Arc<Mutex<Vec<Value>>>,
}

impl ModelServer {
    pub async fn answering(answer: &'static str) -> ModelServer {
        let bodies = Arc::new(Mutex::new(Vec::new()));
        let shared = Shared {
            answer,
            bodies: Arc::clone(&bodies),
        };
        let app = Router::new().fallback(record).with_state(shared);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        ModelServer {
            base_url: format!("http://{addr}"),
            bodies,
        }
    }

    /// 받은 본문이 꼭 하나여야 한다.
    pub fn only_body(&self) -> Value {
        let bodies = self.bodies.lock().unwrap();
        assert_eq!(bodies.len(), 1, "요청이 한 건이어야 한다");
        bodies[0].clone()
    }
}

async fn record(State(shared): State<Shared>, body: Bytes) -> impl IntoResponse {
    let parsed = serde_json::from_slice(&body).unwrap_or(Value::Null);
    shared.bodies.lock().unwrap().push(parsed);
    ([(header::CONTENT_TYPE, "application/json")], shared.answer)
}

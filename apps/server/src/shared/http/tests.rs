use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use axum::routing::{get, post};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{JsonBody, cors_layer};

async fn echo(JsonBody(body): JsonBody) -> axum::Json<Value> {
    axum::Json(body)
}

async fn send(content_type: Option<&str>, body: &'static str) -> (StatusCode, Value) {
    let app = Router::new().route("/echo", post(echo));
    let mut request = Request::post("/echo");
    if let Some(content_type) = content_type {
        request = request.header("content-type", content_type);
    }
    let response = app
        .oneshot(request.body(Body::from(body)).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn json_본문을_값으로_읽는다() {
    let (status, body) = send(Some("application/json"), r#"{"b":1,"a":2}"#).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "b": 1, "a": 2 }));
    // 칸의 순서를 지킨다(모르는 칸의 오류 순서가 여기에 기댄다).
    assert_eq!(serde_json::to_string(&body).unwrap(), r#"{"b":1,"a":2}"#);
}

#[tokio::test]
async fn 빈_본문과_json_이_아닌_본문은_빈_객체다() {
    assert_eq!(
        send(Some("application/json"), "").await,
        (StatusCode::OK, json!({}))
    );
    assert_eq!(send(None, r#"{"a":1}"#).await, (StatusCode::OK, json!({})));
    assert_eq!(
        send(Some("text/plain"), "hello").await,
        (StatusCode::OK, json!({}))
    );
}

#[tokio::test]
async fn 깨진_json_은_nest_모양의_400_이다() {
    let (status, body) = send(Some("application/json; charset=utf-8"), "{oops").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["statusCode"], 400);
    assert_eq!(body["error"], "Bad Request");
    assert!(body["message"].is_string());
    assert!(
        !body["message"].as_str().unwrap().contains("oops"),
        "본문을 오류에 싣지 않는다"
    );
}

const ALLOW_ORIGIN: &str = "access-control-allow-origin";
const ALLOW_CREDENTIALS: &str = "access-control-allow-credentials";

/// `allowed` 로 만든 CORS 층을 낀 라우터에 `origin` 의 GET 과 preflight 를 보내고 두 응답의 헤더를 돌려준다.
async fn cors_headers(
    allowed: Option<&[String]>,
    origin: &str,
) -> [axum::http::HeaderMap; 2] {
    let app = Router::new()
        .route("/ping", get(|| async { "pong" }))
        .layer(cors_layer(allowed));
    let simple = Request::get("/ping")
        .header("origin", origin)
        .body(Body::empty())
        .unwrap();
    let preflight = Request::options("/ping")
        .header("origin", origin)
        .header("access-control-request-method", "POST")
        .header("access-control-request-headers", "content-type")
        .body(Body::empty())
        .unwrap();
    let mut out = Vec::new();
    for request in [simple, preflight] {
        let response = app.clone().oneshot(request).await.unwrap();
        out.push(response.headers().clone());
    }
    out.try_into().unwrap()
}

fn allow_list() -> Vec<String> {
    vec![
        "https://app.example".to_owned(),
        "http://localhost:3001".to_owned(),
    ]
}

#[tokio::test]
async fn 목록_안_출처는_그_출처를_그대로_돌려주고_자격증명을_허용한다() {
    let list = allow_list();
    for origin in ["https://app.example", "http://localhost:3001"] {
        for headers in cors_headers(Some(&list), origin).await {
            assert_eq!(headers[ALLOW_ORIGIN], origin);
            assert_eq!(headers[ALLOW_CREDENTIALS], "true");
        }
    }
}

#[tokio::test]
async fn 목록_밖_출처에는_allow_origin_을_내지_않는다() {
    let list = allow_list();
    for origin in [
        "https://evil.example",
        "https://app.example.evil.example",
        "http://app.example",
        "null",
    ] {
        for headers in cors_headers(Some(&list), origin).await {
            assert!(headers.get(ALLOW_ORIGIN).is_none(), "{origin}: {headers:?}");
        }
    }
}

#[tokio::test]
async fn 목록이_없으면_요청의_출처를_그대로_돌려준다() {
    for headers in cors_headers(None, "https://anything.example").await {
        assert_eq!(headers[ALLOW_ORIGIN], "https://anything.example");
        assert_eq!(headers[ALLOW_CREDENTIALS], "true");
    }
}

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use axum::routing::post;
use serde_json::{Value, json};
use tower::ServiceExt;

use super::JsonBody;

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

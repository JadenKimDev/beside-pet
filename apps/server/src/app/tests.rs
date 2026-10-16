use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

use super::{AppState, Services, router};
use crate::shared::Config;

fn state() -> AppState {
    let config = Config::from_lookup(|name| match name {
        "DATABASE_URL" => Some("postgres://u:p@127.0.0.1:1/none".to_owned()),
        _ => None,
    })
    .unwrap();
    AppState::lazy(Arc::new(config), Services::unimplemented()).unwrap()
}

async fn call(request: Request<Body>) -> (StatusCode, axum::http::HeaderMap, Value) {
    let response = router(state()).oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, headers, body)
}

#[tokio::test]
async fn health_는_200_ok_다() {
    let (status, _, body) = call(Request::get("/v1/health").body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!({ "status": "ok" }));
}

#[tokio::test]
async fn 없는_경로는_nest_모양의_404_다() {
    let (status, _, body) = call(Request::get("/v1/nope").body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        body,
        json!({ "statusCode": 404, "message": "Cannot GET /v1/nope", "error": "Not Found" })
    );

    let (status, _, body) =
        call(Request::post("/v1/health?x=1").body(Body::empty()).unwrap()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["message"], "Cannot POST /v1/health?x=1");
}

#[tokio::test]
async fn cors_는_origin_을_돌려주고_쿠키를_허용한다() {
    let request = Request::get("/v1/health")
        .header("origin", "http://127.0.0.1:3001")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = call(request).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        headers["access-control-allow-origin"],
        "http://127.0.0.1:3001"
    );
    assert_eq!(headers["access-control-allow-credentials"], "true");
}

#[tokio::test]
async fn cors_사전_요청을_받는다() {
    let request = Request::options("/v1/auth/login")
        .header("origin", "http://127.0.0.1:3001")
        .header("access-control-request-method", "POST")
        .header("access-control-request-headers", "content-type")
        .body(Body::empty())
        .unwrap();
    let (status, headers, _) = call(request).await;
    assert!(status.is_success(), "{status}");
    assert_eq!(
        headers["access-control-allow-origin"],
        "http://127.0.0.1:3001"
    );
    assert_eq!(headers["access-control-allow-credentials"], "true");
    let methods = headers["access-control-allow-methods"].to_str().unwrap();
    assert!(methods.contains("POST"), "{methods}");
    let allowed = headers["access-control-allow-headers"]
        .to_str()
        .unwrap()
        .to_ascii_lowercase();
    assert!(allowed.contains("content-type"), "{allowed}");
}

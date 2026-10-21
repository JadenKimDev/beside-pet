// 라우트의 겉: 상태 코드, 인증, 검증 문구, 501, SSE. 서비스와 인증은 더블이다(DB 를 쓰지 않는다).

mod double;
mod turns;

use std::sync::Arc;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;

use self::double::{Echo, app};
use crate::support::Unimplemented;

// ---- 요청 ----

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    text: String,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_str(&self.text).unwrap_or_else(|_| panic!("{:?}", self.text))
    }
}

async fn call(
    app: Router,
    method: Method,
    path: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Reply {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(token) = token {
        request = request.header("cookie", format!("other=1; beside-pet.token={token}"));
    }
    let request = match body {
        Some(body) => request
            .header("content-type", "application/json")
            .body(Body::from(body.to_string())),
        None => request.body(Body::empty()),
    }
    .unwrap();
    let response = app.oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    Reply {
        status,
        headers,
        text: String::from_utf8(bytes.to_vec()).unwrap(),
    }
}

fn start_body() -> Value {
    json!({ "sessionId": "s-1", "griefProfile": { "griefPath": "afterLoss" } })
}

fn send_body() -> Value {
    json!({ "text": "hello" })
}

/// 14 라우트와 올바른 본문.
fn routes() -> Vec<(Method, &'static str, Option<Value>)> {
    vec![
        (Method::POST, "/v1/sessions", Some(start_body())),
        (Method::POST, "/v1/sessions/stream", Some(start_body())),
        (Method::POST, "/v1/sessions/s-1/messages", Some(send_body())),
        (
            Method::POST,
            "/v1/sessions/s-1/messages/stream",
            Some(send_body()),
        ),
        (Method::POST, "/v1/sessions/s-1/close", None),
        (Method::DELETE, "/v1/sessions/s-1", None),
        (Method::GET, "/v1/sessions", None),
        (Method::GET, "/v1/sessions/s-1", None),
        (Method::GET, "/v1/sessions/s-1/messages", None),
        (Method::GET, "/v1/sessions/s-1/analysis", None),
        (Method::GET, "/v1/sessions/s-1/report", None),
        (Method::GET, "/v1/sessions/s-1/turns/t-1/stream", None),
        (Method::POST, "/v1/sessions/s-1/turns/t-1/cancel", None),
        (Method::POST, "/v1/sessions/s-1/turns/t-1/retry", None),
    ]
}

// ---- 테스트 ----

#[tokio::test]
async fn 쿠키가_없으면_모두_401_이다() {
    assert_eq!(routes().len(), 14);
    for (method, path, body) in routes() {
        let reply = call(app(Arc::new(Echo)), method.clone(), path, None, body).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{method} {path}");
        assert_eq!(
            reply.json(),
            json!({ "statusCode": 401, "message": "Not authenticated", "error": "Unauthorized" }),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn 틀린_토큰은_401_이다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::GET,
        "/v1/sessions",
        Some("nope"),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.json()["message"], "Invalid or expired token");
}

#[tokio::test]
async fn 인증이_검증보다_먼저다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions",
        None,
        Some(json!({})),
    )
    .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn 빈_구현이면_올바른_요청은_모두_501_이다() {
    for (method, path, body) in routes() {
        let reply = call(
            app(Arc::new(Unimplemented)),
            method.clone(),
            path,
            Some("viewer"),
            body,
        )
        .await;
        assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED, "{method} {path}");
        assert_eq!(
            reply.json(),
            json!({ "statusCode": 501, "message": "Not implemented", "error": "Not Implemented" }),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn 시작은_201_이고_요청자와_본문을_넘긴다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions",
        Some("viewer"),
        Some(start_body()),
    )
    .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    assert_eq!(
        reply.json(),
        json!({ "reply": "start acct-viewer/false s-1 true", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false })
    );
}

#[tokio::test]
async fn 메시지는_200_이고_관리자_여부를_넘긴다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions/s-9/messages",
        Some("admin"),
        Some(send_body()),
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.json()["reply"], "send acct-admin/true s-9 hello");
}

#[tokio::test]
async fn 닫기와_조회는_200_이다() {
    let cases = [
        (
            Method::POST,
            "/v1/sessions/s-1/close",
            json!("close acct-viewer/false s-1"),
            "/sessionId",
        ),
        (
            Method::GET,
            "/v1/sessions/s-1",
            json!("state acct-viewer/false s-1"),
            "/sessionId",
        ),
        (
            Method::GET,
            "/v1/sessions",
            json!("list acct-viewer/false"),
            "/0/sessionId",
        ),
        (
            Method::GET,
            "/v1/sessions/s-1/messages",
            json!("history acct-viewer/false s-1"),
            "/0/text",
        ),
        (
            Method::GET,
            "/v1/sessions/s-1/analysis",
            json!("analysis acct-viewer/false s-1"),
            "/sessionId",
        ),
        (
            Method::GET,
            "/v1/sessions/s-1/report",
            json!("report acct-viewer/false s-1"),
            "/petName",
        ),
    ];
    for (method, path, expected, pointer) in cases {
        let reply = call(
            app(Arc::new(Echo)),
            method.clone(),
            path,
            Some("viewer"),
            None,
        )
        .await;
        assert_eq!(reply.status, StatusCode::OK, "{method} {path}");
        assert_eq!(
            reply.json().pointer(pointer),
            Some(&expected),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn 삭제는_204_이고_본문이_없다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::DELETE,
        "/v1/sessions/s-1",
        Some("viewer"),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(reply.text, "");

    let reply = call(
        app(Arc::new(Echo)),
        Method::DELETE,
        "/v1/sessions/missing",
        Some("viewer"),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(reply.json()["message"], "Session not found");
}

#[tokio::test]
async fn 검증_문구는_400_배열이다() {
    let cases = [
        (
            "/v1/sessions",
            json!({}),
            json!([
                "sessionId should not be empty",
                "sessionId must be a string"
            ]),
        ),
        (
            "/v1/sessions/stream",
            json!({ "sessionId": "a", "griefProfile": {} }),
            json!([
                "griefProfile.griefPath must be one of the following values: afterLoss, beforeLoss"
            ]),
        ),
        (
            "/v1/sessions/s-1/messages",
            json!({ "text": "" }),
            json!(["text should not be empty"]),
        ),
        (
            "/v1/sessions/s-1/messages/stream",
            json!({ "text": "x".repeat(4001) }),
            json!(["text must be shorter than or equal to 4000 characters"]),
        ),
    ];
    for (path, body, messages) in cases {
        let reply = call(
            app(Arc::new(Echo)),
            Method::POST,
            path,
            Some("viewer"),
            Some(body),
        )
        .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{path}");
        assert_eq!(
            reply.json(),
            json!({ "statusCode": 400, "message": messages, "error": "Bad Request" }),
            "{path}"
        );
    }
}

fn assert_sse(reply: &Reply, expected_reply: &str) {
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.headers["content-type"],
        "text/event-stream; charset=utf-8"
    );
    assert_eq!(reply.headers["cache-control"], "no-cache, no-transform");
    assert_eq!(reply.headers["connection"], "keep-alive");
    assert_eq!(reply.headers["x-accel-buffering"], "no");
    let done = json!({ "reply": expected_reply, "task": 1, "progress": 0.0, "supportLevel": 1, "done": false });
    assert!(reply.text.ends_with("\n\n"), "{:?}", reply.text);
    let frames: Vec<Value> = reply
        .text
        .split_terminator("\n\n")
        .map(|frame| serde_json::from_str(frame.strip_prefix("data: ").unwrap()).unwrap())
        .collect();
    let expected = vec![
        json!({ "kind": "meta", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false }),
        json!({ "kind": "token", "text": expected_reply }),
        json!({ "kind": "done", "result": done }),
    ];
    assert_eq!(frames, expected);
}

#[tokio::test]
async fn 시작_스트림은_sse_프레임_셋이다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions/stream",
        Some("viewer"),
        Some(start_body()),
    )
    .await;
    assert_sse(&reply, "start acct-viewer/false s-1");
}

#[tokio::test]
async fn 메시지_스트림은_sse_프레임_셋이다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions/s-2/messages/stream",
        Some("viewer"),
        Some(send_body()),
    )
    .await;
    assert_sse(&reply, "send acct-viewer/false s-2 hello");
}

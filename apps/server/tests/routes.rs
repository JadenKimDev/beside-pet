//! 조립한 라우터(`app::router`)의 통합 테스트: 28개 경로의 존재, 없는 경로의 404, 검증 문구, 401·403·501, SSE.
//! 기능의 trait 는 테스트 더블을 끼우므로 기능 PRD 가 구현을 채워도 그대로 통과한다.

#[path = "routes/harness.rs"]
mod harness;

#[path = "routes/guards.rs"]
mod guards;

#[path = "routes/sse.rs"]
mod sse;

use axum::http::{Method, StatusCode};
use serde_json::{Value, json};

use beside_pet_server::safety::safety_resources;
use harness::{Harness, Unimplemented};

/// 28개 경로: (메서드, 경로, 올바른 본문, 더블과 `Unimplemented` 서비스로 admin 이 부를 때의 상태).
fn routes() -> Vec<(Method, &'static str, Option<Value>, StatusCode)> {
    let ni = StatusCode::NOT_IMPLEMENTED;
    let account = json!({ "username": "maple", "password": "password1", "company": "Acme Pets" });
    let start = json!({ "sessionId": "s-1" });
    let text = json!({ "text": "hello" });
    vec![
        (Method::GET, "/v1/health", None, StatusCode::OK),
        (Method::GET, "/v1/safety/resources", None, StatusCode::OK),
        (Method::POST, "/v1/auth/register", Some(account.clone()), ni),
        (Method::GET, "/v1/auth/setup", None, ni),
        (
            Method::POST,
            "/v1/auth/setup",
            Some(json!({ "token": "t", "username": "maple", "password": "password1" })),
            ni,
        ),
        (
            Method::POST,
            "/v1/auth/login",
            Some(json!({ "username": "maple", "password": "pw" })),
            ni,
        ),
        (
            Method::POST,
            "/v1/auth/logout",
            None,
            StatusCode::NO_CONTENT,
        ),
        (Method::GET, "/v1/auth/me", None, ni),
        (
            Method::PATCH,
            "/v1/auth/me/chat-language",
            Some(json!({ "chatLanguage": "en" })),
            ni,
        ),
        (Method::POST, "/v1/admin/accounts", Some(account), ni),
        (Method::GET, "/v1/admin/accounts", None, ni),
        (Method::POST, "/v1/admin/accounts/a-1/approve", None, ni),
        (Method::POST, "/v1/admin/accounts/a-1/revoke", None, ni),
        (Method::POST, "/v1/admin/accounts/a-1/soft-delete", None, ni),
        (Method::POST, "/v1/admin/accounts/a-1/reactivate", None, ni),
        (
            Method::PATCH,
            "/v1/admin/accounts/a-1/expiry",
            Some(json!({ "expiresAt": "2027-01-02T03:04:05Z" })),
            ni,
        ),
        (Method::DELETE, "/v1/admin/accounts/a-1", None, ni),
        (Method::POST, "/v1/sessions", Some(start.clone()), ni),
        (Method::GET, "/v1/sessions", None, ni),
        (Method::POST, "/v1/sessions/stream", Some(start), ni),
        (Method::GET, "/v1/sessions/s-1", None, ni),
        (Method::DELETE, "/v1/sessions/s-1", None, ni),
        (
            Method::POST,
            "/v1/sessions/s-1/messages",
            Some(text.clone()),
            ni,
        ),
        (Method::GET, "/v1/sessions/s-1/messages", None, ni),
        (
            Method::POST,
            "/v1/sessions/s-1/messages/stream",
            Some(text),
            ni,
        ),
        (Method::POST, "/v1/sessions/s-1/close", None, ni),
        (Method::GET, "/v1/sessions/s-1/analysis", None, ni),
        (Method::GET, "/v1/sessions/s-1/report", None, ni),
    ]
}

#[tokio::test]
async fn 경로_28개가_모두_있다() {
    let routes = routes();
    assert_eq!(routes.len(), 28);
    let h = Harness::new(Unimplemented);
    for (method, path, body, expected) in routes {
        let reply = h.send(method.clone(), path, Some("admin"), body).await;
        let message = reply.body["message"].as_str().unwrap_or_default();
        assert!(
            !message.starts_with("Cannot "),
            "{method} {path} 가 없다: {}",
            reply.body
        );
        assert_eq!(reply.status, expected, "{method} {path}: {}", reply.body);
    }
}

#[tokio::test]
async fn 없는_경로는_nest_모양의_404_다() {
    let h = Harness::new(Unimplemented);
    let reply = h.send(Method::GET, "/v1/nope", None, None).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 404, "message": "Cannot GET /v1/nope", "error": "Not Found" })
    );
}

#[tokio::test]
async fn health_와_safety_는_인증_없이_200_과_데이터다() {
    let h = Harness::new(Unimplemented);
    let reply = h.send(Method::GET, "/v1/health", None, None).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, json!({ "status": "ok" }));

    let reply = h
        .send(Method::GET, "/v1/safety/resources", None, None)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.body,
        serde_json::to_value(safety_resources()).unwrap()
    );
    assert!(!reply.body.as_array().unwrap().is_empty());
}

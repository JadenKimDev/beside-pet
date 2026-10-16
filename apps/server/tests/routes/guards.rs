//! 조립한 라우터의 관문: 요청 검증(400), 인증(401), 역할(403), 아직 없는 기능(501).

use axum::http::{Method, StatusCode};
use serde_json::json;

use crate::harness::{Harness, Unimplemented};

#[tokio::test]
async fn 검증은_400_과_문구_배열이다() {
    let h = Harness::new(Unimplemented);
    let cases = [
        (
            "/v1/auth/login",
            None,
            json!({}),
            json!([
                "username should not be empty",
                "username must be a string",
                "password should not be empty",
                "password must be a string"
            ]),
        ),
        (
            "/v1/sessions",
            Some("viewer"),
            json!({}),
            json!([
                "sessionId should not be empty",
                "sessionId must be a string"
            ]),
        ),
        (
            "/v1/sessions/s-1/messages",
            Some("viewer"),
            json!({ "text": "x".repeat(4001) }),
            json!(["text must be shorter than or equal to 4000 characters"]),
        ),
    ];
    for (path, token, body, messages) in cases {
        let reply = h.send(Method::POST, path, token, Some(body)).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{path}");
        assert_eq!(
            reply.body,
            json!({ "statusCode": 400, "message": messages, "error": "Bad Request" }),
            "{path}"
        );
    }
}

#[tokio::test]
async fn 쿠키가_없으면_401_not_authenticated() {
    let h = Harness::new(Unimplemented);
    for (method, path) in [
        (Method::GET, "/v1/sessions"),
        (Method::GET, "/v1/auth/me"),
        (Method::GET, "/v1/admin/accounts"),
    ] {
        let reply = h.send(method, path, None, None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{path}");
        assert_eq!(
            reply.body,
            json!({ "statusCode": 401, "message": "Not authenticated", "error": "Unauthorized" }),
            "{path}"
        );
    }
}

#[tokio::test]
async fn 확인되지_않는_토큰은_401_invalid_or_expired_token() {
    let h = Harness::new(Unimplemented);
    let reply = h
        .send(Method::GET, "/v1/sessions", Some("stale"), None)
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 401, "message": "Invalid or expired token", "error": "Unauthorized" })
    );
}

#[tokio::test]
async fn viewer_는_admin_경로에서_403_이다() {
    let h = Harness::new(Unimplemented);
    let reply = h
        .send(Method::GET, "/v1/admin/accounts", Some("viewer"), None)
        .await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 403, "message": "Insufficient role", "error": "Forbidden" })
    );
}

#[tokio::test]
async fn 올바른_요청은_501_not_implemented() {
    let h = Harness::new(Unimplemented);
    let cases = [
        (
            Method::POST,
            "/v1/auth/login",
            None,
            Some(json!({ "username": "maple", "password": "pw" })),
        ),
        (Method::GET, "/v1/auth/me", Some("viewer"), None),
        (
            Method::POST,
            "/v1/sessions",
            Some("viewer"),
            Some(json!({ "sessionId": "s-1" })),
        ),
        (
            Method::POST,
            "/v1/sessions/s-1/messages/stream",
            Some("viewer"),
            Some(json!({ "text": "hello" })),
        ),
        (Method::GET, "/v1/sessions/s-1/report", Some("viewer"), None),
    ];
    for (method, path, token, body) in cases {
        let reply = h.send(method, path, token, body).await;
        assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED, "{path}");
        assert_eq!(
            reply.body,
            json!({ "statusCode": 501, "message": "Not implemented", "error": "Not Implemented" }),
            "{path}"
        );
    }
}

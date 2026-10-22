//! 보관함과 리포트 삭제의 경로(ADR-0036): 고정 경로 `/v1/sessions/deleted` 가 `/v1/sessions/{id}` 보다 먼저 맞고,
//! 새 경로 넷이 모두 인증을 거치며, 목록 항목이 `reportDeleted` 를 싣는다.

use axum::http::{Method, StatusCode};
use serde_json::json;

use crate::harness::{Harness, Scripted};

#[tokio::test]
async fn 보관함_고정_경로는_세션_조회가_아니라_보관함_배열이다() {
    // Scripted 의 세션 조회는 501 이고 보관함만 값을 낸다. 세션 조회로 갔다면 501 이다.
    let h = Harness::new(Scripted);
    let reply = h
        .send(Method::GET, "/v1/sessions/deleted", Some("viewer"), None)
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        reply.body,
        json!([{
            "sessionId": "s-gone",
            "startedAt": "2026-10-16T09:00:00.000Z",
            "deletedAt": "2026-10-20T08:30:00.125Z",
            "purgeAt": "2027-01-20T08:30:00.125Z",
            "preferredLanguage": "en"
        }])
    );

    let state = h
        .send(Method::GET, "/v1/sessions/s-gone", Some("viewer"), None)
        .await;
    assert_eq!(state.status, StatusCode::NOT_IMPLEMENTED, "{}", state.body);
}

#[tokio::test]
async fn 보관함과_되살리기와_리포트_삭제는_쿠키가_없으면_401_이다() {
    let h = Harness::new(Scripted);
    for (method, path) in [
        (Method::GET, "/v1/sessions/deleted"),
        (Method::POST, "/v1/sessions/s-1/restore"),
        (Method::DELETE, "/v1/sessions/s-1/report"),
        (Method::POST, "/v1/sessions/s-1/report/restore"),
        (Method::DELETE, "/v1/sessions/s-1"),
    ] {
        let reply = h.send(method.clone(), path, None, None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{method} {path}");
        assert_eq!(
            reply.body,
            json!({ "statusCode": 401, "message": "Not authenticated", "error": "Unauthorized" }),
            "{method} {path}"
        );
    }
}

#[tokio::test]
async fn 목록_항목은_report_deleted_를_싣는다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(Method::GET, "/v1/sessions", Some("viewer"), None)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    for item in reply.body.as_array().unwrap() {
        assert_eq!(item["reportDeleted"], json!(false), "{item}");
    }
}

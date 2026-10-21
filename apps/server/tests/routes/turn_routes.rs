//! 조립한 라우터의 턴 경로 셋(ADR-0030): 인증, 다시 붙기와 답 다시 받기의 SSE(`cancelled` 이벤트 포함), 중단의 200 JSON.

use axum::http::{Method, StatusCode};
use serde_json::json;

use crate::harness::{Harness, Scripted, cut_events, three_events};

const PATHS: [(Method, &str); 3] = [
    (Method::GET, "/v1/sessions/s-1/turns/t-9/stream"),
    (Method::POST, "/v1/sessions/s-1/turns/t-9/cancel"),
    (Method::POST, "/v1/sessions/s-1/turns/t-9/retry"),
];

fn sse_text(events: &[beside_pet_server::support::StreamEvent]) -> String {
    events
        .iter()
        .map(|event| format!("data: {}\n\n", serde_json::to_string(event).unwrap()))
        .collect()
}

#[tokio::test]
async fn 턴_경로_셋은_쿠키가_없으면_401_이다() {
    let h = Harness::new(Scripted);
    for (method, path) in PATHS {
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
async fn 다시_붙기는_send_stream_과_같은_sse_다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(
            Method::GET,
            "/v1/sessions/s-1/turns/t-9/stream",
            Some("viewer"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(
        reply.headers["content-type"],
        "text/event-stream; charset=utf-8"
    );
    assert_eq!(reply.headers["x-accel-buffering"], "no");
    assert_eq!(reply.text, sse_text(&three_events()));
}

#[tokio::test]
async fn 답_다시_받기의_중단은_cancelled_프레임으로_끝난다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(
            Method::POST,
            "/v1/sessions/s-1/turns/t-9/retry",
            Some("viewer"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(
        reply.headers["content-type"],
        "text/event-stream; charset=utf-8"
    );
    assert_eq!(reply.text, sse_text(&cut_events()));
    assert!(
        reply.text.ends_with("data: {\"kind\":\"cancelled\"}\n\n"),
        "{}",
        reply.text
    );
}

#[tokio::test]
async fn 중단은_200_과_턴_id_와_cancelled_다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(
            Method::POST,
            "/v1/sessions/s-1/turns/t-9/cancel",
            Some("viewer"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(
        reply.body,
        json!({ "turnId": "t-9", "status": "cancelled" })
    );
}

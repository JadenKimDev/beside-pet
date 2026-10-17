//! 조립한 라우터의 SSE 두 경로: 더블의 이벤트 셋이 정해진 헤더와 `data: <JSON>\n\n` 프레임으로 흐른다.

use axum::http::{Method, StatusCode};
use serde_json::json;

use crate::harness::{Harness, Scripted, three_events};

#[tokio::test]
async fn sse_두_경로는_헤더_넷과_프레임_셋이다() {
    let h = Harness::new(Scripted);
    let expected: String = three_events()
        .iter()
        .map(|event| format!("data: {}\n\n", serde_json::to_string(event).unwrap()))
        .collect();
    for (path, body) in [
        ("/v1/sessions/stream", json!({ "sessionId": "s-1" })),
        (
            "/v1/sessions/s-1/messages/stream",
            json!({ "text": "hello" }),
        ),
    ] {
        let reply = h.send(Method::POST, path, Some("viewer"), Some(body)).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}: {}", reply.text);
        for (name, value) in [
            ("content-type", "text/event-stream; charset=utf-8"),
            ("cache-control", "no-cache, no-transform"),
            ("connection", "keep-alive"),
            ("x-accel-buffering", "no"),
        ] {
            assert_eq!(reply.headers[name], value, "{path} {name}");
        }
        assert_eq!(reply.text, expected, "{path}");
        let frames: Vec<serde_json::Value> = reply
            .text
            .split_terminator("\n\n")
            .map(|frame| serde_json::from_str(frame.strip_prefix("data: ").unwrap()).unwrap())
            .collect();
        let kinds: Vec<&str> = frames.iter().map(|f| f["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["meta", "token", "done"], "{path}");
        assert_eq!(frames[0]["supportLevel"], 2);
    }
}

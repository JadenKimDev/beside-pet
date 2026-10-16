use axum::body::to_bytes;
use axum::http::StatusCode;
use axum::response::Response;
use futures_util::stream;
use serde_json::{Value, json};

use super::sse_response;
use crate::shared::ApiError;
use crate::support::{StreamEvent, TurnResponse, TurnStream};

fn meta() -> StreamEvent {
    StreamEvent::Meta {
        task: 1,
        progress: 0.0,
        support_level: 1,
        done: false,
    }
}

fn token(text: &str) -> StreamEvent {
    StreamEvent::Token {
        text: text.to_owned(),
    }
}

fn done() -> StreamEvent {
    StreamEvent::Done {
        result: TurnResponse {
            reply: "Hello there".to_owned(),
            task: 1,
            progress: 0.0,
            support_level: 1,
            done: false,
        },
    }
}

fn events(items: Vec<Result<StreamEvent, ApiError>>) -> TurnStream {
    Box::pin(stream::iter(items))
}

async fn body_text(response: Response) -> String {
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    String::from_utf8(bytes.to_vec()).unwrap()
}

/// `data: <JSON>\n\n` 프레임을 JSON 으로 읽는다. 프레임 밖의 글자가 있으면 실패한다.
fn frames(text: &str) -> Vec<Value> {
    assert!(text.ends_with("\n\n"), "{text:?}");
    text.trim_end_matches("\n\n")
        .split("\n\n")
        .map(|frame| {
            let data = frame
                .strip_prefix("data: ")
                .unwrap_or_else(|| panic!("{frame:?}"));
            assert!(!data.contains('\n'), "{frame:?}");
            serde_json::from_str(data).unwrap()
        })
        .collect()
}

#[tokio::test]
async fn 첫_이벤트에_sse_헤더와_200을_내고_프레임을_흘린다() {
    let response = sse_response(events(vec![
        Ok(meta()),
        Ok(token("Hello")),
        Ok(token(" there")),
        Ok(done()),
    ]))
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    assert_eq!(headers["content-type"], "text/event-stream; charset=utf-8");
    assert_eq!(headers["cache-control"], "no-cache, no-transform");
    assert_eq!(headers["connection"], "keep-alive");
    assert_eq!(headers["x-accel-buffering"], "no");
    let text = body_text(response).await;
    assert!(text.starts_with("data: {\"kind\":\"meta\""), "{text:?}");
    assert_eq!(
        frames(&text),
        vec![
            json!({ "kind": "meta", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false }),
            json!({ "kind": "token", "text": "Hello" }),
            json!({ "kind": "token", "text": " there" }),
            json!({ "kind": "done", "result": { "reply": "Hello there", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false } }),
        ]
    );
}

#[tokio::test]
async fn 첫_이벤트_전의_오류는_보통의_http_오류다() {
    let response = sse_response(events(vec![
        Err(ApiError::NotFound("Session not found".to_owned())),
        Ok(meta()),
    ]))
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(response.headers()["content-type"], "application/json");
    let body: Value = serde_json::from_str(&body_text(response).await).unwrap();
    assert_eq!(
        body,
        json!({ "statusCode": 404, "message": "Session not found", "error": "Not Found" })
    );
}

#[tokio::test]
async fn 흐르던_중의_오류는_done_없이_끊는다() {
    let response = sse_response(events(vec![
        Ok(meta()),
        Ok(token("Hel")),
        Err(ApiError::Internal),
        Ok(token("lo")),
        Ok(done()),
    ]))
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let frames = frames(&body_text(response).await);
    assert_eq!(
        frames,
        vec![
            json!({ "kind": "meta", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false }),
            json!({ "kind": "token", "text": "Hel" }),
        ]
    );
}

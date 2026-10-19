//! Anthropic Messages API 공급자: 요청의 헤더와 본문, 응답과 SSE 스트림의 해석, 실패.

use axum::http::StatusCode;
use serde_json::json;

use super::super::{
    AnthropicProvider, Generation, LlmProvider, StreamEvent, TextModelProvider, TokenUsage,
};
use super::fake_server::FakeServer;
use super::{closed_base_url, collect, sample_request};
use crate::shared::ApiError;

const FAKE_KEY: &str = "sk-test-not-a-real-key";
const MODEL: &str = "claude-test-model";

fn provider(base_url: &str) -> AnthropicProvider {
    AnthropicProvider::new(base_url.to_owned(), FAKE_KEY.to_owned())
}

const MESSAGE_JSON: &str = r#"{"id":"msg_fake","type":"message","role":"assistant","model":"claude-test-model","content":[{"type":"text","text":"지어낸 대답"}],"stop_reason":"end_turn","usage":{"input_tokens":31,"output_tokens":9}}"#;

async fn json_server(status: StatusCode, body: &str) -> FakeServer {
    FakeServer::start(status, "application/json", &[body]).await
}

#[tokio::test]
async fn identifies_itself_as_anthropic() {
    assert_eq!(
        provider("http://127.0.0.1:1").provider(),
        LlmProvider::Anthropic
    );
}

#[tokio::test]
async fn generate_posts_messages_with_key_version_and_body() {
    let server = json_server(StatusCode::OK, MESSAGE_JSON).await;
    provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();

    let request = server.only_request();
    assert_eq!(request.method, "POST");
    assert_eq!(request.path, "/v1/messages");
    assert_eq!(request.headers["x-api-key"], FAKE_KEY);
    assert_eq!(request.headers["anthropic-version"], "2023-06-01");
    assert!(
        request.headers["content-type"]
            .to_str()
            .unwrap()
            .starts_with("application/json")
    );
    assert_eq!(
        request.body,
        json!({
            "model": MODEL,
            "max_tokens": 123,
            "system": "너는 테스트용 안내자다.",
            "messages": [
                { "role": "user", "content": "가짜 질문 하나" },
                { "role": "assistant", "content": "가짜 대답 하나" },
                { "role": "user", "content": "가짜 질문 둘" },
            ],
            "thinking": { "type": "disabled" },
        })
    );
}

/// 생각을 스스로 시작하는 모델(Haiku 5.5 등)이 고정된 max_tokens 를 생각에 다 써서 답이 비는 것을 막는다.
/// 비스트림과 스트림 모두 `thinking: {type: disabled}` 를 늘 싣는다.
#[tokio::test]
async fn both_calls_always_disable_thinking() {
    let server = json_server(StatusCode::OK, MESSAGE_JSON).await;
    provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    assert_eq!(
        server.only_request().body["thinking"],
        json!({ "type": "disabled" })
    );

    let server = sse_server(SSE_CHUNKS).await;
    collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(
        server.only_request().body["thinking"],
        json!({ "type": "disabled" })
    );
}

#[tokio::test]
async fn generate_leaves_out_system_when_there_is_none() {
    let server = json_server(StatusCode::OK, MESSAGE_JSON).await;
    let mut request = sample_request();
    request.system = None;
    provider(&format!("{}/", server.base_url))
        .generate(MODEL, request)
        .await
        .unwrap();

    let recorded = server.only_request();
    assert_eq!(recorded.path, "/v1/messages");
    assert!(recorded.body.get("system").is_none());
}

#[tokio::test]
async fn generate_returns_text_and_token_counts() {
    let server = json_server(StatusCode::OK, MESSAGE_JSON).await;
    let generation = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    assert_eq!(
        generation,
        Generation {
            text: "지어낸 대답".to_owned(),
            usage: TokenUsage {
                input_tokens: 31,
                output_tokens: 9,
            },
        }
    );
}

#[tokio::test]
async fn generate_fails_on_non_success_status() {
    let server = json_server(
        StatusCode::from_u16(529).unwrap(),
        r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#,
    )
    .await;
    let result = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await;
    assert_eq!(result, Err(ApiError::Internal));
}

#[tokio::test]
async fn generate_fails_on_empty_answer() {
    let server = json_server(
        StatusCode::OK,
        r#"{"type":"message","content":[],"usage":{"input_tokens":31,"output_tokens":0}}"#,
    )
    .await;
    let result = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await;
    assert_eq!(result, Err(ApiError::Internal));
}

#[tokio::test]
async fn generate_fails_on_unreadable_body() {
    let server = json_server(StatusCode::OK, "not json").await;
    let result = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await;
    assert_eq!(result, Err(ApiError::Internal));
}

#[tokio::test]
async fn generate_fails_when_server_is_unreachable() {
    let result = provider(&closed_base_url().await)
        .generate(MODEL, sample_request())
        .await;
    assert_eq!(result, Err(ApiError::Internal));
}

/// 실제 SSE 의 순서: message_start, content_block_start, ping, delta 들, content_block_stop, message_delta, message_stop.
/// 줄과 이벤트를 조각 경계에서 일부러 끊는다.
const SSE_CHUNKS: &[&str] = &[
    "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_fake\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"usage\":{\"input_tokens\":12,\"output_tokens\":1}}}\n\n",
    "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\nevent: ping\ndata: {\"type\": \"ping\"}\n\n",
    "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"안녕\"}}\n\nevent: content_block_delta\ndata: {\"type\":\"content_block_de",
    "lta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"하세요\"}}\n\n",
    "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n",
    "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":7}}\n\n",
    "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
];

async fn sse_server(chunks: &[&str]) -> FakeServer {
    FakeServer::start(StatusCode::OK, "text/event-stream", chunks).await
}

#[tokio::test]
async fn stream_asks_for_sse_with_the_same_body() {
    let server = sse_server(SSE_CHUNKS).await;
    collect(provider(&server.base_url).stream(MODEL, sample_request())).await;

    let request = server.only_request();
    assert_eq!(request.path, "/v1/messages");
    assert_eq!(request.headers["x-api-key"], FAKE_KEY);
    assert_eq!(request.headers["anthropic-version"], "2023-06-01");
    assert_eq!(request.body["stream"], json!(true));
    assert_eq!(request.body["model"], json!(MODEL));
    assert_eq!(request.body["max_tokens"], json!(123));
    assert_eq!(request.body["system"], json!("너는 테스트용 안내자다."));
    assert_eq!(request.body["messages"].as_array().unwrap().len(), 3);
}

#[tokio::test]
async fn stream_yields_text_in_order_then_one_usage() {
    let server = sse_server(SSE_CHUNKS).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("안녕".to_owned())),
            Ok(StreamEvent::Text("하세요".to_owned())),
            Ok(StreamEvent::Usage(TokenUsage {
                input_tokens: 12,
                output_tokens: 7,
            })),
        ]
    );
}

#[tokio::test]
async fn stream_accepts_crlf_line_endings() {
    let crlf: Vec<String> = SSE_CHUNKS.iter().map(|c| c.replace('\n', "\r\n")).collect();
    let chunks: Vec<&str> = crlf.iter().map(String::as_str).collect();
    let server = sse_server(&chunks).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events.len(), 3);
    assert_eq!(events[0], Ok(StreamEvent::Text("안녕".to_owned())));
}

#[tokio::test]
async fn stream_fails_on_non_success_status() {
    let server = FakeServer::start(
        StatusCode::UNAUTHORIZED,
        "application/json",
        &[r#"{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}"#],
    )
    .await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

#[tokio::test]
async fn stream_fails_when_server_is_unreachable() {
    let events = collect(provider(&closed_base_url().await).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

#[tokio::test]
async fn stream_stops_at_an_error_event() {
    let server = sse_server(&[
        SSE_CHUNKS[0],
        SSE_CHUNKS[2],
        "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n",
        SSE_CHUNKS[5],
        SSE_CHUNKS[6],
    ])
    .await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("안녕".to_owned())),
            Err(ApiError::Internal),
        ]
    );
}

#[tokio::test]
async fn stream_fails_when_cut_before_message_stop() {
    let server = sse_server(&SSE_CHUNKS[..4]).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events.last(), Some(&Err(ApiError::Internal)));
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Ok(StreamEvent::Usage(_))))
    );
}

#[tokio::test]
async fn stream_fails_on_empty_answer() {
    let server = sse_server(&[
        SSE_CHUNKS[0],
        SSE_CHUNKS[1],
        SSE_CHUNKS[4],
        SSE_CHUNKS[5],
        SSE_CHUNKS[6],
    ])
    .await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

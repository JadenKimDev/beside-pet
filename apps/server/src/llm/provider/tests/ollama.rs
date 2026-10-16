//! Ollama `/api/chat` 공급자: 요청 본문(생각 끄기, 출력 상한), 응답과 줄 단위 JSON 스트림의 해석, 실패.

use axum::http::StatusCode;
use serde_json::json;

use super::super::{
    Generation, LlmProvider, OllamaProvider, StreamEvent, TextModelProvider, TokenUsage,
};
use super::fake_server::FakeServer;
use super::{closed_base_url, collect, sample_request};
use crate::shared::ApiError;

const MODEL: &str = "fake-model:1b";

fn provider(base_url: &str) -> OllamaProvider {
    OllamaProvider::new(base_url.to_owned(), false)
}

const CHAT_JSON: &str = r#"{"model":"fake-model:1b","created_at":"2026-01-01T00:00:00Z","message":{"role":"assistant","content":"지어낸 대답"},"done":true,"done_reason":"stop","total_duration":1000,"prompt_eval_count":20,"eval_count":5}"#;

async fn json_server(status: StatusCode, body: &str) -> FakeServer {
    FakeServer::start(status, "application/json; charset=utf-8", &[body]).await
}

#[tokio::test]
async fn identifies_itself_as_ollama() {
    assert_eq!(
        provider("http://127.0.0.1:1").provider(),
        LlmProvider::Ollama
    );
}

#[tokio::test]
async fn generate_posts_chat_with_system_message_think_off_and_token_cap() {
    let server = json_server(StatusCode::OK, CHAT_JSON).await;
    provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();

    let request = server.only_request();
    assert_eq!(request.method, "POST");
    assert_eq!(request.path, "/api/chat");
    assert_eq!(
        request.body,
        json!({
            "model": MODEL,
            "messages": [
                { "role": "system", "content": "너는 테스트용 안내자다." },
                { "role": "user", "content": "가짜 질문 하나" },
                { "role": "assistant", "content": "가짜 대답 하나" },
                { "role": "user", "content": "가짜 질문 둘" },
            ],
            "stream": false,
            "think": false,
            "options": { "num_predict": 123 },
        })
    );
}

#[tokio::test]
async fn generate_sends_think_when_constructed_with_it() {
    let server = json_server(StatusCode::OK, CHAT_JSON).await;
    OllamaProvider::new(format!("{}/", server.base_url), true)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    let request = server.only_request();
    assert_eq!(request.path, "/api/chat");
    assert_eq!(request.body["think"], json!(true));
}

#[tokio::test]
async fn generate_has_no_system_message_when_there_is_none() {
    let server = json_server(StatusCode::OK, CHAT_JSON).await;
    let mut request = sample_request();
    request.system = None;
    provider(&server.base_url)
        .generate(MODEL, request)
        .await
        .unwrap();
    let messages = server.only_request().body["messages"].clone();
    assert_eq!(messages.as_array().unwrap().len(), 3);
    assert_eq!(messages[0]["role"], json!("user"));
}

#[tokio::test]
async fn generate_returns_text_and_token_counts() {
    let server = json_server(StatusCode::OK, CHAT_JSON).await;
    let generation = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    assert_eq!(
        generation,
        Generation {
            text: "지어낸 대답".to_owned(),
            usage: TokenUsage {
                input_tokens: 20,
                output_tokens: 5,
            },
        }
    );
}

#[tokio::test]
async fn generate_counts_missing_prompt_eval_as_zero() {
    // 프롬프트가 캐시에 있으면 Ollama 는 prompt_eval_count 를 빼고 보낸다.
    let server = json_server(
        StatusCode::OK,
        r#"{"model":"fake-model:1b","message":{"role":"assistant","content":"대답"},"done":true,"eval_count":3}"#,
    )
    .await;
    let generation = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    assert_eq!(
        generation.usage,
        TokenUsage {
            input_tokens: 0,
            output_tokens: 3,
        }
    );
}

#[tokio::test]
async fn generate_fails_on_empty_answer() {
    // 생각을 켠 gemma4 처럼 출력 상한을 생각에 다 쓰고 답이 빈 경우.
    let server = json_server(
        StatusCode::OK,
        r#"{"model":"fake-model:1b","message":{"role":"assistant","content":"","thinking":"지어낸 생각"},"done":true,"done_reason":"length","prompt_eval_count":20,"eval_count":123}"#,
    )
    .await;
    let result = provider(&server.base_url)
        .generate(MODEL, sample_request())
        .await;
    assert_eq!(result, Err(ApiError::Internal));
}

#[tokio::test]
async fn generate_fails_on_non_success_status() {
    let server = json_server(
        StatusCode::NOT_FOUND,
        r#"{"error":"model 'fake-model:1b' not found"}"#,
    )
    .await;
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

/// 줄 단위 JSON. 줄을 조각 경계에서 일부러 끊는다.
const NDJSON_CHUNKS: &[&str] = &[
    "{\"model\":\"fake-model:1b\",\"message\":{\"role\":\"assistant\",\"content\":\"안녕\"},\"done\":false}\n{\"model\":\"fake-mo",
    "del:1b\",\"message\":{\"role\":\"assistant\",\"content\":\"하세요\"},\"done\":false}\n",
    "{\"model\":\"fake-model:1b\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":false}\n",
    "{\"model\":\"fake-model:1b\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true,\"done_reason\":\"stop\",\"prompt_eval_count\":14,\"eval_count\":6}\n",
];

async fn ndjson_server(chunks: &[&str]) -> FakeServer {
    FakeServer::start(StatusCode::OK, "application/x-ndjson", chunks).await
}

#[tokio::test]
async fn stream_asks_for_streaming_with_the_same_body() {
    let server = ndjson_server(NDJSON_CHUNKS).await;
    collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    let request = server.only_request();
    assert_eq!(request.path, "/api/chat");
    assert_eq!(request.body["stream"], json!(true));
    assert_eq!(request.body["think"], json!(false));
    assert_eq!(request.body["model"], json!(MODEL));
    assert_eq!(request.body["options"], json!({ "num_predict": 123 }));
    assert_eq!(request.body["messages"].as_array().unwrap().len(), 4);
}

#[tokio::test]
async fn stream_yields_text_in_order_then_one_usage() {
    let server = ndjson_server(NDJSON_CHUNKS).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("안녕".to_owned())),
            Ok(StreamEvent::Text("하세요".to_owned())),
            Ok(StreamEvent::Usage(TokenUsage {
                input_tokens: 14,
                output_tokens: 6,
            })),
        ]
    );
}

#[tokio::test]
async fn stream_reads_a_last_line_without_newline() {
    let last = NDJSON_CHUNKS[3].trim_end();
    let server = ndjson_server(&[NDJSON_CHUNKS[0], NDJSON_CHUNKS[1], last]).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events.len(), 3);
    assert!(matches!(events[2], Ok(StreamEvent::Usage(_))));
}

#[tokio::test]
async fn stream_fails_on_empty_answer() {
    let server = ndjson_server(&[NDJSON_CHUNKS[2], NDJSON_CHUNKS[3]]).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

#[tokio::test]
async fn stream_stops_at_an_error_line() {
    let server = ndjson_server(&[
        NDJSON_CHUNKS[0],
        NDJSON_CHUNKS[1],
        "{\"error\":\"지어낸 오류\"}\n",
        NDJSON_CHUNKS[3],
    ])
    .await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("안녕".to_owned())),
            Ok(StreamEvent::Text("하세요".to_owned())),
            Err(ApiError::Internal),
        ]
    );
}

#[tokio::test]
async fn stream_fails_when_cut_before_done() {
    let server = ndjson_server(&NDJSON_CHUNKS[..2]).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events.last(), Some(&Err(ApiError::Internal)));
    assert!(
        !events
            .iter()
            .any(|e| matches!(e, Ok(StreamEvent::Usage(_))))
    );
}

#[tokio::test]
async fn stream_fails_on_non_success_status() {
    let server = json_server(StatusCode::NOT_FOUND, r#"{"error":"model not found"}"#).await;
    let events = collect(provider(&server.base_url).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

#[tokio::test]
async fn stream_fails_when_server_is_unreachable() {
    let events = collect(provider(&closed_base_url().await).stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

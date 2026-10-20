//! 공급자 테스트. 공급자마다 테스트 안에서 띄운 가짜 HTTP 서버(axum, 127.0.0.1 임의 포트)에 붙여
//! 보내는 요청의 모양, 응답과 스트림의 해석, 실패를 본다. 실제 네트워크에는 나가지 않고 값은 지어냈다.

mod anthropic;
mod fake_server;
mod ollama;

use futures_util::StreamExt;

use super::{ProviderStream, StreamEvent};
use crate::llm::{CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole};
use crate::shared::ApiError;

/// 시스템 글과 두 턴이 있는 지어낸 요청.
fn sample_request() -> GenerationRequest {
    GenerationRequest {
        system: Some("너는 테스트용 안내자다.".to_owned()),
        messages: vec![
            PromptMessage {
                role: PromptRole::User,
                text: "가짜 질문 하나".to_owned(),
            },
            PromptMessage {
                role: PromptRole::Assistant,
                text: "가짜 대답 하나".to_owned(),
            },
            PromptMessage {
                role: PromptRole::User,
                text: "가짜 질문 둘".to_owned(),
            },
        ],
        max_tokens: 123,
        context: CallContext {
            purpose: CallPurpose::Reply,
            prompt_version: "0.1.0",
            session_id: None,
        },
    }
}

/// 스트림을 끝까지 모은다.
async fn collect(stream: ProviderStream) -> Vec<Result<StreamEvent, ApiError>> {
    stream.collect().await
}

/// 아무것도 듣지 않는 루프백 주소(연결 실패를 보려고).
async fn closed_base_url() -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    format!("http://127.0.0.1:{port}")
}

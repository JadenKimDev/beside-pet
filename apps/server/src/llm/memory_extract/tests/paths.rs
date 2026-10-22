//! 두 경로의 요청 모양: 라우터에 실제 공급자를 붙여 가짜 서버로 보낸다. Anthropic 은 스키마로 답을 묶고,
//! Ollama(개발 실측의 claude-shim 포함)는 스키마 없이 지시문만 보내고 펜스에 싸인 답을 읽는다.

use std::sync::Arc;

use serde_json::{Value, json};

use super::fake_http::ModelServer;
use super::{KINDS, good_extraction, sample_request};
use crate::llm::memory_extract::MemoryExtract;
use crate::llm::memory_extract::prompt::output_schema;
use crate::llm::{
    AnthropicProvider, CallPurpose, InMemoryUsageSink, LlmProvider, ModelRef, ModelRouter,
    OllamaProvider, TextModelProvider,
};

const ANTHROPIC_ANSWER: &str = r#"{"id":"msg_fake","type":"message","role":"assistant","model":"claude-test","content":[{"type":"text","text":"{\"facts\":[{\"kind\":\"object\",\"pet_name\":\"보리\",\"text\":\"보리는 빨간 공을 좋아했다\",\"seq\":9,\"supersedes\":[1]},{\"kind\":\"place\",\"pet_name\":null,\"text\":\"매일 저녁 한강에 갔다\",\"seq\":9,\"supersedes\":[]}],\"do_not_remember\":false}"}],"stop_reason":"end_turn","usage":{"input_tokens":40,"output_tokens":20}}"#;

const OLLAMA_ANSWER: &str = r#"{"model":"shim-test","message":{"role":"assistant","content":"```json\n{\"facts\":[{\"kind\":\"object\",\"pet_name\":\"보리\",\"text\":\"보리는 빨간 공을 좋아했다\",\"seq\":9,\"supersedes\":[1]},{\"kind\":\"place\",\"pet_name\":null,\"text\":\"매일 저녁 한강에 갔다\",\"seq\":9,\"supersedes\":[]}],\"do_not_remember\":false}\n```"},"done":true,"prompt_eval_count":40,"eval_count":20}"#;

fn router(
    provider: LlmProvider,
    backend: Box<dyn TextModelProvider>,
    usage: Arc<InMemoryUsageSink>,
) -> Arc<ModelRouter> {
    Arc::new(ModelRouter::new(
        ModelRef {
            provider,
            model: "fake-model".to_owned(),
        },
        vec![backend],
        usage,
    ))
}

#[tokio::test]
async fn anthropic_경로는_output_config_의_json_schema_로_묶는다() {
    let server = ModelServer::answering(ANTHROPIC_ANSWER).await;
    let usage = Arc::new(InMemoryUsageSink::default());
    let model = router(
        LlmProvider::Anthropic,
        Box::new(AnthropicProvider::new(
            server.base_url.clone(),
            "sk-test-not-a-real-key".to_owned(),
        )),
        usage.clone(),
    );

    let extracted = MemoryExtract::new(model)
        .extract(sample_request())
        .await
        .unwrap();
    assert_eq!(extracted, good_extraction());

    let body = server.only_body();
    let schema: Value = serde_json::from_str(&output_schema(&KINDS)).unwrap();
    assert_eq!(
        body["output_config"],
        json!({ "format": { "type": "json_schema", "schema": schema } })
    );
    assert_eq!(body["thinking"], json!({ "type": "disabled" }));
    assert_eq!(body["messages"].as_array().unwrap().len(), 1);

    let records = usage.list();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].purpose, CallPurpose::MemoryExtract);
    assert_eq!(records[0].session_id.as_deref(), Some("session-fake-1"));
}

#[tokio::test]
async fn ollama_경로는_스키마_없이_보내고_펜스를_벗겨_읽는다() {
    let server = ModelServer::answering(OLLAMA_ANSWER).await;
    let usage = Arc::new(InMemoryUsageSink::default());
    let model = router(
        LlmProvider::Ollama,
        Box::new(OllamaProvider::new(server.base_url.clone(), false)),
        usage.clone(),
    );

    let extracted = MemoryExtract::new(model)
        .extract(sample_request())
        .await
        .unwrap();
    assert_eq!(extracted, good_extraction());

    let body = server.only_body();
    assert!(body.get("output_config").is_none(), "{body}");
    assert!(body.get("format").is_none(), "{body}");
    let messages = body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2, "시스템과 사용자 글 하나씩");
    assert_eq!(messages[0]["role"], "system");
    assert!(
        messages[0]["content"].as_str().unwrap().contains("JSON"),
        "지시문이 JSON 만 요구해야 한다"
    );

    let records = usage.list();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].purpose.as_str(), "memory_extract");
}

#[tokio::test]
async fn anthropic_의_일반_generate_에는_output_config_가_없다() {
    let server = ModelServer::answering(ANTHROPIC_ANSWER).await;
    let provider =
        AnthropicProvider::new(server.base_url.clone(), "sk-test-not-a-real-key".to_owned());
    let mut request = sample_request_generation();
    request.max_tokens = 10;
    provider.generate("fake-model", request).await.unwrap();
    assert!(server.only_body().get("output_config").is_none());
}

fn sample_request_generation() -> crate::llm::GenerationRequest {
    use crate::llm::{CallContext, GenerationRequest, PromptMessage, PromptRole};
    GenerationRequest {
        system: None,
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: "지어낸 말".to_owned(),
        }],
        max_tokens: 10,
        context: CallContext {
            purpose: CallPurpose::Reply,
            prompt_version: "0.1.0",
            session_id: None,
        },
    }
}

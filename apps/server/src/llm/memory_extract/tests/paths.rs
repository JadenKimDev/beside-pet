//! 두 경로의 요청 모양: 라우터에 실제 공급자를 붙인다. Anthropic 은 가짜 서버로 보내 `output_config` 의 스키마로 묶고,
//! Claude Code 는 가짜 `claude` 실행 파일에 `--json-schema` 로 묶어 `structured_output` 을 읽는다.

use std::sync::Arc;

use serde_json::{Value, json};

use super::fake_http::ModelServer;
use super::{KINDS, good_extraction, sample_request};
use crate::llm::memory_extract::MemoryExtract;
use crate::llm::memory_extract::prompt::{SYSTEM_PROMPT, output_schema, user_prompt};
use crate::llm::provider::tests::fake_claude::FakeClaude;
use crate::llm::{
    AnthropicProvider, CallPurpose, ClaudeCodeProvider, InMemoryUsageSink, LlmProvider, ModelRef,
    ModelRouter, TextModelProvider,
};

const ANTHROPIC_ANSWER: &str = r#"{"id":"msg_fake","type":"message","role":"assistant","model":"claude-test","content":[{"type":"text","text":"{\"facts\":[{\"kind\":\"object\",\"pet_name\":\"보리\",\"text\":\"보리는 빨간 공을 좋아했다\",\"seq\":9,\"supersedes\":[1]},{\"kind\":\"place\",\"pet_name\":null,\"text\":\"매일 저녁 한강에 갔다\",\"seq\":9,\"supersedes\":[]}],\"do_not_remember\":false}"}],"stop_reason":"end_turn","usage":{"input_tokens":40,"output_tokens":20}}"#;

const CLAUDE_CODE_ANSWER: &str = r#"{"type":"result","subtype":"success","is_error":false,"result":"","structured_output":{"facts":[{"kind":"object","pet_name":"보리","text":"보리는 빨간 공을 좋아했다","seq":9,"supersedes":[1]},{"kind":"place","pet_name":null,"text":"매일 저녁 한강에 갔다","seq":9,"supersedes":[]}],"do_not_remember":false},"usage":{"input_tokens":40,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":20}}"#;

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
async fn claude_code_경로는_json_schema_로_묶고_structured_output_을_읽는다() {
    let fake = FakeClaude::answering(CLAUDE_CODE_ANSWER);
    let usage = Arc::new(InMemoryUsageSink::default());
    let model = router(
        LlmProvider::ClaudeCode,
        Box::new(ClaudeCodeProvider::new(fake.program())),
        usage.clone(),
    );

    let extracted = MemoryExtract::new(model)
        .extract(sample_request())
        .await
        .unwrap();
    assert_eq!(extracted, good_extraction());

    assert_eq!(fake.calls(), 1);
    let args = fake.args(1);
    let after = |flag: &str| {
        let at = args.iter().position(|arg| arg == flag).expect(flag);
        args[at + 1].clone()
    };
    let sent: Value = serde_json::from_str(&after("--json-schema")).unwrap();
    let schema: Value = serde_json::from_str(&output_schema(&KINDS)).unwrap();
    assert_eq!(sent, schema);
    assert_eq!(after("--system-prompt"), SYSTEM_PROMPT);
    assert_eq!(after("--output-format"), "json");
    assert_eq!(
        fake.stdin(1),
        user_prompt(&sample_request()),
        "사용자 글 하나는 그대로 간다"
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

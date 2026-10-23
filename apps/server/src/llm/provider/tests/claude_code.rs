//! Claude Code 공급자: 가짜 `claude` 실행 파일에 붙여 인자와 stdin, json 과 stream-json 의 해석, 스키마, 다시 시도와 실패를 본다.
//! 실제 `claude` 는 부르지 않는다. 출력과 토큰 수는 지어냈다.

use std::sync::Arc;
use std::time::Duration;

use super::super::{
    ClaudeCodeProvider, Generation, LlmProvider, StreamEvent, TextModelProvider, TokenUsage,
};
use super::fake_claude::FakeClaude;
use super::{collect, sample_request};
use crate::llm::{
    CallContext, CallErrorKind, CallLimits, CallOutcome, CallPurpose, GenerationRequest,
    InMemoryUsageSink, ModelRef, ModelRouter, OutputSchema, PromptMessage, PromptRole, TextModel,
};
use crate::shared::ApiError;

const MODEL: &str = "claude-test-model";

const RESULT_JSON: &str = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":1100,"num_turns":1,"result":"지어낸 대답","session_id":"00000000-0000-0000-0000-000000000000","total_cost_usd":0.001,"usage":{"input_tokens":2,"cache_creation_input_tokens":623,"cache_read_input_tokens":40,"output_tokens":9}}"#;

const ERROR_JSON: &str = r#"{"type":"result","subtype":"error_during_execution","is_error":true,"result":"","usage":{"input_tokens":0,"output_tokens":0}}"#;

const EMPTY_JSON: &str = r#"{"type":"result","subtype":"success","is_error":false,"result":"","usage":{"input_tokens":3,"output_tokens":0}}"#;

const STRUCTURED_JSON: &str = r#"{"type":"result","subtype":"success","is_error":false,"result":"","structured_output":{"colors":["blue","red"]},"usage":{"input_tokens":5,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":7}}"#;

const STREAM_LINES: &str = concat!(
    r#"{"type":"system","subtype":"init","model":"claude-test-model"}"#,
    "\n",
    r#"{"type":"stream_event","event":{"type":"message_start","message":{"usage":{"input_tokens":2}}}}"#,
    "\n",
    r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#,
    "\n",
    r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"지어낸 "}}}"#,
    "\n",
    r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"조각"}}}"#,
    "\n",
    r#"{"type":"assistant","message":{"content":[{"type":"text","text":"지어낸 조각"}]}}"#,
    "\n",
    r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}"#,
    "\n",
    r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
    "\n",
    r#"{"type":"result","subtype":"success","is_error":false,"result":"지어낸 조각","usage":{"input_tokens":2,"cache_creation_input_tokens":600,"cache_read_input_tokens":10,"output_tokens":4}}"#,
    "\n",
);

const FLATTENED: &str = "<conversation>\n<user>\n가짜 질문 하나\n</user>\n<assistant>\n가짜 대답 하나\n</assistant>\n<user>\n가짜 질문 둘\n</user>\n</conversation>\nContinue the conversation above as the assistant: write only the assistant's next message, with no preface, labels, or quotation marks.";

fn provider(fake: &FakeClaude) -> ClaudeCodeProvider {
    ClaudeCodeProvider::new(fake.program())
}

/// 시스템 글 없이 사용자 글 하나뿐인 요청.
fn single_turn(text: &str, max_tokens: u32) -> GenerationRequest {
    GenerationRequest {
        system: None,
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: text.to_owned(),
        }],
        max_tokens,
        context: CallContext {
            purpose: CallPurpose::Crisis,
            prompt_version: "0.1.0",
            session_id: None,
        },
    }
}

fn base_args(output_format: &str) -> Vec<String> {
    [
        "-p",
        "--model",
        MODEL,
        "--tools",
        "",
        "--max-turns",
        "1",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--output-format",
        output_format,
    ]
    .map(str::to_owned)
    .to_vec()
}

#[test]
fn identifies_itself_as_claude_code() {
    let fake = FakeClaude::answering(RESULT_JSON);
    assert_eq!(provider(&fake).provider(), LlmProvider::ClaudeCode);
    assert_eq!(LlmProvider::ClaudeCode.as_str(), "claude-code");
    assert_eq!(
        LlmProvider::parse("claude-code"),
        Some(LlmProvider::ClaudeCode)
    );
    assert_eq!(LlmProvider::parse("ollama"), None);
}

#[tokio::test]
async fn generate_passes_fixed_args_system_prompt_and_flattened_turns_on_stdin() {
    let fake = FakeClaude::answering(RESULT_JSON);
    provider(&fake)
        .generate(MODEL, sample_request())
        .await
        .unwrap();

    assert_eq!(fake.calls(), 1);
    let mut want = base_args("json");
    want.extend([
        "--system-prompt".to_owned(),
        "너는 테스트용 안내자다.".to_owned(),
    ]);
    assert_eq!(fake.args(1), want);
    assert_eq!(fake.stdin(1), FLATTENED);
}

#[tokio::test]
async fn a_single_user_turn_goes_as_is_and_no_system_means_no_system_prompt() {
    let fake = FakeClaude::answering(RESULT_JSON);
    provider(&fake)
        .generate(MODEL, single_turn("지어낸 한 마디", 100))
        .await
        .unwrap();
    assert_eq!(fake.args(1), base_args("json"));
    assert_eq!(fake.stdin(1), "지어낸 한 마디");
}

#[tokio::test]
async fn the_child_runs_in_an_empty_directory_with_thinking_off_and_no_nested_session_markers() {
    let fake = FakeClaude::answering(RESULT_JSON);
    provider(&fake)
        .generate(MODEL, sample_request())
        .await
        .unwrap();

    let cwd = std::path::PathBuf::from(fake.cwd(1));
    let here = std::env::current_dir().unwrap().canonicalize().unwrap();
    assert_ne!(cwd, here, "레포의 디렉터리에서 돌면 안 된다");
    assert_eq!(std::fs::read_dir(&cwd).unwrap().count(), 0, "{cwd:?}");
    assert_eq!(fake.thinking(1), "0");
    let names = fake.env_names(1);
    assert!(
        names.iter().any(|name| name == "PATH"),
        "나머지 env 는 넘긴다"
    );
    assert!(
        !names
            .iter()
            .any(|name| name == "CLAUDECODE" || name.starts_with("CLAUDE_CODE_")),
        "{names:?}"
    );
}

#[tokio::test]
async fn generate_returns_result_text_and_input_tokens_including_cache() {
    let fake = FakeClaude::answering(RESULT_JSON);
    let generation = provider(&fake)
        .generate(MODEL, sample_request())
        .await
        .unwrap();
    assert_eq!(
        generation,
        Generation {
            text: "지어낸 대답".to_owned(),
            usage: TokenUsage {
                input_tokens: 2 + 623 + 40,
                output_tokens: 9,
            },
        }
    );
}

#[tokio::test]
async fn generate_cuts_the_text_at_six_characters_per_token() {
    let fake = FakeClaude::answering(
        r#"{"type":"result","is_error":false,"result":"가나다라마바사아자차카타파하","usage":{"input_tokens":1,"output_tokens":14}}"#,
    );
    let generation = provider(&fake)
        .generate(MODEL, single_turn("지어낸 말", 2))
        .await
        .unwrap();
    assert_eq!(generation.text, "가나다라마바사아자차카타");
}

#[tokio::test]
async fn stream_asks_for_partial_stream_json() {
    let fake = FakeClaude::answering(STREAM_LINES);
    collect(provider(&fake).stream(MODEL, single_turn("지어낸 말", 100))).await;
    let mut want = base_args("stream-json");
    want.extend([
        "--include-partial-messages".to_owned(),
        "--verbose".to_owned(),
    ]);
    assert_eq!(fake.args(1), want);
    assert_eq!(fake.stdin(1), "지어낸 말");
    assert_eq!(fake.thinking(1), "0");
}

#[tokio::test]
async fn stream_yields_text_deltas_in_order_then_one_usage_and_skips_other_lines() {
    let fake = FakeClaude::answering(STREAM_LINES);
    let events = collect(provider(&fake).stream(MODEL, sample_request())).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("지어낸 ".to_owned())),
            Ok(StreamEvent::Text("조각".to_owned())),
            Ok(StreamEvent::Usage(TokenUsage {
                input_tokens: 2 + 600 + 10,
                output_tokens: 4,
            })),
        ]
    );
}

#[tokio::test]
async fn stream_cuts_the_text_at_six_characters_per_token() {
    let lines = STREAM_LINES
        .replace(r#""text":"지어낸 ""#, r#""text":"가나다라""#)
        .replace(r#""text":"조각""#, r#""text":"마바사아""#);
    let fake = FakeClaude::answering(&lines);
    let events = collect(provider(&fake).stream(MODEL, single_turn("지어낸 말", 1))).await;
    assert_eq!(
        events,
        vec![
            Ok(StreamEvent::Text("가나다라".to_owned())),
            Ok(StreamEvent::Text("마바".to_owned())),
            Ok(StreamEvent::Usage(TokenUsage {
                input_tokens: 2 + 600 + 10,
                output_tokens: 4,
            })),
        ]
    );
}

#[tokio::test]
async fn stream_fails_on_error_result_nonzero_exit_or_missing_result() {
    let error_lines = STREAM_LINES.replace(r#""is_error":false"#, r#""is_error":true"#);
    let no_result: String = STREAM_LINES
        .lines()
        .filter(|line| !line.contains(r#""type":"result""#))
        .map(|line| format!("{line}\n"))
        .collect();
    for (output, code) in [
        (error_lines.as_str(), 0),
        (STREAM_LINES, 1),
        (no_result.as_str(), 0),
        ("not json\n", 0),
    ] {
        let fake = FakeClaude::answering(output).on_call(1, output, code);
        let events = collect(provider(&fake).stream(MODEL, sample_request())).await;
        assert_eq!(
            events.last(),
            Some(&Err(ApiError::Internal)),
            "{output:?} {code}"
        );
        assert!(
            !events
                .iter()
                .any(|event| matches!(event, Ok(StreamEvent::Usage(_)))),
            "{events:?}"
        );
    }
}

#[tokio::test]
async fn stream_fails_on_empty_answer_after_one_retry() {
    let no_text: String = STREAM_LINES
        .lines()
        .filter(|line| !line.contains("content_block_delta"))
        .map(|line| format!("{line}\n"))
        .collect();
    let fake = FakeClaude::answering(&no_text);
    let events = collect(provider(&fake).stream(MODEL, sample_request())).await;
    assert_eq!(fake.calls(), 2, "글을 내기 전의 실패는 한 번 다시 띄운다");
    assert_eq!(events, vec![Err(ApiError::Internal)]);
    assert!(
        !events
            .iter()
            .any(|event| matches!(event, Ok(StreamEvent::Usage(_)))),
        "{events:?}"
    );
}

#[tokio::test]
async fn stream_retries_once_when_the_first_run_fails_before_any_text() {
    let fake = FakeClaude::answering(STREAM_LINES).on_call(1, "", 1);
    let events = collect(provider(&fake).stream(MODEL, sample_request())).await;
    assert_eq!(fake.calls(), 2);
    assert_eq!(events.len(), 3, "{events:?}");
    assert!(events.iter().all(Result::is_ok), "{events:?}");
}

#[tokio::test]
async fn structured_passes_the_schema_and_returns_structured_output_as_json_text() {
    let fake = FakeClaude::answering(STRUCTURED_JSON);
    let schema = r#"{"type":"object","properties":{"colors":{"type":"array","items":{"type":"string"}}},"required":["colors"],"additionalProperties":false}"#;
    let generation = provider(&fake)
        .generate_structured(
            MODEL,
            single_turn("지어낸 말", 100),
            OutputSchema(schema.to_owned()),
        )
        .await
        .unwrap();

    let mut want = base_args("json");
    want.extend(["--json-schema".to_owned(), schema.to_owned()]);
    assert_eq!(fake.args(1), want);
    let value: serde_json::Value = serde_json::from_str(&generation.text).unwrap();
    assert_eq!(value, serde_json::json!({ "colors": ["blue", "red"] }));
    assert_eq!(
        generation.usage,
        TokenUsage {
            input_tokens: 5,
            output_tokens: 7,
        }
    );
}

#[tokio::test]
async fn structured_without_structured_output_fails_after_one_retry() {
    let fake = FakeClaude::answering(RESULT_JSON);
    let result = provider(&fake)
        .generate_structured(
            MODEL,
            single_turn("지어낸 말", 100),
            OutputSchema(r#"{"type":"object"}"#.to_owned()),
        )
        .await;
    assert_eq!(result, Err(ApiError::Internal));
    assert_eq!(fake.calls(), 2);
}

#[tokio::test]
async fn generate_retries_once_after_is_error_nonzero_exit_or_empty_answer() {
    for (first, code) in [(ERROR_JSON, 0), (RESULT_JSON, 1), (EMPTY_JSON, 0), ("", 1)] {
        let fake = FakeClaude::answering(RESULT_JSON).on_call(1, first, code);
        let generation = provider(&fake)
            .generate(MODEL, sample_request())
            .await
            .unwrap();
        assert_eq!(generation.text, "지어낸 대답", "{first:?} {code}");
        assert_eq!(fake.calls(), 2, "{first:?} {code}");
        assert_eq!(fake.stdin(2), FLATTENED, "다시 시도도 같은 프롬프트다");
    }
}

#[tokio::test]
async fn generate_fails_when_the_retry_also_fails() {
    for (output, code) in [
        (ERROR_JSON, 0),
        (RESULT_JSON, 2),
        (EMPTY_JSON, 0),
        ("not json", 0),
    ] {
        let fake = FakeClaude::answering(output)
            .on_call(1, output, code)
            .on_call(2, output, code);
        let result = provider(&fake).generate(MODEL, sample_request()).await;
        assert_eq!(result, Err(ApiError::Internal), "{output:?} {code}");
        assert_eq!(fake.calls(), 2, "{output:?} {code}");
    }
}

#[tokio::test]
async fn a_missing_program_is_an_internal_error() {
    let fake = FakeClaude::answering(RESULT_JSON);
    let missing = ClaudeCodeProvider::new(fake.program().with_file_name("no-such-claude"));
    assert_eq!(
        missing.generate(MODEL, sample_request()).await,
        Err(ApiError::Internal)
    );
    let events = collect(missing.stream(MODEL, sample_request())).await;
    assert_eq!(events, vec![Err(ApiError::Internal)]);
}

#[tokio::test]
async fn a_router_timeout_kills_the_child_process() {
    let fake = FakeClaude::answering(RESULT_JSON).sleeping(30);
    let usage = Arc::new(InMemoryUsageSink::default());
    let router = ModelRouter::new(
        ModelRef {
            provider: LlmProvider::ClaudeCode,
            model: MODEL.to_owned(),
        },
        vec![Box::new(provider(&fake))],
        usage.clone(),
    )
    .with_limits(CallLimits {
        generate: Duration::from_millis(500),
        stream_idle: Duration::from_millis(500),
    });

    assert_eq!(
        router.generate(sample_request()).await,
        Err(ApiError::ModelTimeout)
    );
    let records = usage.list();
    assert_eq!(
        records[0].outcome,
        CallOutcome::Error(CallErrorKind::Timeout)
    );
    let pid = fake.pid(1);
    let mut alive = true;
    for _ in 0..100 {
        // 죽었으나 아직 거두지 않은 프로세스(Z)도 죽은 것으로 본다.
        let output = std::process::Command::new("ps")
            .args(["-o", "stat=", "-p", &pid])
            .output()
            .unwrap();
        let stat = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        alive = !stat.is_empty() && !stat.starts_with('Z');
        if !alive {
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    assert!(!alive, "시간 제한에 걸린 자식 프로세스({pid})가 살아 있다");
}

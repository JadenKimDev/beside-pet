//! `claude -p` 에 넘길 것을 만드는 규칙: 고정 인자, 역할 턴을 글 하나로 편 사용자 프롬프트, 글자 수로 근사한 출력 상한.
//!
//! `claude -p` 는 assistant 역할 턴을 받지 못하므로(2026-10-23 실측, ADR-0038) 대화는 `<conversation>` 글 하나로 편다.

use crate::llm::{PromptMessage, PromptRole};

/// `max_tokens` 를 넘길 옵션이 없어 글자 수로 자른다. 글자 6개를 토큰 하나로 본다.
const CHARS_PER_TOKEN: usize = 6;

const CONTINUE: &str = "Continue the conversation above as the assistant: write only the assistant's next \
message, with no preface, labels, or quotation marks.";

/// 결과를 받는 모양.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Output {
    /// 끝난 뒤 결과 한 줄(`--output-format json`).
    Json,
    /// 글 조각을 줄마다(`--output-format stream-json --include-partial-messages`).
    StreamJson,
}

/// `claude` 뒤에 붙는 인자. 도구, 턴, 사용자 설정, MCP 를 모두 끄고, 스키마와 시스템 글은 있을 때만 싣는다.
pub(super) fn args(
    model: &str,
    output: Output,
    schema: Option<&str>,
    system: Option<&str>,
) -> Vec<String> {
    let mut args: Vec<String> = [
        "-p",
        "--model",
        model,
        "--tools",
        "",
        "--max-turns",
        "1",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--output-format",
    ]
    .map(str::to_owned)
    .to_vec();
    match output {
        Output::Json => args.push("json".to_owned()),
        Output::StreamJson => args
            .extend(["stream-json", "--include-partial-messages", "--verbose"].map(str::to_owned)),
    }
    if let Some(schema) = schema {
        args.extend(["--json-schema".to_owned(), schema.to_owned()]);
    }
    if let Some(system) = system {
        args.extend(["--system-prompt".to_owned(), system.to_owned()]);
    }
    args
}

/// stdin 으로 보낼 사용자 프롬프트. 사용자 턴 하나뿐이면 그 글, 아니면 `<conversation>` 글과 이어 쓰라는 지시 한 줄.
pub(super) fn flatten(messages: &[PromptMessage]) -> String {
    match messages {
        [] => String::new(),
        [only] if only.role == PromptRole::User => only.text.clone(),
        turns => {
            let mut lines = vec!["<conversation>".to_owned()];
            for turn in turns {
                let tag = match turn.role {
                    PromptRole::User => "user",
                    PromptRole::Assistant => "assistant",
                };
                lines.push(format!("<{tag}>\n{}\n</{tag}>", turn.text));
            }
            lines.push("</conversation>".to_owned());
            lines.push(CONTINUE.to_owned());
            lines.join("\n")
        }
    }
}

/// 출력 상한을 글자 수로 바꾼 값.
pub(super) fn max_chars(max_tokens: u32) -> usize {
    usize::try_from(max_tokens)
        .unwrap_or(usize::MAX)
        .saturating_mul(CHARS_PER_TOKEN)
}

/// 상한을 넘친 글을 잘라 낸다.
pub(super) fn cut(text: String, max_tokens: u32) -> String {
    let limit = max_chars(max_tokens);
    match text.char_indices().nth(limit) {
        Some((end, _)) => text[..end].to_owned(),
        None => text,
    }
}

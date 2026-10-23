//! `claude -p` 의 출력을 읽는 규칙: json 결과 한 줄과, stream-json 의 줄마다의 글 조각과 끝의 토큰 수.
//!
//! 실패는 종류(`&'static str`)로만 낸다. 답과 오류 문구의 본문은 읽어 넘기지 않는다.

use serde::Deserialize;

use super::super::{Generation, TokenUsage};

/// `usage` 칸. 입력 토큰은 캐시에서 읽은 것과 캐시에 쓴 것을 더한 값이다.
#[derive(Deserialize, Default)]
struct Usage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    cache_read_input_tokens: u32,
    #[serde(default)]
    cache_creation_input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
}

impl Usage {
    fn tokens(&self) -> TokenUsage {
        TokenUsage {
            input_tokens: self
                .input_tokens
                .saturating_add(self.cache_read_input_tokens)
                .saturating_add(self.cache_creation_input_tokens),
            output_tokens: self.output_tokens,
        }
    }
}

/// `--output-format json` 의 결과.
#[derive(Deserialize)]
struct ResultJson {
    #[serde(default)]
    is_error: bool,
    #[serde(default)]
    result: String,
    /// `--json-schema` 를 줬을 때 스키마대로의 값. 모델 응답의 경계라 여기서만 JSON 값으로 받는다.
    structured_output: Option<serde_json::Value>,
    #[serde(default)]
    usage: Usage,
}

/// json 결과를 읽는다. `structured` 면 `structured_output` 을 JSON 글로 돌려준다.
pub(super) fn read_result(stdout: &[u8], structured: bool) -> Result<Generation, &'static str> {
    let reply: ResultJson = serde_json::from_slice(stdout).map_err(|_| "unreadable result json")?;
    if reply.is_error {
        return Err("error result");
    }
    let text = if structured {
        let value = reply.structured_output.ok_or("no structured output")?;
        serde_json::to_string(&value).map_err(|_| "unreadable structured output")?
    } else {
        reply.result
    };
    if text.is_empty() {
        return Err("empty answer");
    }
    Ok(Generation {
        text,
        usage: reply.usage.tokens(),
    })
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum StreamLine {
    StreamEvent {
        event: Event,
    },
    Result {
        #[serde(default)]
        is_error: bool,
        #[serde(default)]
        usage: Usage,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    ContentBlockDelta {
        delta: Delta,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Delta {
    TextDelta {
        text: String,
    },
    #[serde(other)]
    Other,
}

/// stream-json 의 줄을 하나씩 먹어 글 조각을 내고, `result` 줄의 토큰 수를 끝에 낸다.
/// 글자 상한을 넘친 조각은 잘라 내고 그 뒤 조각은 버린다(토큰 수는 끝까지 읽는다).
pub(super) struct StreamDecoder {
    chars_left: usize,
    usage: Option<TokenUsage>,
    wrote_text: bool,
}

impl StreamDecoder {
    pub(super) fn new(max_chars: usize) -> StreamDecoder {
        StreamDecoder {
            chars_left: max_chars,
            usage: None,
            wrote_text: false,
        }
    }

    /// 줄 하나. 내보낼 글 조각이 있으면 `Some`. 모르는 줄(`system`, `assistant`, `rate_limit_event` 등)은 건너뛴다.
    pub(super) fn feed(&mut self, line: &str) -> Result<Option<String>, &'static str> {
        if line.trim().is_empty() || self.usage.is_some() {
            return Ok(None);
        }
        let parsed: StreamLine =
            serde_json::from_str(line).map_err(|_| "unreadable stream line")?;
        match parsed {
            StreamLine::StreamEvent {
                event:
                    Event::ContentBlockDelta {
                        delta: Delta::TextDelta { text },
                    },
            } => Ok(self.take(text)),
            StreamLine::Result { is_error: true, .. } => Err("error result"),
            StreamLine::Result { usage, .. } => {
                self.usage = Some(usage.tokens());
                Ok(None)
            }
            StreamLine::StreamEvent { .. } | StreamLine::Other => Ok(None),
        }
    }

    fn take(&mut self, text: String) -> Option<String> {
        let kept: String = text.chars().take(self.chars_left).collect();
        self.chars_left -= kept.chars().count();
        if kept.is_empty() {
            return None;
        }
        self.wrote_text = true;
        Some(kept)
    }

    /// 출력이 끝났을 때의 토큰 수. `result` 줄이 없었거나 글이 비었으면 실패다.
    pub(super) fn finish(self) -> Result<TokenUsage, &'static str> {
        let usage = self.usage.ok_or("stream ended before result")?;
        if !self.wrote_text {
            return Err("empty answer");
        }
        Ok(usage)
    }

    pub(super) fn wrote_text(&self) -> bool {
        self.wrote_text
    }
}

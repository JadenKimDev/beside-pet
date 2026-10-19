//! Anthropic Messages API(`/v1/messages`) 공급자: 요청 본문을 만들고 응답과 SSE 스트림을 읽는다.

use futures_util::future::BoxFuture;
use reqwest::{Client, RequestBuilder};
use serde::{Deserialize, Serialize};

use super::wire::{self, LineDecoder};
use super::{Generation, LlmProvider, ProviderStream, TextModelProvider, TokenUsage};
use crate::llm::{GenerationRequest, PromptRole};
use crate::shared::ApiError;

const API_VERSION: &str = "2023-06-01";
const PROVIDER: LlmProvider = LlmProvider::Anthropic;

/// 주소와 키는 설정이 읽어 넘긴다. 공급자는 환경 변수를 읽지 않는다.
pub struct AnthropicProvider {
    client: Client,
    endpoint: String,
    api_key: String,
}

impl AnthropicProvider {
    /// `base_url` 예: `https://api.anthropic.com`(끝의 `/` 는 있어도 된다).
    pub fn new(base_url: String, api_key: String) -> AnthropicProvider {
        AnthropicProvider {
            client: Client::new(),
            endpoint: format!("{}/v1/messages", base_url.trim_end_matches('/')),
            api_key,
        }
    }

    fn post(&self, model: &str, request: &GenerationRequest, stream: bool) -> RequestBuilder {
        let body = MessagesBody {
            model,
            max_tokens: request.max_tokens,
            system: request.system.as_deref(),
            messages: request
                .messages
                .iter()
                .map(|message| WireMessage {
                    role: match message.role {
                        PromptRole::User => "user",
                        PromptRole::Assistant => "assistant",
                    },
                    content: &message.text,
                })
                .collect(),
            stream,
            thinking: Thinking::DISABLED,
        };
        self.client
            .post(&self.endpoint)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", API_VERSION)
            .json(&body)
    }
}

impl TextModelProvider for AnthropicProvider {
    fn provider(&self) -> LlmProvider {
        PROVIDER
    }

    fn generate(
        &self,
        model: &str,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<Generation, ApiError>> {
        let call = self.post(model, &request, false);
        Box::pin(async move {
            let reply: MessageReply = wire::read_json(PROVIDER, call).await?;
            let text = reply
                .content
                .into_iter()
                .find_map(|block| match block {
                    ContentBlock::Text { text } => Some(text),
                    ContentBlock::Other => None,
                })
                .filter(|text| !text.is_empty())
                .ok_or_else(|| wire::failure(PROVIDER, "empty answer"))?;
            Ok(Generation {
                text,
                usage: TokenUsage {
                    input_tokens: reply.usage.input_tokens,
                    output_tokens: reply.usage.output_tokens,
                },
            })
        })
    }

    fn stream(&self, model: &str, request: GenerationRequest) -> ProviderStream {
        wire::event_stream(
            PROVIDER,
            self.post(model, &request, true),
            SseDecoder::default(),
        )
    }
}

#[derive(Serialize)]
struct MessagesBody<'a> {
    model: &'a str,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<&'a str>,
    messages: Vec<WireMessage<'a>>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
    /// 늘 끈다. 생각을 스스로 시작하는 모델(Haiku 5.5 등)이 고정된 `max_tokens` 를 생각에 다 써서
    /// 답이 비는 것을 막는다(ADR-0016). Ollama 의 `think: false` 와 같은 뜻이다.
    thinking: Thinking,
}

#[derive(Serialize)]
struct Thinking {
    r#type: &'static str,
}

impl Thinking {
    const DISABLED: Thinking = Thinking { r#type: "disabled" };
}

#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'static str,
    content: &'a str,
}

#[derive(Deserialize)]
struct MessageReply {
    content: Vec<ContentBlock>,
    usage: Usage,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text {
        text: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct Usage {
    input_tokens: u32,
    output_tokens: u32,
}

/// SSE 의 `data:` 줄 하나. `event:` 줄은 `data` 의 `type` 과 같으므로 보지 않는다.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SseEvent {
    MessageStart {
        message: StartedMessage,
    },
    ContentBlockDelta {
        delta: Delta,
    },
    MessageDelta {
        usage: OutputUsage,
    },
    MessageStop,
    Error,
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct StartedMessage {
    usage: InputUsage,
}

#[derive(Deserialize)]
struct InputUsage {
    input_tokens: u32,
}

#[derive(Deserialize)]
struct OutputUsage {
    output_tokens: u32,
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

/// `message_start` 의 입력 토큰과 `message_delta` 의 출력 토큰(누적값)을 모아 끝에 한 건으로 낸다.
#[derive(Default)]
struct SseDecoder {
    input_tokens: Option<u32>,
    output_tokens: Option<u32>,
    wrote_text: bool,
    stopped: bool,
}

impl LineDecoder for SseDecoder {
    fn feed(&mut self, line: &str) -> Result<Option<String>, &'static str> {
        let Some(data) = line.strip_prefix("data:") else {
            return Ok(None);
        };
        let event: SseEvent =
            serde_json::from_str(data.trim()).map_err(|_| "unreadable stream event")?;
        match event {
            SseEvent::MessageStart { message } => {
                self.input_tokens = Some(message.usage.input_tokens);
            }
            SseEvent::ContentBlockDelta {
                delta: Delta::TextDelta { text },
            } if !text.is_empty() => {
                self.wrote_text = true;
                return Ok(Some(text));
            }
            SseEvent::MessageDelta { usage } => self.output_tokens = Some(usage.output_tokens),
            SseEvent::MessageStop => self.stopped = true,
            SseEvent::Error => return Err("error event in stream"),
            SseEvent::ContentBlockDelta { .. } | SseEvent::Other => {}
        }
        Ok(None)
    }

    fn finish(self) -> Result<TokenUsage, &'static str> {
        if !self.stopped {
            return Err("stream ended before message_stop");
        }
        if !self.wrote_text {
            return Err("empty answer");
        }
        match (self.input_tokens, self.output_tokens) {
            (Some(input_tokens), Some(output_tokens)) => Ok(TokenUsage {
                input_tokens,
                output_tokens,
            }),
            _ => Err("stream ended without usage"),
        }
    }
}

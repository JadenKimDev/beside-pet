//! Ollama `/api/chat` 공급자: 요청 본문을 만들고 응답과 줄 단위 JSON 스트림을 읽는다.
//!
//! gemma4 같은 생각(thinking) 모델은 생각을 켜 두면 출력 상한을 생각에 다 쓰고 답이 빈다(2026-10-16 실측).
//! 그래서 `think` 를 늘 실어 보내고(기본 끔), 빈 답은 성공으로 넘기지 않는다.

use futures_util::future::BoxFuture;
use reqwest::{Client, RequestBuilder};
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};

use super::wire::{self, LineDecoder};
use super::{Generation, LlmProvider, ProviderStream, TextModelProvider, TokenUsage};
use crate::llm::{GenerationRequest, PromptRole};
use crate::shared::ApiError;

const PROVIDER: LlmProvider = LlmProvider::Ollama;

/// 주소와 생각 켜기는 설정이 읽어 넘긴다. 공급자는 환경 변수를 읽지 않는다.
pub struct OllamaProvider {
    client: Client,
    endpoint: String,
    think: bool,
}

impl OllamaProvider {
    /// `base_url` 예: `http://127.0.0.1:11434`(끝의 `/` 는 있어도 된다). `think` 는 보통 `false`.
    pub fn new(base_url: String, think: bool) -> OllamaProvider {
        OllamaProvider {
            client: Client::new(),
            endpoint: format!("{}/api/chat", base_url.trim_end_matches('/')),
            think,
        }
    }

    fn post(&self, model: &str, request: &GenerationRequest, stream: bool) -> RequestBuilder {
        let system = request.system.as_deref().map(|content| WireMessage {
            role: "system",
            content,
        });
        let turns = request.messages.iter().map(|message| WireMessage {
            role: match message.role {
                PromptRole::User => "user",
                PromptRole::Assistant => "assistant",
            },
            content: &message.text,
        });
        let body = ChatBody {
            model,
            messages: system.into_iter().chain(turns).collect(),
            stream,
            think: self.think,
            options: Options {
                num_predict: request.max_tokens,
            },
        };
        self.client.post(&self.endpoint).json(&body)
    }
}

impl TextModelProvider for OllamaProvider {
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
            let reply: ChatLine = wire::read_json(PROVIDER, call).await?;
            if reply.error.is_some() {
                return Err(wire::failure(PROVIDER, "error in response"));
            }
            let usage = reply.usage();
            let text = reply
                .message
                .map(|message| message.content)
                .filter(|text| !text.is_empty())
                .ok_or_else(|| wire::failure(PROVIDER, "empty answer"))?;
            Ok(Generation { text, usage })
        })
    }

    fn stream(&self, model: &str, request: GenerationRequest) -> ProviderStream {
        wire::event_stream(
            PROVIDER,
            self.post(model, &request, true),
            NdjsonDecoder::default(),
        )
    }
}

#[derive(Serialize)]
struct ChatBody<'a> {
    model: &'a str,
    messages: Vec<WireMessage<'a>>,
    stream: bool,
    think: bool,
    options: Options,
}

#[derive(Serialize)]
struct WireMessage<'a> {
    role: &'static str,
    content: &'a str,
}

#[derive(Serialize)]
struct Options {
    num_predict: u32,
}

/// 비스트리밍 응답, 그리고 스트리밍의 한 줄. 프롬프트가 캐시에 있으면 `prompt_eval_count` 가 빠진다.
#[derive(Deserialize)]
struct ChatLine {
    message: Option<ReplyMessage>,
    #[serde(default)]
    done: bool,
    prompt_eval_count: Option<u32>,
    eval_count: Option<u32>,
    /// 오류 문구는 로그에 싣지 않으므로 읽지 않고, 칸이 있는지만 본다.
    error: Option<IgnoredAny>,
}

impl ChatLine {
    fn usage(&self) -> TokenUsage {
        TokenUsage {
            input_tokens: self.prompt_eval_count.unwrap_or(0),
            output_tokens: self.eval_count.unwrap_or(0),
        }
    }
}

#[derive(Deserialize)]
struct ReplyMessage {
    #[serde(default)]
    content: String,
}

/// `done: false` 줄의 글을 흘리고 `done: true` 줄의 토큰 수를 끝에 낸다.
#[derive(Default)]
struct NdjsonDecoder {
    usage: Option<TokenUsage>,
    wrote_text: bool,
}

impl LineDecoder for NdjsonDecoder {
    fn feed(&mut self, line: &str) -> Result<Option<String>, &'static str> {
        if line.trim().is_empty() || self.usage.is_some() {
            return Ok(None);
        }
        let chunk: ChatLine = serde_json::from_str(line).map_err(|_| "unreadable stream line")?;
        if chunk.error.is_some() {
            return Err("error line in stream");
        }
        if chunk.done {
            self.usage = Some(chunk.usage());
        }
        let text = chunk
            .message
            .map(|message| message.content)
            .unwrap_or_default();
        if text.is_empty() {
            return Ok(None);
        }
        self.wrote_text = true;
        Ok(Some(text))
    }

    fn finish(self) -> Result<TokenUsage, &'static str> {
        let usage = self.usage.ok_or("stream ended before done")?;
        if !self.wrote_text {
            return Err("empty answer");
        }
        Ok(usage)
    }
}

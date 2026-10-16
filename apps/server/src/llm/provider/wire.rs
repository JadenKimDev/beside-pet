//! 공급자 HTTP 호출의 공통 절차: 보내고 상태 코드를 보고, 본문을 읽거나 줄로 잘라 스트림 이벤트로 흘린다.
//!
//! 실패는 원인(공급자, 상태 코드, 실패의 종류)만 로그에 남기고 `ApiError::Internal` 로 올린다.
//! 프롬프트, 응답 본문, API 키는 로그와 오류 문구에 싣지 않는다.

use futures_util::stream;
use reqwest::{RequestBuilder, Response};
use serde::de::DeserializeOwned;

use super::{LlmProvider, ProviderStream, StreamEvent, TokenUsage};
use crate::shared::ApiError;

/// 실패를 로그에 남기고 밖으로 낼 오류를 만든다.
pub(super) fn failure(provider: LlmProvider, reason: &'static str) -> ApiError {
    tracing::warn!(provider = provider.as_str(), reason, "model call failed");
    ApiError::Internal
}

/// 요청을 보내고 2xx 가 아니면 실패로 올린다.
pub(super) async fn send(
    provider: LlmProvider,
    request: RequestBuilder,
) -> Result<Response, ApiError> {
    let response = request.send().await.map_err(|error| {
        tracing::warn!(
            provider = provider.as_str(),
            connect = error.is_connect(),
            timeout = error.is_timeout(),
            "model call failed: request not sent"
        );
        ApiError::Internal
    })?;
    let status = response.status();
    if !status.is_success() {
        tracing::warn!(
            provider = provider.as_str(),
            status = status.as_u16(),
            "model call failed: non-success status"
        );
        return Err(ApiError::Internal);
    }
    Ok(response)
}

/// 2xx 응답의 JSON 본문을 공급자의 응답 타입으로 읽는다.
pub(super) async fn read_json<T: DeserializeOwned>(
    provider: LlmProvider,
    request: RequestBuilder,
) -> Result<T, ApiError> {
    let response = send(provider, request).await?;
    response
        .json::<T>()
        .await
        .map_err(|_| failure(provider, "unreadable response body"))
}

/// 스트리밍 본문의 줄 하나씩을 해석하는 쪽. 공급자마다 하나.
pub(super) trait LineDecoder: Send + 'static {
    /// 줄 하나(줄바꿈은 뗐다)를 읽는다. 내보낼 글 조각이 있으면 `Some`.
    fn feed(&mut self, line: &str) -> Result<Option<String>, &'static str>;
    /// 본문이 끝났을 때 토큰 수를 낸다. 끝맺음이 없었거나 글이 비었으면 실패다.
    fn finish(self) -> Result<TokenUsage, &'static str>;
}

/// 요청을 보내 2xx 본문을 줄로 잘라 `decoder` 에 먹이고, 글 조각들과 마지막 토큰 수를 흘린다.
/// 오류가 나면 그 한 건을 내고 끝낸다.
pub(super) fn event_stream<D: LineDecoder>(
    provider: LlmProvider,
    request: RequestBuilder,
    decoder: D,
) -> ProviderStream {
    let start = Stage::Start { request, decoder };
    Box::pin(stream::unfold(start, move |stage| async move {
        let (mut lines, mut decoder) = match stage {
            Stage::Done => return None,
            Stage::Start { request, decoder } => match send(provider, request).await {
                Ok(response) => (Lines::new(response), decoder),
                Err(error) => return Some((Err(error), Stage::Done)),
            },
            Stage::Reading { lines, decoder } => (lines, decoder),
        };
        loop {
            let line = match lines.next().await {
                Ok(Some(line)) => line,
                Ok(None) => {
                    let end = decoder
                        .finish()
                        .map(StreamEvent::Usage)
                        .map_err(|reason| failure(provider, reason));
                    return Some((end, Stage::Done));
                }
                Err(reason) => return Some((Err(failure(provider, reason)), Stage::Done)),
            };
            match decoder.feed(&line) {
                Ok(Some(text)) => {
                    return Some((
                        Ok(StreamEvent::Text(text)),
                        Stage::Reading { lines, decoder },
                    ));
                }
                Ok(None) => {}
                Err(reason) => return Some((Err(failure(provider, reason)), Stage::Done)),
            }
        }
    }))
}

enum Stage<D> {
    Start { request: RequestBuilder, decoder: D },
    Reading { lines: Lines, decoder: D },
    Done,
}

/// 응답 본문을 줄 단위로 읽는다. 조각 경계에서 끊긴 줄은 이어 붙이고, `\r\n` 과 마지막의 줄바꿈 없는 줄도 받는다.
struct Lines {
    response: Response,
    buffer: Vec<u8>,
    ended: bool,
}

impl Lines {
    fn new(response: Response) -> Lines {
        Lines {
            response,
            buffer: Vec::new(),
            ended: false,
        }
    }

    async fn next(&mut self) -> Result<Option<String>, &'static str> {
        loop {
            if let Some(end) = self.buffer.iter().position(|byte| *byte == b'\n') {
                let line: Vec<u8> = self.buffer.drain(..=end).collect();
                return to_line(&line[..end]).map(Some);
            }
            if self.ended {
                if self.buffer.is_empty() {
                    return Ok(None);
                }
                let rest = std::mem::take(&mut self.buffer);
                return to_line(&rest).map(Some);
            }
            match self.response.chunk().await {
                Ok(Some(chunk)) => self.buffer.extend_from_slice(&chunk),
                Ok(None) => self.ended = true,
                Err(_) => return Err("response body interrupted"),
            }
        }
    }
}

fn to_line(bytes: &[u8]) -> Result<String, &'static str> {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    String::from_utf8(bytes.to_vec()).map_err(|_| "response line is not UTF-8")
}

//! 답이 나가는 길: 동기 턴은 글 전체를 한 번에(`generate`), 스트림 턴은 `meta` 와 조각을 흘린다(`stream`). 흐름의 결정은 같다.

use futures_util::StreamExt;

use super::deadline::{CallFailure, Deadlined};
use super::stream::Emitter;
use crate::llm::GenerationRequest;
use crate::shared::ApiError;
use crate::support::StreamEvent;

pub enum Voice<'a> {
    Whole,
    Streamed(&'a Emitter),
}

impl Voice<'_> {
    /// 글보다 먼저 구조(`meta`)를 알린다(스트림만).
    pub async fn announce(&self, meta: StreamEvent) {
        if let Voice::Streamed(out) = self {
            out.send(meta).await;
        }
    }

    /// 모델이 쓰지 않는 고정 글(위기 답)을 조각 하나로 보낸다(스트림만).
    pub async fn fixed(&self, text: &str) {
        if let Voice::Streamed(out) = self {
            out.send(StreamEvent::Token {
                text: text.to_owned(),
            })
            .await;
        }
    }

    /// 모델이 답을 쓴다. 동기는 앞뒤 공백을 걷고 빈 답을 실패로 본다(TS 와 같다). 스트림은 조각을 그대로 잇는다.
    /// 실패는 제한을 넘긴 것과 모델의 오류를 가른다(실패한 턴의 종류).
    pub async fn compose(
        &self,
        model: &Deadlined,
        request: GenerationRequest,
    ) -> Result<String, CallFailure> {
        match self {
            Voice::Whole => {
                let text = model.generate_within(request).await?;
                let reply = text.trim();
                if reply.is_empty() {
                    tracing::warn!("model returned an empty reply");
                    return Err(CallFailure::Failed(ApiError::Internal));
                }
                Ok(reply.to_owned())
            }
            Voice::Streamed(out) => {
                let mut chunks = model.stream_within(request);
                let mut reply = String::new();
                while let Some(chunk) = chunks.next().await {
                    let chunk = chunk?;
                    reply.push_str(&chunk);
                    out.send(StreamEvent::Token { text: chunk }).await;
                }
                Ok(reply)
            }
        }
    }
}

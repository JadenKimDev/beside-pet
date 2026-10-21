//! 답이 나가는 길: 동기 턴은 글 전체를 한 번에(`generate`), 스트림 턴은 `meta` 와 조각을 흘린다(`stream`). 흐름의 결정은 같다.

use std::future::Future;

use futures_util::StreamExt;
use futures_util::future::join_all;

use super::live::LiveTurn;
use super::stream::Emitter;
use crate::llm::{GenerationRequest, TextModel};
use crate::shared::ApiError;
use crate::support::StreamEvent;
use crate::support::session::TurnErrorKind;

/// 발화를 쓰는 모델. 시간 제한은 모델(라우터)이 두르고, 넘기면 `ApiError::ModelTimeout` 이다.
type Model = dyn TextModel + Send + Sync;

/// 실패한 턴에 적는 종류: 모델의 시간 제한이면 `timeout`, 그 밖의 실패는 `provider`(ADR-0028).
pub fn failed_turn_kind(error: &ApiError) -> TurnErrorKind {
    match error {
        ApiError::ModelTimeout => TurnErrorKind::Timeout,
        _ => TurnErrorKind::Provider,
    }
}

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
    /// 실패의 종류는 `failed_turn_kind` 가 가른다.
    /// 등록부에 오른 턴(`live`)이면 스트림 조각을 등록부에도 더하고, 기다리는 사이에 중단되면 모델 호출을 버리고 `Cancelled` 다
    /// (공급자 연결이 닫히고 그 호출은 `llm_calls` 에 `cancelled` 로 남는다).
    pub async fn compose(
        &self,
        model: &Model,
        request: GenerationRequest,
        mut live: Option<&mut LiveTurn>,
    ) -> Result<Composed, ApiError> {
        match self {
            Voice::Whole => {
                let Some(text) = watch(live, model.generate(request)).await else {
                    return Ok(Composed::Cancelled);
                };
                Ok(Composed::Reply(whole_reply(text?)?))
            }
            Voice::Streamed(out) => {
                let mut chunks = model.stream(request);
                let mut reply = String::new();
                loop {
                    let Some(next) = watch(live.as_deref_mut(), chunks.next()).await else {
                        return Ok(Composed::Cancelled);
                    };
                    let Some(chunk) = next else { break };
                    let chunk = chunk?;
                    if live.as_deref().is_some_and(|live| !live.push(&chunk)) {
                        return Ok(Composed::Cancelled);
                    }
                    reply.push_str(&chunk);
                    out.send(StreamEvent::Token { text: chunk }).await;
                }
                Ok(Composed::Reply(reply))
            }
        }
    }
}

/// 동기 턴의 후보 `count` 개를 같은 요청으로 병렬로 받는다(ADR-0031). 하나라도 쓰면 쓴 것들(요청 순서), 모두 실패하면
/// 첫 실패다. 기다리는 사이에 중단되면 모든 호출을 버리고 `None` 이다.
pub async fn compose_candidates(
    model: &Model,
    request: GenerationRequest,
    count: u8,
    live: &mut LiveTurn,
) -> Result<Option<Vec<String>>, ApiError> {
    let calls = (0..count).map(|_| model.generate(request.clone()));
    let Some(results) = live.unless_cancelled(join_all(calls)).await else {
        return Ok(None);
    };
    let mut replies = Vec::new();
    let mut first_failure = None;
    for result in results {
        match result.and_then(whole_reply) {
            Ok(reply) => replies.push(reply),
            Err(failure) => {
                first_failure.get_or_insert(failure);
            }
        }
    }
    match first_failure {
        Some(failure) if replies.is_empty() => Err(failure),
        _ => Ok(Some(replies)),
    }
}

/// 동기 답: 앞뒤 공백을 걷고 빈 답은 실패로 본다(TS 와 같다).
fn whole_reply(text: String) -> Result<String, ApiError> {
    let reply = text.trim();
    if reply.is_empty() {
        tracing::warn!("model returned an empty reply");
        return Err(ApiError::Internal);
    }
    Ok(reply.to_owned())
}

/// 답을 다 썼거나, 도중에 중단됐다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Composed {
    Reply(String),
    Cancelled,
}

/// 등록부에 오른 턴이면 중단 토큰과 함께 기다린다. 중단되면 `None`.
async fn watch<T>(live: Option<&mut LiveTurn>, work: impl Future<Output = T>) -> Option<T> {
    match live {
        Some(live) => live.unless_cancelled(work).await,
        None => Some(work.await),
    }
}

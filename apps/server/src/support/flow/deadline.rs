//! 모델 호출의 시간 제한: 대화가 부르는 모든 호출(위기 판정, 발화, 리포트)을 감싸 응답 없는 모델에 무기한 걸리지 않게 한다.
//!
//! `generate` 는 호출 전체에, `stream` 은 조각과 조각 사이(첫 조각 전 포함)에 제한을 둔다. 넘기면 종류만 로그에 남기고
//! `ApiError::Internal` 이다. 위기 판정이 제한을 넘기면 `safety::assess_risk` 가 키워드 결과로 대신한다(ADR-0004).

use std::time::Duration;

use futures_util::future::BoxFuture;
use futures_util::stream::{self, StreamExt};

use crate::llm::{GenerationRequest, SharedTextModel, TextModel, TextStream};
use crate::shared::ApiError;

/// `generate` 한 번의 상한. 리포트(900 토큰)를 CPU 의 로컬 모델(초당 10 토큰 안팎)이 쓰고 모델을 처음 올리는 시간까지
/// 넉넉히 덮는 값이다. 정상 호출을 끊지 않고 걸린 연결만 끊는 것이 목적이다.
pub const GENERATE_LIMIT: Duration = Duration::from_secs(120);
/// 스트림의 조각 사이 유휴 상한. 첫 조각 전에는 모델을 메모리에 올리는 시간이 들어가므로 짧게 잡지 않는다.
pub const STREAM_IDLE_LIMIT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CallLimits {
    pub generate: Duration,
    pub stream_idle: Duration,
}

impl Default for CallLimits {
    fn default() -> CallLimits {
        CallLimits {
            generate: GENERATE_LIMIT,
            stream_idle: STREAM_IDLE_LIMIT,
        }
    }
}

/// 시간 제한을 두른 모델. 안쪽 모델은 그대로 부른다.
pub struct Deadlined {
    inner: SharedTextModel,
    limits: CallLimits,
}

impl Deadlined {
    pub fn new(inner: SharedTextModel, limits: CallLimits) -> Deadlined {
        Deadlined { inner, limits }
    }
}

impl TextModel for Deadlined {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        let limit = self.limits.generate;
        let call = self.inner.generate(request);
        Box::pin(async move {
            match tokio::time::timeout(limit, call).await {
                Ok(result) => result,
                Err(_) => {
                    tracing::warn!(
                        call = "generate",
                        limit_secs = limit.as_secs_f64(),
                        "model call timed out"
                    );
                    Err(ApiError::Internal)
                }
            }
        })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        let idle = self.limits.stream_idle;
        let chunks = self.inner.stream(request);
        // 상태: 남은 조각들(오류나 제한을 넘기면 `None` 으로 끝낸다).
        Box::pin(stream::unfold(Some(chunks), move |state| async move {
            let mut chunks = state?;
            match tokio::time::timeout(idle, chunks.next()).await {
                Ok(Some(Ok(text))) => Some((Ok(text), Some(chunks))),
                Ok(Some(Err(error))) => Some((Err(error), None)),
                Ok(None) => None,
                Err(_) => {
                    tracing::warn!(
                        call = "stream",
                        limit_secs = idle.as_secs_f64(),
                        "model stream went idle past its limit"
                    );
                    Some((Err(ApiError::Internal), None))
                }
            }
        }))
    }
}

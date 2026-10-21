//! 모델 호출의 시간 제한: 대화가 부르는 모든 호출(위기 판정, 발화, 리포트)을 감싸 응답 없는 모델에 무기한 걸리지 않게 한다.
//!
//! `generate` 는 호출 전체에, `stream` 은 조각과 조각 사이(첫 조각 전 포함)에 제한을 둔다. 넘기면 종류만 로그에 남기고
//! `ApiError::Internal` 이다. 위기 판정이 제한을 넘기면 `safety::assess_risk_verdict` 가 키워드 결과로 대신한다(ADR-0004).
//! 발화는 `_within` 으로 불러 제한을 넘긴 것과 모델의 오류를 가른다(실패한 턴의 종류, ADR-0028).

use std::time::Duration;

use futures_util::future::BoxFuture;
use futures_util::stream::{self, BoxStream, StreamExt};

use crate::llm::{GenerationRequest, SharedTextModel, TextModel, TextStream};
use crate::shared::ApiError;
use crate::support::session::TurnErrorKind;

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

/// 제한을 두른 호출의 실패: 제한을 넘겼거나, 모델이 오류를 냈다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CallFailure {
    TimedOut,
    Failed(ApiError),
}

impl CallFailure {
    /// 실패한 턴에 적는 종류.
    pub fn kind(&self) -> TurnErrorKind {
        match self {
            CallFailure::TimedOut => TurnErrorKind::Timeout,
            CallFailure::Failed(_) => TurnErrorKind::Provider,
        }
    }

    /// HTTP 겉의 오류. 제한을 넘긴 것도 500 이다.
    pub fn into_error(self) -> ApiError {
        match self {
            CallFailure::TimedOut => ApiError::Internal,
            CallFailure::Failed(error) => error,
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

impl Deadlined {
    /// 호출 전체에 제한을 둔 `generate`.
    pub fn generate_within(
        &self,
        request: GenerationRequest,
    ) -> BoxFuture<'_, Result<String, CallFailure>> {
        let limit = self.limits.generate;
        let call = self.inner.generate(request);
        Box::pin(async move {
            match tokio::time::timeout(limit, call).await {
                Ok(result) => result.map_err(CallFailure::Failed),
                Err(_) => {
                    tracing::warn!(
                        call = "generate",
                        limit_secs = limit.as_secs_f64(),
                        "model call timed out"
                    );
                    Err(CallFailure::TimedOut)
                }
            }
        })
    }

    /// 조각 사이에 제한을 둔 `stream`. 실패하면 그 항목으로 끝난다.
    pub fn stream_within(
        &self,
        request: GenerationRequest,
    ) -> BoxStream<'static, Result<String, CallFailure>> {
        let idle = self.limits.stream_idle;
        let chunks = self.inner.stream(request);
        // 상태: 남은 조각들(오류나 제한을 넘기면 `None` 으로 끝낸다).
        Box::pin(stream::unfold(Some(chunks), move |state| async move {
            let mut chunks = state?;
            match tokio::time::timeout(idle, chunks.next()).await {
                Ok(Some(Ok(text))) => Some((Ok(text), Some(chunks))),
                Ok(Some(Err(error))) => Some((Err(CallFailure::Failed(error)), None)),
                Ok(None) => None,
                Err(_) => {
                    tracing::warn!(
                        call = "stream",
                        limit_secs = idle.as_secs_f64(),
                        "model stream went idle past its limit"
                    );
                    Some((Err(CallFailure::TimedOut), None))
                }
            }
        }))
    }
}

impl TextModel for Deadlined {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        let call = self.generate_within(request);
        Box::pin(async move { call.await.map_err(CallFailure::into_error) })
    }

    fn stream(&self, request: GenerationRequest) -> TextStream {
        Box::pin(
            self.stream_within(request)
                .map(|chunk| chunk.map_err(CallFailure::into_error)),
        )
    }
}

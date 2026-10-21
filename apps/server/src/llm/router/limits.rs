//! 공급자 호출의 시간 제한 값: 응답 없는 모델에 무기한 걸리지 않게 라우터가 호출마다 두르는 상한.
//!
//! `generate` 는 호출 전체에, `stream` 은 이벤트와 이벤트 사이(첫 이벤트 전 포함)에 둔다. 넘기면 라우터가 `timeout` 으로 적고
//! `ApiError::Internal` 을 낸다. 위기 판정이 제한을 넘기면 `safety` 가 키워드 결과로 대신한다(ADR-0004).

use std::time::Duration;

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

/// 제한을 넘긴 호출의 종류와 한도만 남긴다. 본문은 싣지 않는다.
pub fn log_timeout(call: &'static str, limit: Duration) {
    tracing::warn!(
        call,
        limit_secs = limit.as_secs_f64(),
        "model call timed out"
    );
}

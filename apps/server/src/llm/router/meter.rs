//! 호출 한 번의 계량기: 시작부터 시간을 재고, 끝날 때 기록 하나를 싱크에 남긴다. 끝을 알리기 전에 버려지면 취소로 남긴다.

use std::time::{Duration, Instant};

use chrono::Utc;

use crate::llm::{
    CallContext, CallErrorKind, CallOutcome, CallRecord, LlmProvider, SharedUsageSink, TokenUsage,
};

pub struct CallMeter {
    sink: SharedUsageSink,
    provider: LlmProvider,
    model: String,
    context: CallContext,
    started: Instant,
    first_token: Option<Duration>,
    tokens: Option<TokenUsage>,
    finished: bool,
}

impl CallMeter {
    /// 지금부터 잰다.
    pub fn start(
        sink: SharedUsageSink,
        provider: LlmProvider,
        model: &str,
        context: CallContext,
    ) -> CallMeter {
        CallMeter {
            sink,
            provider,
            model: model.to_owned(),
            context,
            started: Instant::now(),
            first_token: None,
            tokens: None,
            finished: false,
        }
    }

    /// 글 조각이 나왔다. 첫 조각의 시간만 남는다.
    pub fn token(&mut self) {
        if self.first_token.is_none() {
            self.first_token = Some(self.started.elapsed());
        }
    }

    /// 공급자가 알려 준 토큰 수.
    pub fn usage(&mut self, tokens: TokenUsage) {
        self.tokens = Some(tokens);
    }

    /// 성공으로 끝낸다. 토큰은 알려 준 것이 있을 때만 싣는다.
    pub fn succeed(mut self) {
        self.finish(CallOutcome::Ok);
    }

    /// 실패로 끝낸다. 토큰은 싣지 않는다.
    pub fn fail(mut self, kind: CallErrorKind) {
        self.tokens = None;
        self.finish(CallOutcome::Error(kind));
    }

    fn finish(&mut self, outcome: CallOutcome) {
        if self.finished {
            return;
        }
        self.finished = true;
        self.sink.record(CallRecord {
            provider: self.provider,
            model: self.model.clone(),
            purpose: self.context.purpose,
            prompt_version: self.context.prompt_version.to_owned(),
            session_id: self.context.session_id.take(),
            input_tokens: self.tokens.map(|tokens| tokens.input_tokens),
            output_tokens: self.tokens.map(|tokens| tokens.output_tokens),
            duration_ms: millis(self.started.elapsed()),
            first_token_ms: self.first_token.map(millis),
            outcome,
            at: Utc::now(),
        });
    }
}

impl Drop for CallMeter {
    /// 끝을 알리지 않고 버려졌다: 부른 쪽이 기다리기를 멈췄다.
    fn drop(&mut self) {
        if !self.finished {
            self.tokens = None;
            self.finish(CallOutcome::Error(CallErrorKind::Cancelled));
        }
    }
}

/// 밀리초. `u32` 를 넘는 시간(약 49일)은 끝 값으로 둔다.
fn millis(elapsed: Duration) -> u32 {
    u32::try_from(elapsed.as_millis()).unwrap_or(u32::MAX)
}

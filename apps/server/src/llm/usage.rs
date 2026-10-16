//! 사용량 기록: 호출 한 번이 쓴 토큰과 비용(`UsageRecord`)을 적는 곳(`UsageSink` trait)과 메모리 구현.
//!
//! 메모리 구현은 프로세스가 사는 동안만 갖고, 적을 때 디버그 로그를 남긴다. 로그에 본문은 싣지 않는다.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use chrono::{DateTime, Utc};

use super::LlmProvider;

/// 끝난 호출 한 번의 토큰과 비용.
#[derive(Debug, Clone, PartialEq)]
pub struct UsageRecord {
    pub provider: LlmProvider,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cost_usd: f64,
    /// 호출이 끝난 시각.
    pub at: DateTime<Utc>,
}

/// 사용량을 적는 곳.
pub trait UsageSink: Send + Sync {
    fn record(&self, record: UsageRecord);
}

pub type SharedUsageSink = Arc<dyn UsageSink>;

/// 프로세스 메모리에 적는 싱크.
#[derive(Debug, Default)]
pub struct InMemoryUsageSink {
    records: Mutex<Vec<UsageRecord>>,
}

impl InMemoryUsageSink {
    /// 지금까지 적은 것(적은 순서).
    pub fn list(&self) -> Vec<UsageRecord> {
        self.records().clone()
    }

    /// 적다가 다른 스레드가 멈췄어도 쌓인 기록은 그대로 쓴다.
    fn records(&self) -> MutexGuard<'_, Vec<UsageRecord>> {
        self.records.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl UsageSink for InMemoryUsageSink {
    fn record(&self, record: UsageRecord) {
        tracing::debug!(
            provider = record.provider.as_str(),
            model = %record.model,
            input_tokens = record.input_tokens,
            output_tokens = record.output_tokens,
            cost_usd = record.cost_usd,
            "model usage"
        );
        self.records().push(record);
    }
}

#[cfg(test)]
mod tests;

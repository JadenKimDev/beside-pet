use chrono::{TimeZone, Utc};

use super::{InMemoryUsageSink, UsageRecord, UsageSink};
use crate::llm::LlmProvider;

fn record(model: &str, input: u32) -> UsageRecord {
    UsageRecord {
        provider: LlmProvider::Anthropic,
        model: model.to_owned(),
        input_tokens: input,
        output_tokens: 7,
        cost_usd: 0.25,
        at: Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap(),
    }
}

#[test]
fn 빈_싱크는_아무것도_없다() {
    assert!(InMemoryUsageSink::default().list().is_empty());
}

#[test]
fn 적은_순서대로_돌려준다() {
    let sink = InMemoryUsageSink::default();
    sink.record(record("claude-haiku-4-5", 10));
    sink.record(record("claude-sonnet-5", 20));
    assert_eq!(
        sink.list(),
        vec![
            record("claude-haiku-4-5", 10),
            record("claude-sonnet-5", 20)
        ]
    );
}

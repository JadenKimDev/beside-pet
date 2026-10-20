use chrono::{TimeZone, Utc};

use super::{CallErrorKind, CallOutcome, CallRecord, InMemoryUsageSink, UsageSink};
use crate::llm::{CallPurpose, LlmProvider};

fn record(model: &str, input: Option<u32>) -> CallRecord {
    CallRecord {
        provider: LlmProvider::Anthropic,
        model: model.to_owned(),
        purpose: CallPurpose::Reply,
        prompt_version: "0.1.0".to_owned(),
        session_id: Some("session-fake".to_owned()),
        input_tokens: input,
        output_tokens: input.map(|_| 7),
        duration_ms: 420,
        first_token_ms: None,
        outcome: if input.is_some() {
            CallOutcome::Ok
        } else {
            CallOutcome::Error(CallErrorKind::Provider)
        },
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
    sink.record(record("claude-haiku-4-5", Some(10)));
    sink.record(record("gemma4", None));
    assert_eq!(
        sink.list(),
        vec![record("claude-haiku-4-5", Some(10)), record("gemma4", None)]
    );
}

#[test]
fn 결과는_ok_와_error_로_적고_오류_종류는_error_일_때만_있다() {
    assert_eq!(CallOutcome::Ok.as_str(), "ok");
    assert_eq!(CallOutcome::Ok.error_kind(), None);
    let failed = CallOutcome::Error(CallErrorKind::Cancelled);
    assert_eq!(failed.as_str(), "error");
    assert_eq!(failed.error_kind(), Some(CallErrorKind::Cancelled));
}

#[test]
fn 오류_종류는_snake_case_낱말이다() {
    assert_eq!(CallErrorKind::Provider.as_str(), "provider");
    assert_eq!(CallErrorKind::Unavailable.as_str(), "unavailable");
    assert_eq!(CallErrorKind::Cancelled.as_str(), "cancelled");
}

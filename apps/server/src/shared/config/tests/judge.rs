//! 답 판정기 설정(`REPLY_JUDGE`, `SYSTEMONE_URL`, `REPLY_CANDIDATES`, `REPLY_JUDGE_THRESHOLD`).

use super::{Config, lookup};
use crate::shared::ConfigError;
use crate::shared::config::ReplyJudgeKind;

const DB: (&str, &str) = ("DATABASE_URL", "postgres://u:p@h/db");

fn with(pairs: &[(&str, &str)]) -> Result<Config, ConfigError> {
    let mut all = vec![DB];
    all.extend_from_slice(pairs);
    Config::from_lookup(lookup(&all))
}

#[test]
fn 기본은_판정기_끔_후보_하나_임계값_절반이다() {
    let config = with(&[]).unwrap();
    assert_eq!(config.judge.kind, ReplyJudgeKind::Off);
    assert_eq!(config.judge.systemone_url, None);
    assert_eq!(config.judge.candidates, 1);
    assert_eq!(config.judge.threshold, 0.5);
}

#[test]
fn 빈_값은_기본값이다() {
    let config = with(&[
        ("REPLY_JUDGE", " "),
        ("SYSTEMONE_URL", ""),
        ("REPLY_CANDIDATES", ""),
        ("REPLY_JUDGE_THRESHOLD", "  "),
    ])
    .unwrap();
    assert_eq!(config.judge.kind, ReplyJudgeKind::Off);
    assert_eq!(config.judge.systemone_url, None);
    assert_eq!(config.judge.candidates, 1);
    assert_eq!(config.judge.threshold, 0.5);
}

#[test]
fn 판정기_종류를_읽는다() {
    for (raw, kind) in [
        ("off", ReplyJudgeKind::Off),
        ("haiku", ReplyJudgeKind::Haiku),
        ("systemone", ReplyJudgeKind::SystemOne),
        (" systemone ", ReplyJudgeKind::SystemOne),
    ] {
        let config = with(&[("REPLY_JUDGE", raw)]).unwrap();
        assert_eq!(config.judge.kind, kind, "{raw:?}");
    }
}

#[test]
fn 모르는_판정기는_기동하지_않는다() {
    for raw in ["laya", "Haiku", "enabled", "true"] {
        let err = with(&[("REPLY_JUDGE", raw)]).unwrap_err().to_string();
        assert!(err.contains("REPLY_JUDGE"), "{err}");
        assert!(!err.contains(raw), "문구에 값을 싣지 않는다: {err}");
    }
}

#[test]
fn systemone_주소를_읽는다() {
    let config = with(&[
        ("REPLY_JUDGE", "systemone"),
        ("SYSTEMONE_URL", " http://127.0.0.1:8765 "),
    ])
    .unwrap();
    assert_eq!(
        config.judge.systemone_url.as_deref(),
        Some("http://127.0.0.1:8765")
    );
}

#[test]
fn 후보는_하나에서_셋까지다() {
    for (raw, n) in [("1", 1), ("2", 2), ("3", 3), (" 3 ", 3)] {
        let config = with(&[("REPLY_CANDIDATES", raw)]).unwrap();
        assert_eq!(config.judge.candidates, n, "{raw:?}");
    }
    for raw in ["0", "4", "-1", "two", "1.5", "300"] {
        let err = with(&[("REPLY_CANDIDATES", raw)]).unwrap_err().to_string();
        assert!(err.contains("REPLY_CANDIDATES"), "{raw:?}: {err}");
    }
}

#[test]
fn 임계값은_0에서_1까지다() {
    for (raw, value) in [("0", 0.0), ("1", 1.0), ("0.75", 0.75), (" 0.3 ", 0.3)] {
        let config = with(&[("REPLY_JUDGE_THRESHOLD", raw)]).unwrap();
        assert_eq!(config.judge.threshold, value, "{raw:?}");
    }
    for raw in ["-0.1", "1.01", "NaN", "inf", "half"] {
        let err = with(&[("REPLY_JUDGE_THRESHOLD", raw)])
            .unwrap_err()
            .to_string();
        assert!(err.contains("REPLY_JUDGE_THRESHOLD"), "{raw:?}: {err}");
    }
}

#[test]
fn 디버그_표시에_판정기_설정이_있다() {
    let config = with(&[("REPLY_JUDGE", "systemone"), ("REPLY_CANDIDATES", "2")]).unwrap();
    let text = format!("{config:?}");
    assert!(text.contains("SystemOne"), "{text}");
    assert!(text.contains("candidates: 2"), "{text}");
}

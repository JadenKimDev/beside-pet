use std::collections::BTreeMap;
use std::time::Duration;

use axum::http::StatusCode;
use serde_json::json;

use super::fake_systemone::{FakeSystemOne, closed_base_url};
use super::{HARNESS_CRITERIA, HARNESS_INSTRUCTIONS, sample_request};
use crate::llm::judge::systemone::is_loopback;
use crate::llm::judge::{JudgeFailure, JudgeOutcome, SystemOneJudge};

const LIMIT: Duration = Duration::from_secs(1);

/// 지어낸 정상 응답(`laya serve` 의 모양).
fn answer(choice: &str, probabilities: serde_json::Value) -> String {
    json!({
        "model": "fake-laya",
        "answers": { "kind": { "choice": choice, "probabilities": probabilities, "confidence": 0.7 } },
        "usage": { "latency_ms": 3 }
    })
    .to_string()
}

fn three_probabilities() -> serde_json::Value {
    json!({ "generic_comfort": 0.75, "specific_reflection": 0.2, "question": 0.05 })
}

#[tokio::test]
async fn 정상_응답에서_라벨과_라벨마다의_확률을_낸다() {
    let server = FakeSystemOne::ok(&answer("generic_comfort", three_probabilities())).await;
    let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);

    let outcome = judge.judge(sample_request()).await;

    let expected: BTreeMap<&str, f32> = [
        ("generic_comfort", 0.75),
        ("specific_reflection", 0.2),
        ("question", 0.05),
    ]
    .into_iter()
    .collect();
    assert_eq!(
        outcome,
        Ok(JudgeOutcome {
            label: "generic_comfort",
            probabilities: Some(expected),
        })
    );
}

#[tokio::test]
async fn 요청은_평가_하네스와_같은_choice_질문_하나다() {
    let server = FakeSystemOne::ok(&answer("question", three_probabilities())).await;
    let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);

    judge.judge(sample_request()).await.unwrap();

    let request = server.only_request();
    assert_eq!(request.method, "POST");
    assert_eq!(request.path, "/v1/systemone");
    let criteria: serde_json::Map<String, serde_json::Value> = HARNESS_CRITERIA
        .iter()
        .map(|(label, text)| ((*label).to_owned(), json!(text)))
        .collect();
    assert_eq!(
        request.body,
        json!({
            "state": {
                "user_turns": ["지어낸 첫 말", "지어낸 둘째 말\n두 줄로"],
                "reply": "지어낸 답 하나"
            },
            "questions": {
                "kind": { "type": "choice", "instructions": HARNESS_INSTRUCTIONS, "criteria": criteria }
            }
        })
    );
    // 기준의 차례도 하네스와 같다(위기 고정 문구는 묻지 않는다).
    let keys: Vec<&str> = request.body["questions"]["kind"]["criteria"]
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, ["generic_comfort", "specific_reflection", "question"]);
}

#[tokio::test]
async fn 주소_끝의_빗금과_경로는_한_번만_붙는다() {
    for suffix in ["/", "/v1/systemone", "/v1/systemone/"] {
        let server = FakeSystemOne::ok(&answer("question", three_probabilities())).await;
        let judge = SystemOneJudge::new(format!("{}{suffix}", server.base_url), LIMIT);
        judge.judge(sample_request()).await.unwrap();
        assert_eq!(server.only_request().path, "/v1/systemone", "{suffix}");
    }
}

#[tokio::test]
async fn 확률이_없으면_라벨만_낸다() {
    let body = json!({ "answers": { "kind": { "choice": "specific_reflection" } } }).to_string();
    let server = FakeSystemOne::ok(&body).await;
    let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);

    assert_eq!(
        judge.judge(sample_request()).await,
        Ok(JudgeOutcome {
            label: "specific_reflection",
            probabilities: None,
        })
    );
}

#[tokio::test]
async fn 모르는_라벨의_확률은_버린다() {
    let probabilities = json!({ "generic_comfort": 0.6, "specific_reflection": 0.3, "question": 0.05, "crisis_fixed": 0.05 });
    let server = FakeSystemOne::ok(&answer("generic_comfort", probabilities)).await;
    let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);

    let outcome = judge.judge(sample_request()).await.unwrap();
    let keys: Vec<&str> = outcome.probabilities.unwrap().keys().copied().collect();
    assert_eq!(keys, ["generic_comfort", "question", "specific_reflection"]);
}

#[tokio::test]
async fn 시간_제한을_넘기면_timeout_이다() {
    let server = FakeSystemOne::start(
        StatusCode::OK,
        &answer("question", three_probabilities()),
        Duration::from_millis(600),
    )
    .await;
    let judge = SystemOneJudge::new(server.base_url.clone(), Duration::from_millis(100));

    let started = std::time::Instant::now();
    assert_eq!(
        judge.judge(sample_request()).await,
        Err(JudgeFailure::Timeout)
    );
    assert!(started.elapsed() < Duration::from_millis(500));
}

#[tokio::test]
async fn 모양이_다른_응답은_bad_response_다() {
    let bodies = [
        "not json".to_owned(),
        json!({ "model": "fake-laya" }).to_string(),
        json!({ "answers": { "other": { "choice": "question" } } }).to_string(),
        json!({ "answers": { "kind": { "probabilities": three_probabilities() } } }).to_string(),
        answer("crisis_fixed", three_probabilities()),
        answer("Question", three_probabilities()),
        answer(
            "question",
            json!({ "generic_comfort": 1.5, "specific_reflection": 0.0, "question": 0.0 }),
        ),
        answer(
            "question",
            json!({ "generic_comfort": "high", "specific_reflection": 0.0, "question": 0.0 }),
        ),
    ];
    for body in bodies {
        let server = FakeSystemOne::ok(&body).await;
        let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);
        assert_eq!(
            judge.judge(sample_request()).await,
            Err(JudgeFailure::BadResponse),
            "{body}"
        );
    }
}

#[tokio::test]
async fn 오류_상태와_닿지_못한_서버는_unavailable_이다() {
    let server =
        FakeSystemOne::start(StatusCode::INTERNAL_SERVER_ERROR, "{}", Duration::ZERO).await;
    let judge = SystemOneJudge::new(server.base_url.clone(), LIMIT);
    assert_eq!(
        judge.judge(sample_request()).await,
        Err(JudgeFailure::Unavailable)
    );

    let judge = SystemOneJudge::new(closed_base_url().await, LIMIT);
    assert_eq!(
        judge.judge(sample_request()).await,
        Err(JudgeFailure::Unavailable)
    );
}

#[test]
fn 루프백_주소만_루프백이다() {
    for url in [
        "http://127.0.0.1:8090",
        "http://127.3.4.5",
        "http://localhost:8090/",
        "http://LOCALHOST",
        "http://[::1]:8090",
    ] {
        assert!(is_loopback(url), "{url}");
    }
    for url in [
        "http://10.0.0.5:8090",
        "https://jev.example.com",
        "http://localhost.example.com",
        "http://[2001:db8::1]",
        "not a url",
        "",
    ] {
        assert!(!is_loopback(url), "{url}");
    }
}

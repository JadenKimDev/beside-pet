//! 테이블과 뷰가 있고, 호출 기록에 본문 칸이 없고, 지금 단가 넷이 들어 있다.

use sqlx::Row;

use crate::db::TestSchema;

async fn columns(schema: &TestSchema, relation: &str) -> Vec<String> {
    sqlx::query(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position",
    )
    .bind(schema.name())
    .bind(relation)
    .fetch_all(&schema.pool)
    .await
    .unwrap()
    .iter()
    .map(|row| row.get::<String, _>(0))
    .collect()
}

#[tokio::test]
async fn llm_calls_has_the_fact_columns_and_no_text() {
    let schema = TestSchema::open().await;
    let got = columns(&schema, "llm_calls").await;
    let want = [
        "id",
        "at",
        "provider",
        "model",
        "purpose",
        "prompt_version",
        "session_id",
        "input_tokens",
        "output_tokens",
        "duration_ms",
        "first_token_ms",
        "outcome",
        "error_kind",
    ];
    assert_eq!(got, want);
    for banned in ["prompt", "response", "text", "body", "content", "cost_usd"] {
        assert!(!got.iter().any(|c| c == banned), "{banned} 칸이 있다");
    }
    schema.close().await;
}

#[tokio::test]
async fn views_have_their_columns() {
    let schema = TestSchema::open().await;
    let costs = columns(&schema, "llm_call_costs").await;
    assert_eq!(costs.last().map(String::as_str), Some("cost_usd"));
    assert_eq!(costs.len(), 14);
    assert_eq!(
        columns(&schema, "llm_calls_daily").await,
        [
            "date",
            "provider",
            "model",
            "calls",
            "errors",
            "input_tokens",
            "output_tokens",
            "cost_usd"
        ]
    );
    assert_eq!(
        columns(&schema, "conversations_daily").await,
        [
            "date",
            "sessions",
            "turns",
            "crisis_keyword",
            "crisis_model"
        ]
    );
    assert_eq!(
        columns(&schema, "model_prices").await,
        [
            "provider",
            "model",
            "input_usd_per_mtok",
            "output_usd_per_mtok",
            "effective_from"
        ]
    );
    schema.close().await;
}

#[tokio::test]
async fn model_prices_hold_the_current_four() {
    let schema = TestSchema::open().await;
    let rows = sqlx::query(
        "SELECT provider || '/' || model, input_usd_per_mtok::text, output_usd_per_mtok::text, effective_from::text \
         FROM model_prices ORDER BY provider, model",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, String, String, String)> = rows
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3)))
        .collect();
    let row = |m: &str, i: &str, o: &str| {
        (
            m.to_owned(),
            i.to_owned(),
            o.to_owned(),
            "2026-10-16".to_owned(),
        )
    };
    assert_eq!(
        got,
        [
            row("anthropic/claude-haiku-4-5", "1.00", "5.00"),
            row("anthropic/claude-haiku-5-5", "0.10", "0.50"),
            row("anthropic/claude-opus-4-8", "5.00", "25.00"),
            row("anthropic/claude-sonnet-5", "3.00", "15.00"),
        ]
    );
    schema.close().await;
}

#[tokio::test]
async fn purpose_and_outcome_are_closed_sets() {
    let schema = TestSchema::open().await;
    for (purpose, outcome) in [("summary", "ok"), ("reply", "timeout")] {
        let result = sqlx::query(
            "INSERT INTO llm_calls (id, at, provider, model, purpose, prompt_version, duration_ms, outcome) \
             VALUES ('call-bad', now(), 'anthropic', 'claude-haiku-5-5', $1, '0.1.0', 10, $2)",
        )
        .bind(purpose)
        .bind(outcome)
        .execute(&schema.pool)
        .await;
        assert!(result.is_err(), "{purpose}/{outcome} 가 들어갔다");
    }
    schema.close().await;
}

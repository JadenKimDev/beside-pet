//! `llm_call_costs`: 호출 시각에 유효한 가장 최근 단가 × 토큰 / 1,000,000. 단가가 없거나 토큰이 비면 0.

use sqlx::Row;

use crate::db::TestSchema;

/// 지어낸 호출 하나를 넣는 문장.
pub(crate) fn call(
    id: &str,
    at: &str,
    provider: &str,
    model: &str,
    tokens: (Option<i32>, Option<i32>),
) -> String {
    let n = |t: Option<i32>| t.map_or("NULL".to_owned(), |v| v.to_string());
    let outcome = if tokens.1.is_some() { "ok" } else { "error" };
    let kind = if outcome == "ok" {
        "NULL"
    } else {
        "'provider'"
    };
    format!(
        "INSERT INTO llm_calls (id, at, provider, model, purpose, prompt_version, session_id, \
         input_tokens, output_tokens, duration_ms, first_token_ms, outcome, error_kind) VALUES \
         ('{id}', '{at}', '{provider}', '{model}', 'reply', '0.1.0', 'sess-test-1', {}, {}, 1200, 300, '{outcome}', {kind})",
        n(tokens.0),
        n(tokens.1)
    )
}

async fn cost(schema: &TestSchema, id: &str) -> f64 {
    sqlx::query("SELECT cost_usd::float8 FROM llm_call_costs WHERE id = $1")
        .bind(id)
        .fetch_one(&schema.pool)
        .await
        .unwrap()
        .get(0)
}

fn close(got: f64, want: f64) {
    assert!((got - want).abs() < 1e-12, "got {got}, want {want}");
}

#[tokio::test]
async fn cost_is_tokens_times_the_price_in_effect() {
    let schema = TestSchema::open().await;
    // 지어낸 새 단가: 11월부터 haiku-5-5 가 두 배.
    schema
        .exec(
            "INSERT INTO model_prices (provider, model, input_usd_per_mtok, output_usd_per_mtok, effective_from) \
             VALUES ('anthropic', 'claude-haiku-5-5', 0.20, 1.00, '2026-11-01')",
        )
        .await;
    for sql in [
        call(
            "call-haiku",
            "2026-10-20T10:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(1000), Some(200)),
        ),
        call(
            "call-sonnet",
            "2026-10-20T11:00:00Z",
            "anthropic",
            "claude-sonnet-5",
            (Some(2_000_000), Some(100_000)),
        ),
        call(
            "call-haiku-nov",
            "2026-11-02T00:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(1000), Some(200)),
        ),
        call(
            "call-before",
            "2026-10-15T23:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(1000), Some(200)),
        ),
        call(
            "call-ollama",
            "2026-10-20T12:00:00Z",
            "ollama",
            "gemma4",
            (Some(5000), Some(800)),
        ),
        // 같은 모델 이름이라도 Ollama 로 부르면 Anthropic 단가를 매기지 않는다.
        call(
            "call-ollama-haiku",
            "2026-10-20T12:30:00Z",
            "ollama",
            "claude-haiku-4-5",
            (Some(5000), Some(800)),
        ),
        call(
            "call-failed",
            "2026-10-20T13:00:00Z",
            "anthropic",
            "claude-opus-4-8",
            (Some(900), None),
        ),
        call(
            "call-no-usage",
            "2026-10-20T14:00:00Z",
            "anthropic",
            "claude-opus-4-8",
            (None, None),
        ),
    ] {
        schema.exec(&sql).await;
    }
    close(
        cost(&schema, "call-haiku").await,
        1000.0 * 0.10 / 1e6 + 200.0 * 0.50 / 1e6,
    );
    close(cost(&schema, "call-sonnet").await, 6.0 + 1.5);
    close(
        cost(&schema, "call-haiku-nov").await,
        1000.0 * 0.20 / 1e6 + 200.0 * 1.00 / 1e6,
    );
    close(cost(&schema, "call-before").await, 0.0);
    close(cost(&schema, "call-ollama").await, 0.0);
    close(cost(&schema, "call-ollama-haiku").await, 0.0);
    close(cost(&schema, "call-failed").await, 900.0 * 5.0 / 1e6);
    close(cost(&schema, "call-no-usage").await, 0.0);

    // 뷰는 기록의 칸을 그대로 싣는다.
    let row = sqlx::query(
        "SELECT session_id::text, duration_ms, first_token_ms, outcome::text FROM llm_call_costs WHERE id = 'call-haiku'",
    )
    .fetch_one(&schema.pool)
    .await
    .unwrap();
    assert_eq!(row.get::<String, _>(0), "sess-test-1");
    assert_eq!(row.get::<i32, _>(1), 1200);
    assert_eq!(row.get::<i32, _>(2), 300);
    assert_eq!(row.get::<String, _>(3), "ok");
    schema.close().await;
}

//! 날짜별 집계 뷰: `llm_calls_daily`(UTC 날짜·공급자·모델), `conversations_daily`(시작한 대화, 사용자 턴, 위기).

use sqlx::Row;

use crate::costs::call as call_sql;
use crate::db::TestSchema;

#[tokio::test]
async fn llm_calls_daily_groups_by_utc_date_provider_and_model() {
    let schema = TestSchema::open().await;
    for sql in [
        // 서울 시각으로는 21일이지만 UTC 로는 20일이다.
        call_sql(
            "d-1",
            "2026-10-20T23:30:00+00:00",
            "anthropic",
            "claude-haiku-5-5",
            (Some(1000), Some(200)),
        ),
        call_sql(
            "d-2",
            "2026-10-20T01:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(3000), Some(400)),
        ),
        call_sql(
            "d-3",
            "2026-10-20T02:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(500), None),
        ),
        call_sql(
            "d-4",
            "2026-10-20T03:00:00Z",
            "ollama",
            "gemma4",
            (Some(700), Some(70)),
        ),
        call_sql(
            "d-5",
            "2026-10-21T00:00:00Z",
            "anthropic",
            "claude-haiku-5-5",
            (Some(10), Some(20)),
        ),
    ] {
        schema.exec(&sql).await;
    }
    let rows = sqlx::query(
        "SELECT date::text, provider::text, model::text, calls, errors, input_tokens, output_tokens, cost_usd::float8 \
         FROM llm_calls_daily ORDER BY date, provider, model",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, String, String, i64, i64, i64, i64)> = rows
        .iter()
        .map(|r| {
            (
                r.get(0),
                r.get(1),
                r.get(2),
                r.get(3),
                r.get(4),
                r.get(5),
                r.get(6),
            )
        })
        .collect();
    let s = |v: &str| v.to_owned();
    assert_eq!(
        got,
        [
            (
                s("2026-10-20"),
                s("anthropic"),
                s("claude-haiku-5-5"),
                3,
                1,
                4500,
                600
            ),
            (s("2026-10-20"), s("ollama"), s("gemma4"), 1, 0, 700, 70),
            (
                s("2026-10-21"),
                s("anthropic"),
                s("claude-haiku-5-5"),
                1,
                0,
                10,
                20
            ),
        ]
    );
    let costs: Vec<f64> = rows.iter().map(|r| r.get(7)).collect();
    let want = [
        4500.0 * 0.10 / 1e6 + 600.0 * 0.50 / 1e6,
        0.0,
        10.0 * 0.10 / 1e6 + 20.0 * 0.50 / 1e6,
    ];
    for (got, want) in costs.iter().zip(want) {
        assert!((got - want).abs() < 1e-12, "got {got}, want {want}");
    }
    schema.close().await;
}

#[tokio::test]
async fn conversations_daily_counts_sessions_user_turns_and_crises() {
    let schema = TestSchema::open().await;
    let session = |id: &str, at: &str| {
        format!(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile, created_at, updated_at) \
             VALUES ('{id}', 'acc-test-1', 1, 0, 1, false, '{{}}', '{at}', '{at}')"
        )
    };
    let message = |sid: &str, seq: i32, role: &str, at: &str| {
        format!(
            "INSERT INTO messages (session_id, seq, role, text, task, at) \
             VALUES ('{sid}', {seq}, '{role}', 'placeholder', 1, '{at}')"
        )
    };
    let analysis = |sid: &str, seq: i32, level: i32, by: &str, at: &str| {
        format!(
            "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
             from_task, to_task, advanced, retry_count, knowledge) \
             VALUES ('{sid}', {seq}, '{at}', 1, 'task', {level}, '{by}', 1, 1, false, 0, '[]')"
        )
    };
    for sql in [
        session("sess-test-a", "2026-10-18T09:00:00Z"),
        session("sess-test-b", "2026-10-18T10:00:00Z"),
        session("sess-test-c", "2026-10-19T10:00:00Z"),
        message("sess-test-a", 0, "assistant", "2026-10-18T09:00:01Z"),
        message("sess-test-a", 1, "user", "2026-10-18T09:01:00Z"),
        message("sess-test-a", 2, "assistant", "2026-10-18T09:01:05Z"),
        message("sess-test-a", 3, "user", "2026-10-19T08:00:00Z"),
        // 대화는 18일에 시작했지만 턴만 20일에 있다.
        message("sess-test-b", 0, "user", "2026-10-20T07:00:00Z"),
        analysis("sess-test-a", 0, 1, "none", "2026-10-18T09:01:00Z"),
        analysis("sess-test-a", 1, 3, "keyword", "2026-10-19T08:00:00Z"),
        analysis("sess-test-b", 0, 3, "model", "2026-10-20T07:00:00Z"),
        analysis("sess-test-c", 0, 3, "keyword", "2026-10-21T07:00:00Z"),
    ] {
        schema.exec(&sql).await;
    }
    let rows = sqlx::query(
        "SELECT date::text, sessions, turns, crisis_keyword, crisis_model FROM conversations_daily ORDER BY date",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, i64, i64, i64, i64)> = rows
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2), r.get(3), r.get(4)))
        .collect();
    let d = |v: &str| v.to_owned();
    assert_eq!(
        got,
        [
            (d("2026-10-18"), 2, 1, 0, 0),
            (d("2026-10-19"), 1, 1, 1, 0),
            (d("2026-10-20"), 0, 1, 0, 1),
            (d("2026-10-21"), 0, 0, 1, 0),
        ]
    );
    schema.close().await;
}

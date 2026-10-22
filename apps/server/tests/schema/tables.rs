//! 테이블과 뷰가 있고, 호출 기록과 턴에 본문 칸이 없고, 지금 단가 넷이 들어 있다.

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

#[tokio::test]
async fn accounts_has_a_nullable_tokens_valid_from() {
    let schema = TestSchema::open().await;
    let got = columns(&schema, "accounts").await;
    // #42 의 deleted_at 이 그 뒤에 붙는다(soft_delete.rs 가 본다).
    assert_eq!(&got[got.len() - 2..], ["tokens_valid_from", "deleted_at"]);
    let row = sqlx::query(
        "SELECT data_type::text, is_nullable::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = 'accounts' AND column_name = 'tokens_valid_from'",
    )
    .bind(schema.name())
    .fetch_one(&schema.pool)
    .await
    .unwrap();
    assert_eq!(row.get::<String, _>(0), "timestamp with time zone");
    assert_eq!(row.get::<String, _>(1), "YES");
    schema.close().await;
}

#[tokio::test]
async fn turns_has_the_fact_columns_and_no_text() {
    let schema = TestSchema::open().await;
    let got = columns(&schema, "turns").await;
    assert_eq!(
        got,
        [
            "id",
            "session_id",
            "status",
            "started_at",
            "finished_at",
            "error_kind"
        ]
    );
    for banned in ["text", "body", "content", "message", "duration_ms"] {
        assert!(!got.iter().any(|c| c == banned), "{banned} 칸이 있다");
    }
    assert_eq!(
        columns(&schema, "messages")
            .await
            .last()
            .map(String::as_str),
        Some("turn_id")
    );
    schema.close().await;
}

/// 지어낸 세션 하나를 넣는다.
async fn insert_session(schema: &TestSchema) {
    sqlx::query(
        "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile) \
         VALUES ('session-a', 'owner-a', 1, 0, 0, false, '{}'::jsonb)",
    )
    .execute(&schema.pool)
    .await
    .unwrap();
}

async fn insert_turn(
    schema: &TestSchema,
    id: &str,
    status: &str,
    finished: bool,
    error_kind: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO turns (id, session_id, status, started_at, finished_at, error_kind) \
         VALUES ($1, 'session-a', $2, now(), CASE WHEN $3 THEN now() END, $4)",
    )
    .bind(id)
    .bind(status)
    .bind(finished)
    .bind(error_kind)
    .execute(&schema.pool)
    .await
    .map(|_| ())
}

#[tokio::test]
async fn turn_status_and_error_kind_are_closed_and_consistent() {
    let schema = TestSchema::open().await;
    insert_session(&schema).await;
    for (id, status, finished, kind) in [
        ("turn-pending", "pending", false, None),
        ("turn-done", "done", true, None),
        ("turn-timeout", "failed", true, Some("timeout")),
        ("turn-provider", "failed", true, Some("provider")),
        ("turn-restart", "failed", true, Some("restart")),
    ] {
        insert_turn(&schema, id, status, finished, kind)
            .await
            .unwrap_or_else(|e| panic!("{status}/{kind:?} 가 들어가지 않았다: {e}"));
    }
    for (id, status, finished, kind) in [
        ("bad-status", "streaming", true, None),
        ("bad-kind", "failed", true, Some("cancelled")),
        ("pending-finished", "pending", true, None),
        ("done-unfinished", "done", false, None),
        ("failed-without-kind", "failed", true, None),
        ("done-with-kind", "done", true, Some("timeout")),
    ] {
        assert!(
            insert_turn(&schema, id, status, finished, kind)
                .await
                .is_err(),
            "{id} 가 들어갔다"
        );
    }
    schema.close().await;
}

async fn insert_message(
    schema: &TestSchema,
    seq: i32,
    turn_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO messages (session_id, seq, role, text, task, at, turn_id) \
         VALUES ('session-a', $1, 'assistant', '지어낸 인사', 1, now(), $2)",
    )
    .bind(seq)
    .bind(turn_id)
    .execute(&schema.pool)
    .await
    .map(|_| ())
}

#[tokio::test]
async fn messages_turn_id_is_optional_and_points_to_a_turn() {
    let schema = TestSchema::open().await;
    insert_session(&schema).await;
    insert_turn(&schema, "turn-a", "done", true, None)
        .await
        .unwrap();
    insert_message(&schema, 0, None)
        .await
        .expect("turn_id 없는 행이 들어가지 않았다");
    insert_message(&schema, 1, Some("turn-a"))
        .await
        .expect("turn_id 있는 행이 들어가지 않았다");
    assert!(
        insert_message(&schema, 2, Some("turn-missing"))
            .await
            .is_err(),
        "없는 턴을 가리켰다"
    );
    schema.close().await;
}

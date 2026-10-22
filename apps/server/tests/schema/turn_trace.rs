//! 턴 추적 칸(`turn_analyses.trace`): sandbox 에서만 채우는 jsonb, production 은 NULL.

use sqlx::Row;

use crate::db::TestSchema;

#[tokio::test]
async fn turn_analyses_has_nullable_jsonb_trace_column() {
    let schema = TestSchema::open().await;
    let row = sqlx::query(
        "SELECT data_type::text, is_nullable::text, column_default::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = 'turn_analyses' AND column_name = 'trace'",
    )
    .bind(schema.name())
    .fetch_optional(&schema.pool)
    .await
    .unwrap()
    .expect("turn_analyses 에 trace 칸이 없다");
    let got: (String, String, Option<String>) = (row.get(0), row.get(1), row.get(2));
    assert_eq!(got, ("jsonb".to_owned(), "YES".to_owned(), None));
    schema.close().await;
}

#[tokio::test]
async fn trace_is_null_unless_written_and_keeps_json() {
    let schema = TestSchema::open().await;
    let insert = |seq: i32, trace: &'static str| {
        format!(
            "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
             from_task, to_task, advanced, retry_count, knowledge{}) \
             VALUES ('sess-trace', {seq}, '2026-10-22T01:00:00Z', 1, 'task', 0, 'none', 1, 1, false, 0, '[]'{})",
            if trace.is_empty() { "" } else { ", trace" },
            if trace.is_empty() {
                String::new()
            } else {
                format!(", '{trace}'::jsonb")
            },
        )
    };
    schema.exec(&insert(0, "")).await;
    schema
        .exec(&insert(
            1,
            r#"{"blocks":[{"name":"persona","chars":120}],"style":{"short":true}}"#,
        ))
        .await;
    let rows = sqlx::query(
        "SELECT seq, trace IS NULL, trace->'blocks'->0->>'name' FROM turn_analyses \
         WHERE session_id = 'sess-trace' ORDER BY seq",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(i32, bool, Option<String>)> = rows
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2)))
        .collect();
    assert_eq!(
        got,
        [(0, true, None), (1, false, Some("persona".to_owned()))]
    );
    schema.close().await;
}

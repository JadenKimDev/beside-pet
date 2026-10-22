//! 소프트 삭제(#42)의 칸(`sessions.deleted_at`·`report_deleted_at`, `accounts.deleted_at`)과
//! 뷰 `current_memory` 가 살아 있는 세션의 사실만 내는 것. 지우고 되살려도 기억 행은 그대로다.

use sqlx::Row;

use crate::db::TestSchema;

/// 칸의 (타입, NULL 가능, 기본값).
async fn column(
    schema: &TestSchema,
    table: &str,
    column: &str,
) -> (String, String, Option<String>) {
    let row = sqlx::query(
        "SELECT data_type::text, is_nullable::text, column_default::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = $2 AND column_name = $3",
    )
    .bind(schema.name())
    .bind(table)
    .bind(column)
    .fetch_optional(&schema.pool)
    .await
    .unwrap()
    .unwrap_or_else(|| panic!("{table}.{column} 칸이 없다"));
    (row.get(0), row.get(1), row.get(2))
}

#[tokio::test]
async fn the_three_deleted_at_columns_are_nullable_timestamptz_without_default() {
    let schema = TestSchema::open().await;
    for (table, name) in [
        ("sessions", "deleted_at"),
        ("sessions", "report_deleted_at"),
        ("accounts", "deleted_at"),
    ] {
        assert_eq!(
            column(&schema, table, name).await,
            (
                "timestamp with time zone".to_owned(),
                "YES".to_owned(),
                None
            ),
            "{table}.{name}"
        );
    }
    schema.close().await;
}

#[tokio::test]
async fn existing_rows_stay_alive_after_the_columns_are_added() {
    let schema = TestSchema::open().await;
    schema
        .exec(
            "INSERT INTO accounts (id, username, password_hash, company, role, status, created_at) \
             VALUES ('acct-s', 'fixture-user', 'x', 'fixture-co', 'user', 'Active', now())",
        )
        .await;
    schema
        .exec(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile) \
             VALUES ('sess-s', 'acct-s', 1, 0, 0, false, '{}'::jsonb)",
        )
        .await;
    let row = sqlx::query(
        "SELECT s.deleted_at IS NULL, s.report_deleted_at IS NULL, a.deleted_at IS NULL \
         FROM sessions s JOIN accounts a ON a.id = s.owner_id WHERE s.id = 'sess-s'",
    )
    .fetch_one(&schema.pool)
    .await
    .unwrap();
    assert!(row.get::<bool, _>(0) && row.get::<bool, _>(1) && row.get::<bool, _>(2));
    schema.close().await;
}

async fn insert_session(schema: &TestSchema, id: &str) {
    schema
        .exec(&format!(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile) \
             VALUES ('{id}', 'owner-sd', 1, 0, 0, true, '{{}}'::jsonb)"
        ))
        .await;
}

async fn insert_note(schema: &TestSchema, id: &str, session: &str, said_at: &str) {
    schema
        .exec(&format!(
            "INSERT INTO memory_notes (id, owner_id, session_id, seq, kind, pet_id, text, extracted_by, said_at) \
             VALUES ('{id}', 'owner-sd', '{session}', 1, 'place', NULL, '공원에 갔다', 'rule', '{said_at}')"
        ))
        .await;
}

async fn current_ids(schema: &TestSchema) -> Vec<String> {
    sqlx::query("SELECT id FROM current_memory")
        .fetch_all(&schema.pool)
        .await
        .unwrap()
        .iter()
        .map(|r| r.get(0))
        .collect()
}

#[tokio::test]
async fn current_memory_hides_facts_of_a_deleted_session_until_it_is_restored() {
    let schema = TestSchema::open().await;
    insert_session(&schema, "sess-gone").await;
    insert_session(&schema, "sess-live").await;
    insert_note(&schema, "n-gone", "sess-gone", "2026-10-02T00:00:00Z").await;
    insert_note(&schema, "n-live", "sess-live", "2026-10-01T00:00:00Z").await;
    assert_eq!(current_ids(&schema).await, ["n-gone", "n-live"]);

    schema
        .exec("UPDATE sessions SET deleted_at = '2026-10-10T00:00:00Z' WHERE id = 'sess-gone'")
        .await;
    assert_eq!(current_ids(&schema).await, ["n-live"]);
    // 기억 행은 손대지 않는다.
    let rows = sqlx::query("SELECT count(*) FROM memory_notes")
        .fetch_one(&schema.pool)
        .await
        .unwrap()
        .get::<i64, _>(0);
    assert_eq!(rows, 2);

    // 리포트만 지운 세션의 사실은 그대로 나온다.
    schema
        .exec("UPDATE sessions SET report_deleted_at = now() WHERE id = 'sess-live'")
        .await;
    assert_eq!(current_ids(&schema).await, ["n-live"]);

    schema
        .exec("UPDATE sessions SET deleted_at = NULL WHERE id = 'sess-gone'")
        .await;
    assert_eq!(current_ids(&schema).await, ["n-gone", "n-live"]);
    schema.close().await;
}

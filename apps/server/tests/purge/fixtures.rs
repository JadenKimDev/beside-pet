//! 파기 테스트의 지어낸 행과 기동 파기 부르기. 기준 시각은 `NOW` 하나다.

use beside_pet_server::{identity, support};
use chrono::{DateTime, Utc};

use crate::db::TestSchema;

/// 파기를 부르는 시각.
pub const NOW: &str = "2026-10-22T00:00:00Z";
/// `NOW` 의 3개월 앞보다 이르다(파기 대상).
pub const LONG_AGO: &str = "2026-07-01T00:00:00Z";
/// `NOW` 의 3개월 안이다(남는다).
pub const RECENT: &str = "2026-09-30T00:00:00Z";

pub fn now() -> DateTime<Utc> {
    NOW.parse().unwrap()
}

/// 기동 때와 같은 조립으로 파기를 한 번 돌린다.
pub async fn purge(schema: &TestSchema) -> support::StartupPurge {
    let accounts = identity::suspended_accounts(schema.pool.clone());
    support::purge_on_startup(schema.pool.clone(), &*accounts, now())
        .await
        .expect("기동 파기가 실패했다")
}

/// `status` 와 `deleted_at`(SQL 식: `NULL` 이나 `'...'`)의 계정.
pub async fn account(schema: &TestSchema, id: &str, status: &str, deleted_at: &str) {
    schema
        .exec(&format!(
            "INSERT INTO accounts (id, username, password_hash, company, role, status, created_at, deleted_at) \
             VALUES ('{id}', 'fixture-{id}', 'x', 'fixture-co', 'user', '{status}', '2026-01-01T00:00:00Z', {deleted_at})"
        ))
        .await;
}

/// 리포트가 있는 세션과 메시지 하나, 턴 하나, 턴 분석 하나. 지운 시각 둘은 SQL 식이다.
pub async fn session(
    schema: &TestSchema,
    id: &str,
    owner: &str,
    deleted_at: &str,
    report_deleted_at: &str,
) {
    schema
        .exec(&format!(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile, report, \
             created_at, updated_at, deleted_at, report_deleted_at) \
             VALUES ('{id}', '{owner}', 1, 0, 0, true, '{{}}'::jsonb, '{{\"placeholder\": true}}'::jsonb, \
             '{RECENT}', '{RECENT}', {deleted_at}, {report_deleted_at})"
        ))
        .await;
    schema
        .exec(&format!(
            "INSERT INTO turns (id, session_id, status, started_at, finished_at) \
             VALUES ('turn-{id}', '{id}', 'done', '{RECENT}', '{RECENT}')"
        ))
        .await;
    schema
        .exec(&format!(
            "INSERT INTO messages (session_id, seq, role, text, task, at, turn_id) \
             VALUES ('{id}', 0, 'user', 'placeholder', 1, '{RECENT}', 'turn-{id}')"
        ))
        .await;
    schema
        .exec(&format!(
            "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
             from_task, to_task, advanced, retry_count, knowledge) \
             VALUES ('{id}', 0, '{RECENT}', 1, 'task', 0, 'keyword', 1, 1, false, 0, '[]')"
        ))
        .await;
}

/// 세션에서 나온 아이 하나와 사실 하나와 옵트아웃 하나.
pub async fn memory(schema: &TestSchema, session_id: &str, owner: &str) {
    schema
        .exec(&format!(
            "INSERT INTO pets (id, owner_id, name, status, source_session_id, said_at) \
             VALUES ('pet-{session_id}', '{owner}', 'placeholder', 'deceased', '{session_id}', '{RECENT}')"
        ))
        .await;
    schema
        .exec(&format!(
            "INSERT INTO memory_notes (id, owner_id, session_id, seq, kind, pet_id, text, extracted_by, said_at) \
             VALUES ('note-{session_id}', '{owner}', '{session_id}', 0, 'place', 'pet-{session_id}', 'placeholder', \
             'fixture', '{RECENT}')"
        ))
        .await;
    schema
        .exec(&format!(
            "INSERT INTO memory_optouts (owner_id, session_id, seq, at) VALUES ('{owner}', '{session_id}', 0, '{RECENT}')"
        ))
        .await;
}

/// `sql` 이 내는 수 하나.
pub async fn count(schema: &TestSchema, sql: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql.to_owned()))
        .fetch_one(&schema.pool)
        .await
        .unwrap_or_else(|e| panic!("{e}: {sql}"))
}

/// 세션 하나에 딸린 행 수: (세션, 메시지, 턴, 턴 분석, 아이, 사실, 옵트아웃).
pub async fn rows_of(schema: &TestSchema, session_id: &str) -> [i64; 7] {
    let mut counts = [0; 7];
    for (slot, table, column) in [
        (0, "sessions", "id"),
        (1, "messages", "session_id"),
        (2, "turns", "session_id"),
        (3, "turn_analyses", "session_id"),
        (4, "pets", "source_session_id"),
        (5, "memory_notes", "session_id"),
        (6, "memory_optouts", "session_id"),
    ] {
        counts[slot] = count(
            schema,
            &format!("SELECT count(*) FROM {table} WHERE {column} = '{session_id}'"),
        )
        .await;
    }
    counts
}

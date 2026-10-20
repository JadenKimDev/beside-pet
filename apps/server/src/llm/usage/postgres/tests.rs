//! Postgres 싱크의 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 스키마째 지운다. 값은 모두 지어낸 것이다.

use std::str::FromStr;

use chrono::{DateTime, TimeZone, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool, Row};

use super::PostgresUsageSink;
use crate::llm::{CallErrorKind, CallOutcome, CallPurpose, CallRecord, LlmProvider, UsageSink};
use crate::shared::{MIGRATOR, test_database_url};

/// 테스트 하나의 스키마. `pool` 은 그 스키마만 본다.
struct CallsSchema {
    root: PgPool,
    schema: String,
    pool: PgPool,
}

impl CallsSchema {
    async fn open() -> CallsSchema {
        let options = PgConnectOptions::from_str(&test_database_url())
            .expect("DATABASE_URL 이 postgres 주소가 아니다")
            .ssl_mode(PgSslMode::Disable);
        let root = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let schema = format!(
            "llm_calls_test_{}_{}_{}",
            std::process::id(),
            Utc::now().timestamp_micros(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        root.execute(AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
            .await
            .unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options.options([("search_path", schema.as_str())]))
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        CallsSchema { root, schema, pool }
    }

    async fn close(self) {
        self.pool.close().await;
        self.root
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA \"{}\" CASCADE",
                self.schema
            )))
            .await
            .unwrap();
    }
}

fn at() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 30, 15).unwrap()
}

fn ok_record() -> CallRecord {
    CallRecord {
        provider: LlmProvider::Anthropic,
        model: "claude-haiku-5-5".to_owned(),
        purpose: CallPurpose::Reply,
        prompt_version: "0.1.0".to_owned(),
        session_id: Some("session-fake-1".to_owned()),
        input_tokens: Some(1200),
        output_tokens: Some(85),
        duration_ms: 1830,
        first_token_ms: Some(410),
        outcome: CallOutcome::Ok,
        at: at(),
    }
}

fn error_record() -> CallRecord {
    CallRecord {
        provider: LlmProvider::Ollama,
        model: "fake-local-model".to_owned(),
        purpose: CallPurpose::Crisis,
        prompt_version: "0.2.1".to_owned(),
        session_id: None,
        input_tokens: None,
        output_tokens: None,
        duration_ms: 95,
        first_token_ms: None,
        outcome: CallOutcome::Error(CallErrorKind::Provider),
        at: at(),
    }
}

/// `llm_calls` 의 행 하나를 칸 그대로 읽은 것.
#[derive(Debug, PartialEq)]
struct Row13 {
    at: DateTime<Utc>,
    provider: String,
    model: String,
    purpose: String,
    prompt_version: String,
    session_id: Option<String>,
    input_tokens: Option<i32>,
    output_tokens: Option<i32>,
    duration_ms: i32,
    first_token_ms: Option<i32>,
    outcome: String,
    error_kind: Option<String>,
}

async fn rows(pool: &PgPool) -> Vec<(String, Row13)> {
    sqlx::query(
        "SELECT id, at, provider, model, purpose, prompt_version, session_id, input_tokens, \
         output_tokens, duration_ms, first_token_ms, outcome, error_kind FROM llm_calls ORDER BY duration_ms DESC",
    )
    .fetch_all(pool)
    .await
    .unwrap()
    .into_iter()
    .map(|row| {
        (
            row.get("id"),
            Row13 {
                at: row.get("at"),
                provider: row.get("provider"),
                model: row.get("model"),
                purpose: row.get("purpose"),
                prompt_version: row.get("prompt_version"),
                session_id: row.get("session_id"),
                input_tokens: row.get("input_tokens"),
                output_tokens: row.get("output_tokens"),
                duration_ms: row.get("duration_ms"),
                first_token_ms: row.get("first_token_ms"),
                outcome: row.get("outcome"),
                error_kind: row.get("error_kind"),
            },
        )
    })
    .collect()
}

#[tokio::test]
async fn 성공과_실패_기록이_칸_그대로_들어간다() {
    let db = CallsSchema::open().await;
    let sink = PostgresUsageSink::spawn(db.pool.clone());

    sink.record(ok_record());
    sink.record(error_record());
    sink.flush().await;

    let rows = rows(&db.pool).await;
    assert_eq!(rows.len(), 2);
    assert_eq!(
        rows[0].1,
        Row13 {
            at: at(),
            provider: "anthropic".to_owned(),
            model: "claude-haiku-5-5".to_owned(),
            purpose: "reply".to_owned(),
            prompt_version: "0.1.0".to_owned(),
            session_id: Some("session-fake-1".to_owned()),
            input_tokens: Some(1200),
            output_tokens: Some(85),
            duration_ms: 1830,
            first_token_ms: Some(410),
            outcome: "ok".to_owned(),
            error_kind: None,
        }
    );
    assert_eq!(
        rows[1].1,
        Row13 {
            at: at(),
            provider: "ollama".to_owned(),
            model: "fake-local-model".to_owned(),
            purpose: "crisis".to_owned(),
            prompt_version: "0.2.1".to_owned(),
            session_id: None,
            input_tokens: None,
            output_tokens: None,
            duration_ms: 95,
            first_token_ms: None,
            outcome: "error".to_owned(),
            error_kind: Some("provider".to_owned()),
        }
    );
    // id 는 싱크가 만든 uuid 이고 행마다 다르다.
    assert!(uuid::Uuid::parse_str(&rows[0].0).is_ok());
    assert_ne!(rows[0].0, rows[1].0);
    db.close().await;
}

#[tokio::test]
async fn 붙지_못하는_풀에서도_기록은_돌아오고_작업은_계속_받는다() {
    // 아무도 듣지 않는 루프백 포트. 붙으려 할 때 실패한다.
    let options = PgConnectOptions::from_str("postgres://fake:fake@127.0.0.1:1/fake")
        .unwrap()
        .ssl_mode(PgSslMode::Disable);
    let pool = PgPoolOptions::new()
        .acquire_timeout(std::time::Duration::from_millis(500))
        .connect_lazy_with(options);
    let sink = PostgresUsageSink::spawn(pool);

    sink.record(ok_record());
    sink.flush().await;
    sink.record(error_record());
    sink.flush().await;
    assert!(sink.is_running());
}

#[tokio::test]
async fn 닫힌_풀에서도_기록은_돌아오고_작업은_계속_받는다() {
    let closed = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(
            PgConnectOptions::from_str(&test_database_url())
                .unwrap()
                .ssl_mode(PgSslMode::Disable),
        )
        .await
        .unwrap();
    closed.close().await;
    let sink = PostgresUsageSink::spawn(closed);

    sink.record(ok_record());
    sink.flush().await;
    sink.record(ok_record());
    sink.flush().await;
    assert!(sink.is_running());
}

#[tokio::test]
async fn 채널이_차면_기록을_버리고_막지_않는다() {
    let db = CallsSchema::open().await;
    // 테스트는 한 스레드에서 돈다. 기다리지 않는 동안 쓰는 작업은 채널을 비우지 못한다.
    let sink = PostgresUsageSink::spawn_with_capacity(db.pool.clone(), 2);

    for _ in 0..50 {
        sink.record(ok_record());
    }
    sink.flush().await;

    assert_eq!(rows(&db.pool).await.len(), 2);
    assert!(sink.is_running());
    db.close().await;
}

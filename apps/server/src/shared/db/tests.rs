//! DB 를 쓰는 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마를 만들어 그 안에서 마이그레이션을 돌리고 끝나면 지운다.

use chrono::{DateTime, Utc};
use sqlx::postgres::PgPoolOptions;
use sqlx::{AssertSqlSafe, Executor, PgPool};

use super::{MIGRATOR, connect_options};
use crate::shared::config::test_database_url;
use crate::shared::to_iso;

struct Scratch {
    admin: PgPool,
    schema: String,
    pool: PgPool,
}

impl Scratch {
    async fn new() -> Scratch {
        let url = test_database_url();
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(connect_options(&url, false).unwrap())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let seq = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let schema = format!("test_{}_{nanos}_{seq}", std::process::id());
        admin
            .execute(AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
            .await
            .unwrap();
        let options = connect_options(&url, false)
            .unwrap()
            .options([("search_path", schema.as_str())]);
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .unwrap();
        Scratch {
            admin,
            schema,
            pool,
        }
    }

    async fn drop(self) {
        self.pool.close().await;
        self.admin
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA \"{}\" CASCADE",
                self.schema
            )))
            .await
            .unwrap();
    }
}

#[test]
fn tls_를_켜면_require_로_붙는다() {
    use sqlx::postgres::PgSslMode;
    let url = "postgres://u:p@127.0.0.1:5432/db";
    assert!(matches!(
        connect_options(url, true).unwrap().get_ssl_mode(),
        PgSslMode::Require
    ));
    assert!(matches!(
        connect_options(url, false).unwrap().get_ssl_mode(),
        PgSslMode::Disable
    ));
}

#[test]
fn 잘못된_url_은_오류다() {
    assert!(connect_options("not a url", false).is_err());
}

#[tokio::test]
async fn 마이그레이션이_초기_스키마를_만든다() {
    let scratch = Scratch::new().await;
    MIGRATOR.run(&scratch.pool).await.unwrap();
    // 두 번 돌려도 그대로다.
    MIGRATOR.run(&scratch.pool).await.unwrap();

    let tables: Vec<(String,)> = sqlx::query_as(
        "SELECT table_name::text FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1",
    )
    .bind(&scratch.schema)
    .fetch_all(&scratch.pool)
    .await
    .unwrap();
    let names: Vec<&str> = tables.iter().map(|(n,)| n.as_str()).collect();
    assert_eq!(
        names,
        ["_sqlx_migrations", "accounts", "sessions", "turn_analyses"]
    );

    let indexes: Vec<(String,)> = sqlx::query_as(
        "SELECT indexname::text FROM pg_indexes WHERE schemaname = $1 AND indexname NOT LIKE '%_pkey' ORDER BY 1",
    )
    .bind(&scratch.schema)
    .fetch_all(&scratch.pool)
    .await
    .unwrap();
    let names: Vec<&str> = indexes.iter().map(|(n,)| n.as_str()).collect();
    assert_eq!(
        names,
        [
            "idx_sessions_owner",
            "idx_turn_analyses_risk",
            "idx_turn_analyses_session",
            "idx_turn_analyses_to_task",
            "uq_accounts_username",
        ]
    );
    scratch.drop().await;
}

#[tokio::test]
async fn timestamptz_는_밀리초_z_로_돌아온다() {
    let scratch = Scratch::new().await;
    let (at,): (DateTime<Utc>,) =
        sqlx::query_as("SELECT '2026-10-16T18:05:07.123456+09:00'::timestamptz")
            .fetch_one(&scratch.pool)
            .await
            .unwrap();
    assert_eq!(to_iso(&at), "2026-10-16T09:05:07.123Z");
    scratch.drop().await;
}

//! 테스트 하나만 쓰는 스키마와 지어낸 행을 넣는 도우미. 다른 테스트와 같은 DB 를 쓰므로 공용 스키마의 행은 건드리지 않는다.

use std::str::FromStr;
use std::sync::atomic::{AtomicU32, Ordering};

use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool};

use beside_pet_server::shared::MIGRATOR;

/// 환경의 DATABASE_URL, 없으면 `apps/server/.env.sandbox` 의 것. 둘 다 없으면 이유를 적고 실패한다.
fn database_url() -> String {
    std::env::var("DATABASE_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".env.sandbox");
            dotenvy::from_path_iter(path).ok().and_then(|entries| {
                entries
                    .filter_map(Result::ok)
                    .find(|(name, value)| name == "DATABASE_URL" && !value.trim().is_empty())
                    .map(|(_, value)| value)
            })
        })
        .expect(
            "DATABASE_URL 이 없다: DB 테스트는 로컬 Postgres 가 필요하다. pnpm db:up 으로 띄우고 \
             DATABASE_URL 을 환경이나 apps/server/.env.sandbox 에 둔다",
        )
}

pub struct TestSchema {
    admin: PgPool,
    name: String,
    pub pool: PgPool,
}

impl TestSchema {
    pub async fn open() -> TestSchema {
        let base = PgConnectOptions::from_str(&database_url())
            .expect("DATABASE_URL 이 postgres 주소가 아니다")
            .ssl_mode(PgSslMode::Disable);
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(base.clone())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let seq = SEQ.fetch_add(1, Ordering::Relaxed);
        let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
        let name = format!("schema_test_{}_{stamp}_{seq}", std::process::id());
        admin
            .execute(AssertSqlSafe(format!("CREATE SCHEMA \"{name}\"")))
            .await
            .unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(base.options([("search_path", name.as_str())]))
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        TestSchema { admin, name, pool }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    /// 지어낸 문장을 그대로 돌린다(테스트 안의 고정 SQL 뿐이다).
    pub async fn exec(&self, sql: &str) {
        self.pool
            .execute(AssertSqlSafe(sql.to_owned()))
            .await
            .unwrap_or_else(|e| panic!("{e}: {sql}"));
    }

    pub async fn close(self) {
        self.pool.close().await;
        self.admin
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA \"{}\" CASCADE",
                self.name
            )))
            .await
            .unwrap();
    }
}

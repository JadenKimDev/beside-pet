//! PostgreSQL 풀과 기동 때의 마이그레이션.

use std::str::FromStr;
use std::time::Duration;

use sqlx::PgPool;
use sqlx::migrate::Migrator;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};

use super::Config;

/// `apps/server/migrations/` 의 SQL. 기동 때 `connect` 가 돌린다.
pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// 주소를 접속 설정으로 바꾼다. `ssl` 이면 TLS 를 요구한다(인증서 검증은 하지 않는다: TS 의 `ssl: true` 와
/// 달리 관리형 DB 의 CA 묶음을 아직 두지 않았다. 운영을 다시 올리는 PRD 가 `VerifyFull` 로 올린다).
/// 오류 문구에 주소를 싣지 않는다.
pub fn connect_options(url: &str, ssl: bool) -> Result<PgConnectOptions, sqlx::Error> {
    let options = PgConnectOptions::from_str(url).map_err(|_| {
        sqlx::Error::Configuration("DATABASE_URL is not a valid postgres URL".into())
    })?;
    Ok(options.ssl_mode(if ssl {
        PgSslMode::Require
    } else {
        PgSslMode::Disable
    }))
}

/// 풀을 만들고 마이그레이션을 돌린다.
pub async fn connect(config: &Config) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(connect_options(&config.database_url, config.database_ssl)?)
        .await?;
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}

/// 붙지 않고 풀만 만든다. 라우터 테스트처럼 DB 를 쓰지 않는 자리에서 상태를 채울 때 쓴다.
pub fn connect_lazy(config: &Config) -> Result<PgPool, sqlx::Error> {
    Ok(PgPoolOptions::new()
        .connect_lazy_with(connect_options(&config.database_url, config.database_ssl)?))
}

#[cfg(test)]
mod tests;

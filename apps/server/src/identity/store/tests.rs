//! `accounts` SQL 의 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 지운다.

use std::str::FromStr;

use chrono::{DateTime, TimeZone, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool};

use super::AccountStore;
use crate::identity::rules::{AccountRecord, ApplicationInput, IssueInput};
use crate::identity::{AccountStatus, ChatLanguage, Role};
use crate::shared::{MIGRATOR, test_database_url};

/// 이 테스트 하나만 쓰는 스키마와 그 안을 보는 풀.
struct AccountsSchema {
    admin: PgPool,
    name: String,
    pool: PgPool,
}

impl AccountsSchema {
    async fn open() -> AccountsSchema {
        let base = PgConnectOptions::from_str(&test_database_url())
            .expect("DATABASE_URL 이 postgres 주소가 아니다")
            .ssl_mode(PgSslMode::Disable);
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(base.clone())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        static SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let seq = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let stamp = Utc::now().timestamp_nanos_opt().unwrap_or_default();
        let name = format!("accounts_test_{}_{stamp}_{seq}", std::process::id());
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
        AccountsSchema { admin, name, pool }
    }

    fn store(&self) -> AccountStore {
        AccountStore::new(self.pool.clone())
    }

    async fn close(self) {
        self.pool.close().await;
        self.admin
            .execute(AssertSqlSafe(format!("DROP SCHEMA \"{}\" CASCADE", self.name)))
            .await
            .unwrap();
    }
}

fn at(hour: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, hour, 0, 0).unwrap()
}

fn admin_record(id: &str, username: &str, created_hour: u32) -> AccountRecord {
    AccountRecord::issue(IssueInput {
        id: id.to_owned(),
        username: username.to_owned(),
        password_hash: format!("hash-{id}"),
        company: "Fictional Co".to_owned(),
        role: Role::Admin,
        created_at: at(created_hour),
        expires_at: Some(at(20)),
    })
}

fn applicant(id: &str, username: &str, created_hour: u32) -> AccountRecord {
    AccountRecord::apply(ApplicationInput {
        id: id.to_owned(),
        username: username.to_owned(),
        password_hash: format!("hash-{id}"),
        company: "Imaginary Ltd".to_owned(),
        created_at: at(created_hour),
    })
}

#[tokio::test]
async fn 저장한_계정을_id_와_아이디로_찾는다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    let record = admin_record("acc-1", "maple", 1);
    store.save(&record).await.unwrap();

    assert_eq!(store.find_by_id("acc-1").await.unwrap(), Some(record.clone()));
    assert_eq!(store.find_by_username("maple").await.unwrap(), Some(record));
    assert_eq!(store.find_by_id("nobody").await.unwrap(), None);
    assert_eq!(store.find_by_username("nobody").await.unwrap(), None);
    db.close().await;
}

#[tokio::test]
async fn 다시_저장하면_바뀐_칸을_덮어쓴다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    let mut record = applicant("acc-2", "willow", 2);
    store.save(&record).await.unwrap();

    record.approve();
    record.set_expiry(Some(at(22)));
    record.set_chat_language(ChatLanguage::En);
    record.record_login(at(3));
    store.save(&record).await.unwrap();

    let found = store.find_by_id("acc-2").await.unwrap().unwrap();
    assert_eq!(found, record);
    assert_eq!(found.status, AccountStatus::Active);
    assert_eq!(store.list().await.unwrap().len(), 1);

    record.set_expiry(None);
    store.save(&record).await.unwrap();
    assert_eq!(store.find_by_id("acc-2").await.unwrap().unwrap().expires_at, None);
    db.close().await;
}

#[tokio::test]
async fn 목록은_만든_순서다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    let late = admin_record("acc-b", "birch", 5);
    let early = applicant("acc-c", "cedar", 1);
    let middle = admin_record("acc-a", "aspen", 3);
    for record in [&late, &early, &middle] {
        store.save(record).await.unwrap();
    }
    assert_eq!(store.list().await.unwrap(), vec![early, middle, late]);
    db.close().await;
}

#[tokio::test]
async fn 지우면_찾을_수_없다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    store.save(&admin_record("acc-1", "maple", 1)).await.unwrap();
    store.save(&applicant("acc-2", "willow", 2)).await.unwrap();

    store.delete("acc-1").await.unwrap();
    assert_eq!(store.find_by_id("acc-1").await.unwrap(), None);
    assert_eq!(store.list().await.unwrap().len(), 1);
    // 없는 id 를 지워도 오류가 아니다.
    store.delete("acc-1").await.unwrap();
    db.close().await;
}

#[tokio::test]
async fn 같은_아이디의_다른_계정은_저장되지_않는다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    store.save(&admin_record("acc-1", "maple", 1)).await.unwrap();
    assert!(store.save(&applicant("acc-2", "maple", 2)).await.is_err());
    db.close().await;
}

#[tokio::test]
async fn 모르는_역할이나_상태는_읽기_오류다() {
    let db = AccountsSchema::open().await;
    let store = db.store();
    sqlx::query(
        "INSERT INTO accounts (id, username, password_hash, company, role, status, created_at)
         VALUES ('acc-x', 'oak', 'hash-x', 'Fictional Co', 'owner', 'active', now()),
                ('acc-y', 'elm', 'hash-y', 'Fictional Co', 'viewer', 'frozen', now()),
                ('acc-z', 'ash', 'hash-z', 'Fictional Co', 'viewer', 'active', now())",
    )
    .execute(&db.pool)
    .await
    .unwrap();
    sqlx::query("UPDATE accounts SET chat_language = 'fr' WHERE id = 'acc-z'")
        .execute(&db.pool)
        .await
        .unwrap();

    assert!(store.find_by_id("acc-x").await.is_err());
    assert!(store.find_by_username("elm").await.is_err());
    assert!(store.find_by_id("acc-z").await.is_err());
    assert!(store.list().await.is_err());
    db.close().await;
}

//! `accounts` 테이블의 SQL.
//!
//! 역할·상태·대화 언어는 varchar 로 두고 여기서 글과 값 사이를 바꾼다. 모르는 글은 읽기 오류다.
//! 오류 문구에는 칸 이름과 그 글만 싣고 아이디 같은 식별 정보는 싣지 않는다.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::rules::AccountRecord;
use super::{AccountStatus, ChatLanguage, Role};

const COLUMNS: &str = "id, username, password_hash, company, role, status, created_at, \
                       last_login_at, expires_at, chat_language, tokens_valid_from, deleted_at";

/// `accounts` 를 읽고 쓰는 곳. 풀을 복제해 들고 다닌다.
#[derive(Debug, Clone)]
pub struct AccountStore {
    pool: PgPool,
}

#[derive(sqlx::FromRow)]
struct AccountRow {
    id: String,
    username: String,
    password_hash: String,
    company: String,
    role: String,
    status: String,
    created_at: DateTime<Utc>,
    last_login_at: Option<DateTime<Utc>>,
    expires_at: Option<DateTime<Utc>>,
    chat_language: Option<String>,
    tokens_valid_from: Option<DateTime<Utc>>,
    deleted_at: Option<DateTime<Utc>>,
}

impl AccountStore {
    pub fn new(pool: PgPool) -> AccountStore {
        AccountStore { pool }
    }

    /// 없으면 넣고 있으면(같은 id) 모든 칸을 덮어쓴다. 다른 계정과 아이디가 겹치면 오류다.
    /// 로그아웃 시각(`tokens_valid_from`)만은 넣을 때만 쓰고 덮어쓰지 않는다. 로그아웃 전에 읽은 줄을
    /// 뒤에 저장해도 로그아웃이 풀리지 않게, 그 칸은 `set_tokens_valid_from` 만 바꾼다.
    pub async fn save(&self, record: &AccountRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO accounts (id, username, password_hash, company, role, status, created_at, \
                                   last_login_at, expires_at, chat_language, tokens_valid_from, \
                                   deleted_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) \
             ON CONFLICT (id) DO UPDATE SET \
               username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, \
               company = EXCLUDED.company, role = EXCLUDED.role, status = EXCLUDED.status, \
               created_at = EXCLUDED.created_at, last_login_at = EXCLUDED.last_login_at, \
               expires_at = EXCLUDED.expires_at, chat_language = EXCLUDED.chat_language, \
               deleted_at = EXCLUDED.deleted_at",
        )
        .bind(&record.id)
        .bind(&record.username)
        .bind(&record.password_hash)
        .bind(&record.company)
        .bind(role_text(record.role))
        .bind(status_text(record.status))
        .bind(record.created_at)
        .bind(record.last_login_at)
        .bind(record.expires_at)
        .bind(record.chat_language.map(language_text))
        .bind(record.tokens_valid_from)
        .bind(record.deleted_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// 로그아웃: 그 계정의 로그아웃 시각을 `at` 으로 적는다. 없는 id 는 아무것도 하지 않는다.
    pub async fn set_tokens_valid_from(
        &self,
        id: &str,
        at: DateTime<Utc>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE accounts SET tokens_valid_from = $2 WHERE id = $1")
            .bind(id)
            .bind(at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<AccountRecord>, sqlx::Error> {
        self.find_one("id", id).await
    }

    pub async fn find_by_username(
        &self,
        username: &str,
    ) -> Result<Option<AccountRecord>, sqlx::Error> {
        self.find_one("username", username).await
    }

    /// 모든 계정(지운 것 포함). TS 는 순서를 정하지 않았으므로 만든 순서(같으면 id)로 고정한다.
    pub async fn list(&self) -> Result<Vec<AccountRecord>, sqlx::Error> {
        let rows: Vec<AccountRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {COLUMNS} FROM accounts ORDER BY created_at, id"
        )))
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter().map(AccountRow::into_record).collect()
    }

    /// 줄을 완전히 지운다. 지웠으면 참이고, 없는 id 는 아무것도 하지 않는다(거짓).
    pub async fn delete(&self, id: &str) -> Result<bool, sqlx::Error> {
        let done = sqlx::query("DELETE FROM accounts WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(done.rows_affected() > 0)
    }

    /// 상태가 정지(`deleted`)이고 정지 시각이 `cutoff` 보다 이른 계정의 id. 정지 시각이 없는 줄은 고르지 않는다.
    pub async fn suspended_before(
        &self,
        cutoff: DateTime<Utc>,
    ) -> Result<Vec<String>, sqlx::Error> {
        sqlx::query_scalar(
            "SELECT id FROM accounts WHERE status = 'deleted' AND deleted_at < $1 ORDER BY id",
        )
        .bind(cutoff)
        .fetch_all(&self.pool)
        .await
    }

    /// `column` 은 이 파일의 상수 이름만 넘긴다(바깥 글이 SQL 에 들어가지 않는다).
    async fn find_one(
        &self,
        column: &'static str,
        value: &str,
    ) -> Result<Option<AccountRecord>, sqlx::Error> {
        let row: Option<AccountRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT {COLUMNS} FROM accounts WHERE {column} = $1"
        )))
        .bind(value)
        .fetch_optional(&self.pool)
        .await?;
        row.map(AccountRow::into_record).transpose()
    }
}

impl AccountRow {
    fn into_record(self) -> Result<AccountRecord, sqlx::Error> {
        Ok(AccountRecord {
            role: Role::parse(&self.role).ok_or_else(|| unknown("role", &self.role))?,
            status: parse_status(&self.status).ok_or_else(|| unknown("status", &self.status))?,
            chat_language: match self.chat_language.as_deref() {
                None => None,
                Some(text) => {
                    Some(ChatLanguage::parse(text).ok_or_else(|| unknown("chat_language", text))?)
                }
            },
            id: self.id,
            username: self.username,
            password_hash: self.password_hash,
            company: self.company,
            created_at: self.created_at,
            last_login_at: self.last_login_at,
            expires_at: self.expires_at,
            tokens_valid_from: self.tokens_valid_from,
            deleted_at: self.deleted_at,
        })
    }
}

fn unknown(column: &str, text: &str) -> sqlx::Error {
    sqlx::Error::Decode(format!("accounts.{column} has an unknown value {text:?}").into())
}

fn role_text(role: Role) -> &'static str {
    match role {
        Role::Admin => "admin",
        Role::Viewer => "viewer",
    }
}

fn status_text(status: AccountStatus) -> &'static str {
    match status {
        AccountStatus::Pending => "pending",
        AccountStatus::Active => "active",
        AccountStatus::Revoked => "revoked",
        AccountStatus::Deleted => "deleted",
    }
}

fn parse_status(text: &str) -> Option<AccountStatus> {
    match text {
        "pending" => Some(AccountStatus::Pending),
        "active" => Some(AccountStatus::Active),
        "revoked" => Some(AccountStatus::Revoked),
        "deleted" => Some(AccountStatus::Deleted),
        _ => None,
    }
}

fn language_text(language: ChatLanguage) -> &'static str {
    match language {
        ChatLanguage::Ko => "ko",
        ChatLanguage::En => "en",
    }
}

#[cfg(test)]
pub(super) mod tests; // `AccountsSchema` 를 흐름 테스트(`service`)가 다시 쓴다

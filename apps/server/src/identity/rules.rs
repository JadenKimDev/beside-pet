//! 저장된 계정의 상태 전이 규칙. 시각과 id 는 부른 쪽이 넘긴다(I/O 없음).
//!
//! 전이는 지금 상태를 따지지 않고 그대로 바꾼다(TS 애그리게이트와 같다). 어느 상태에서 무엇을 허락할지는
//! 흐름이 정한다. `expired` 는 저장하지 않고 `now` 에 대해 계산한다.

use chrono::{DateTime, Utc};

use super::{Account, AccountStatus, ChatLanguage, Role};

/// `accounts` 의 한 줄. 비밀번호는 해시만 담는다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub role: Role,
    pub status: AccountStatus,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub chat_language: Option<ChatLanguage>,
}

/// 관리자(또는 첫 설치)가 계정을 발급할 때 넘기는 값.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssueInput {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// 방문자가 스스로 신청할 때 넘기는 값. 역할은 늘 `Viewer` 다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationInput {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub created_at: DateTime<Utc>,
}

impl AccountRecord {
    /// 발급한 계정은 곧바로 `Active` 다.
    pub fn issue(input: IssueInput) -> AccountRecord {
        AccountRecord {
            id: input.id,
            username: input.username,
            password_hash: input.password_hash,
            company: input.company,
            role: input.role,
            status: AccountStatus::Active,
            created_at: input.created_at,
            last_login_at: None,
            expires_at: input.expires_at,
            chat_language: None,
        }
    }

    /// 신청한 계정은 관리자가 승인할 때까지 `Pending` 인 `Viewer` 다.
    pub fn apply(input: ApplicationInput) -> AccountRecord {
        AccountRecord {
            id: input.id,
            username: input.username,
            password_hash: input.password_hash,
            company: input.company,
            role: Role::Viewer,
            status: AccountStatus::Pending,
            created_at: input.created_at,
            last_login_at: None,
            expires_at: None,
            chat_language: None,
        }
    }

    pub fn approve(&mut self) {
        self.status = AccountStatus::Active;
    }

    pub fn revoke(&mut self) {
        self.status = AccountStatus::Revoked;
    }

    pub fn soft_delete(&mut self) {
        self.status = AccountStatus::Deleted;
    }

    pub fn reactivate(&mut self) {
        self.status = AccountStatus::Active;
    }

    /// 절대 만료 시각을 정하거나(`Some`) 지운다(`None`).
    pub fn set_expiry(&mut self, expires_at: Option<DateTime<Utc>>) {
        self.expires_at = expires_at;
    }

    pub fn set_chat_language(&mut self, language: ChatLanguage) {
        self.chat_language = Some(language);
    }

    pub fn record_login(&mut self, at: DateTime<Utc>) {
        self.last_login_at = Some(at);
    }

    /// 만료 시각에 닿았으면(같은 시각 포함) 참이다.
    pub fn is_expired(&self, now: DateTime<Utc>) -> bool {
        self.expires_at.is_some_and(|expires_at| expires_at <= now)
    }

    /// 바깥에 보이는 계정. 해시는 빠지고 `expired` 는 `now` 에 대해 계산한다.
    pub fn to_account(&self, now: DateTime<Utc>) -> Account {
        Account {
            id: self.id.clone(),
            username: self.username.clone(),
            company: self.company.clone(),
            role: self.role,
            status: self.status,
            expires_at: self.expires_at,
            expired: self.is_expired(now),
            created_at: self.created_at,
            last_login_at: self.last_login_at,
            chat_language: self.chat_language,
        }
    }
}

#[cfg(test)]
mod tests;

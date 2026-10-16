//! identity 의 응답 본문 타입. 없는 선택 칸은 JSON 에서 뺀다(TS 의 `undefined`).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::identity::{Account, AccountStatus, ChatLanguage, Role};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountResponse {
    pub id: String,
    pub username: String,
    pub company: String,
    pub role: Role,
    pub status: AccountStatus,
    #[serde(
        skip_serializing_if = "Option::is_none",
        with = "crate::shared::iso_millis_opt"
    )]
    pub expires_at: Option<DateTime<Utc>>,
    pub expired: bool,
    #[serde(with = "crate::shared::iso_millis")]
    pub created_at: DateTime<Utc>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        with = "crate::shared::iso_millis_opt"
    )]
    pub last_login_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chat_language: Option<ChatLanguage>,
}

impl From<Account> for AccountResponse {
    fn from(account: Account) -> AccountResponse {
        AccountResponse {
            id: account.id,
            username: account.username,
            company: account.company,
            role: account.role,
            status: account.status,
            expires_at: account.expires_at,
            expired: account.expired,
            created_at: account.created_at,
            last_login_at: account.last_login_at,
            chat_language: account.chat_language,
        }
    }
}

/// `GET /v1/auth/setup`: 첫 설치가 아직 남았는가.
#[derive(Debug, Serialize)]
pub struct SetupStatusResponse {
    pub required: bool,
}

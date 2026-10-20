//! identity 의 응답 본문 타입. 없는 선택 칸은 JSON 에서 뺀다(TS 의 `undefined`).

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::identity::{Account, AccountActivity, AccountStatus, ChatLanguage, Role};

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

/// `GET /v1/admin/accounts` 의 항목: 계정의 칸에 `sessionCount`(지금 남아 있는 세션 수)와
/// `lastActiveAt`(그 세션들의 마지막 메시지 시각, 없으면 칸을 뺀다)을 더한다(#4).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccountResponse {
    #[serde(flatten)]
    pub account: AccountResponse,
    pub session_count: u32,
    #[serde(
        skip_serializing_if = "Option::is_none",
        with = "crate::shared::iso_millis_opt"
    )]
    pub last_active_at: Option<DateTime<Utc>>,
}

impl AdminAccountResponse {
    pub fn new(account: Account, activity: AccountActivity) -> AdminAccountResponse {
        AdminAccountResponse {
            account: account.into(),
            session_count: activity.session_count,
            last_active_at: activity.last_active_at,
        }
    }
}

/// `GET /v1/auth/me`: 계정의 칸에 `hasProfile`(그 계정에 지금 남아 있는 세션이 있는가)을 더한다(#15).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    #[serde(flatten)]
    pub account: AccountResponse,
    pub has_profile: bool,
}

/// `GET /v1/auth/setup`: 첫 설치가 아직 남았는가.
#[derive(Debug, Serialize)]
pub struct SetupStatusResponse {
    pub required: bool,
}

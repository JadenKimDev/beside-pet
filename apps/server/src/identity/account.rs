//! 계정의 값: 역할, 상태, 대화 언어, 바깥에 보이는 계정, 인증된 계정. I/O 는 없다.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 계정의 역할. 계정을 만들고 거두는 것은 `Admin` 뿐이다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Admin,
    Viewer,
}

impl Role {
    /// 요청 본문의 글(`"admin"`, `"viewer"`)에서. 검증을 지난 값만 넘긴다.
    pub fn parse(text: &str) -> Option<Role> {
        match text {
            "admin" => Some(Role::Admin),
            "viewer" => Some(Role::Viewer),
            _ => None,
        }
    }
}

/// 계정의 상태. 스스로 신청한 계정은 `Pending` 으로 시작하고 관리자가 승인해야 들어올 수 있다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AccountStatus {
    Pending,
    Active,
    Revoked,
    Deleted,
}

/// 대화 언어(앱 화면의 언어와 따로다).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatLanguage {
    Ko,
    En,
}

impl ChatLanguage {
    pub fn parse(text: &str) -> Option<ChatLanguage> {
        match text {
            "ko" => Some(ChatLanguage::Ko),
            "en" => Some(ChatLanguage::En),
            _ => None,
        }
    }
}

/// 바깥에 보이는 계정. 비밀번호 해시는 없다. `expired` 는 지금 시각에 대해 계산한 값이다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub company: String,
    pub role: Role,
    pub status: AccountStatus,
    pub expires_at: Option<DateTime<Utc>>,
    pub expired: bool,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub chat_language: Option<ChatLanguage>,
}

/// 인증 추출기가 핸들러에 넘기는 계정. 요청 본문이 아니라 확인한 토큰에서 온다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthenticatedAccount {
    pub id: String,
    pub username: String,
    pub company: String,
    pub role: Role,
}

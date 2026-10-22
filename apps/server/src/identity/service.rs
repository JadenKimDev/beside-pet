//! identity 가 바깥에 보이는 trait(계정 동작, 토큰 확인)와 그 구현의 자리(`IdentityService`, 구현 없음의 `Unimplemented`).

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use chrono::{DateTime, Utc};

use super::{Account, AuthenticatedAccount, ChatLanguage, Role};
use crate::shared::ApiError;

mod live;
pub(super) mod suspended;

pub use live::{IdentityService, StartError};

/// trait 객체로 부를 수 있는 비동기 반환값.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// `POST /v1/auth/register`: 공개 신청(→ pending).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterInput {
    pub username: String,
    pub password: String,
    pub company: String,
}

/// `POST /v1/auth/setup`: 한 번 쓰는 토큰으로 첫 관리자를 만든다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupInput {
    pub token: String,
    pub username: String,
    pub password: String,
    pub company: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

/// `POST /v1/admin/accounts`. `expires_at` 은 검증을 지난 ISO 8601 글 그대로다(해석은 구현이 한다).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateAccountInput {
    pub username: String,
    pub password: String,
    pub company: String,
    pub role: Option<Role>,
    pub expires_at: Option<String>,
}

/// 로그인(또는 설치 뒤 바로 로그인)의 결과: 쿠키에 담을 토큰과 계정.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedIn {
    pub token: String,
    pub account: Account,
}

/// 계정의 등록·설치·로그인·조회와 관리자 동작.
pub trait AccountService {
    fn register(&self, input: RegisterInput) -> BoxFuture<'_, Result<Account, ApiError>>;
    /// 첫 설치가 아직 남았는가.
    fn setup_status(&self) -> BoxFuture<'_, Result<bool, ApiError>>;
    /// 첫 관리자를 만들고 곧바로 로그인한다.
    fn setup(&self, input: SetupInput) -> BoxFuture<'_, Result<SignedIn, ApiError>>;
    fn login(&self, input: LoginInput) -> BoxFuture<'_, Result<SignedIn, ApiError>>;
    fn me(&self, account_id: String) -> BoxFuture<'_, Result<Account, ApiError>>;
    /// 로그아웃: 쿠키의 토큰이 맞으면 그 계정에 지금 시각을 적어, 그 전에 발급한 토큰을 모두 무효로 한다.
    /// 토큰을 읽지 못하면 아무것도 하지 않는다(`Ok`).
    fn log_out(&self, token: String) -> BoxFuture<'_, Result<(), ApiError>>;
    fn set_chat_language(
        &self,
        account_id: String,
        language: ChatLanguage,
    ) -> BoxFuture<'_, Result<Account, ApiError>>;
    fn create_account(&self, input: CreateAccountInput)
    -> BoxFuture<'_, Result<Account, ApiError>>;
    /// 모든 계정(지운 것 포함).
    fn list_accounts(&self) -> BoxFuture<'_, Result<Vec<Account>, ApiError>>;
    fn approve(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>>;
    fn revoke(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>>;
    fn soft_delete(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>>;
    fn reactivate(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>>;
    /// 만료를 정하거나 늘리거나(`Some`) 지운다(`None`).
    fn set_expiry(
        &self,
        id: String,
        expires_at: Option<String>,
    ) -> BoxFuture<'_, Result<Account, ApiError>>;
    /// 완전히 지운다. 정지한 지 `SUSPENSION_HOLD_MONTHS` 달이 지난 계정만 되고 아니면 `409` 다.
    /// 그 계정의 대화와 기억을 `OwnedDataPurger` 로 먼저 지운 뒤 계정 행을 지운다.
    fn delete_account(&self, id: String) -> BoxFuture<'_, Result<(), ApiError>>;
}

/// 쿠키의 토큰을 계정으로 바꾼다. 읽을 수 없거나 만료된 토큰은 `Ok(None)`,
/// 토큰은 맞지만 계정을 쓸 수 없으면 `Err(ApiError::Unauthorized(..))` 다.
pub trait Authenticator {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>>;
}

/// 한 계정의 대화 활동(`GET /v1/admin/accounts` 의 `sessionCount`, `lastActiveAt`). 저장하지 않고 물을 때 구한다.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AccountActivity {
    /// 지금 남아 있는 세션의 수.
    pub session_count: u32,
    /// 그 세션들의 마지막 메시지 시각. 메시지가 없으면 `None`.
    pub last_active_at: Option<DateTime<Utc>>,
}

/// 계정의 대화 세션에 대해 identity 가 묻는 것. 세션은 대화 기능의 것이라
/// identity 는 묻기만 하고, 구현은 대화 기능이 하고 `app.rs` 가 끼운다.
pub trait SessionPresence {
    /// 계정에 지금 남아 있는 대화 세션이 있는가(`/v1/auth/me` 의 `hasProfile`).
    fn has_sessions<'a>(&'a self, account_id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>>;
    /// 여러 계정의 활동을 한 번에 구한다. 세션이 없는 계정은 맵에서 빠진다(= `AccountActivity::default()`).
    fn activity_by_account<'a>(
        &'a self,
        account_ids: &'a [String],
    ) -> BoxFuture<'a, Result<HashMap<String, AccountActivity>, ApiError>>;
}

/// 계정을 완전히 지울 때 그 사람이 가진 대화·기억을 지우는 곳. 대화는 대화 기능의 것이라
/// identity 는 부르기만 하고, 구현은 대화 기능이 하고 `app.rs` 가 끼운다.
pub trait OwnedDataPurger {
    /// `owner_id` 의 세션(메시지·턴·분석 포함)과 기억을 지우고 지운 세션 수를 돌려준다. 계정 행은 지우지 않는다.
    fn delete_owned_by<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<u64, ApiError>>;
}

/// 기동 파기가 identity 에 묻는 것: 보관 기간이 지난 정지 계정과 그 행 지우기.
/// 부르는 쪽이 그 사람의 대화·기억을 먼저 지우고 행을 지운다.
pub trait SuspendedAccounts {
    /// 상태가 정지이고 정지 시각이 `at` 의 `older_than_months` 달 앞보다 이른 계정의 id(정지 시각이 없는 계정은 빠진다).
    fn suspended_before(
        &self,
        at: DateTime<Utc>,
        older_than_months: u32,
    ) -> BoxFuture<'_, Result<Vec<String>, ApiError>>;
    /// 계정 행을 지운다. 지웠으면 참, 없는 id 면 거짓.
    fn delete_account_row<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>>;
}

pub type SharedAccountService = Arc<dyn AccountService + Send + Sync>;
pub type SharedOwnedDataPurger = Arc<dyn OwnedDataPurger + Send + Sync>;
pub type SharedSuspendedAccounts = Arc<dyn SuspendedAccounts + Send + Sync>;
pub type SharedSessionPresence = Arc<dyn SessionPresence + Send + Sync>;
pub type SharedAuthenticator = Arc<dyn Authenticator + Send + Sync>;

/// 구현이 아직 없다: `AccountService`, `SessionPresence`, `OwnedDataPurger` 는 모두 `501`, `Authenticator` 는 늘 `None`(→ 401).
#[derive(Debug, Clone, Copy, Default)]
pub struct Unimplemented;

fn not_implemented<'a, T: Send + 'a>() -> BoxFuture<'a, Result<T, ApiError>> {
    Box::pin(async { Err(ApiError::NotImplemented) })
}

impl AccountService for Unimplemented {
    fn register(&self, _: RegisterInput) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn setup_status(&self) -> BoxFuture<'_, Result<bool, ApiError>> {
        not_implemented()
    }
    fn setup(&self, _: SetupInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        not_implemented()
    }
    fn login(&self, _: LoginInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        not_implemented()
    }
    fn me(&self, _: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn log_out(&self, _: String) -> BoxFuture<'_, Result<(), ApiError>> {
        not_implemented()
    }
    fn set_chat_language(
        &self,
        _: String,
        _: ChatLanguage,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn create_account(&self, _: CreateAccountInput) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn list_accounts(&self) -> BoxFuture<'_, Result<Vec<Account>, ApiError>> {
        not_implemented()
    }
    fn approve(&self, _: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn revoke(&self, _: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn soft_delete(&self, _: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn reactivate(&self, _: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn set_expiry(&self, _: String, _: Option<String>) -> BoxFuture<'_, Result<Account, ApiError>> {
        not_implemented()
    }
    fn delete_account(&self, _: String) -> BoxFuture<'_, Result<(), ApiError>> {
        not_implemented()
    }
}

impl Authenticator for Unimplemented {
    fn authenticate<'a>(
        &'a self,
        _: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        Box::pin(async { Ok(None) })
    }
}

impl SessionPresence for Unimplemented {
    fn has_sessions<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        not_implemented()
    }
    fn activity_by_account<'a>(
        &'a self,
        _: &'a [String],
    ) -> BoxFuture<'a, Result<HashMap<String, AccountActivity>, ApiError>> {
        not_implemented()
    }
}

impl OwnedDataPurger for Unimplemented {
    fn delete_owned_by<'a>(&'a self, _: &'a str) -> BoxFuture<'a, Result<u64, ApiError>> {
        not_implemented()
    }
}

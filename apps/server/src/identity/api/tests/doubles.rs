//! 테스트 더블: 부른 것을 적어 두고 정해 둔 계정을 돌려주는 `AccountService`,
//! 토큰 글자로 계정을 고르는 `Authenticator`, 정해 둔 답(세션 유무, 계정별 활동)을 내는 `SessionPresence`.

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Utc};

use crate::identity::{
    Account, AccountActivity, AccountService, AccountStatus, AuthenticatedAccount, Authenticator,
    BoxFuture, ChatLanguage, CreateAccountInput, LoginInput, RegisterInput, Role, SessionPresence,
    SetupInput, SignedIn,
};
use crate::shared::ApiError;

fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .unwrap()
        .with_timezone(&Utc)
}

/// 선택 칸이 모두 빈 계정(JSON 에서 칸이 빠진다).
pub fn bare_account(id: &str) -> Account {
    Account {
        id: id.to_owned(),
        username: "maple".to_owned(),
        company: "Acme Pets".to_owned(),
        role: Role::Viewer,
        status: AccountStatus::Pending,
        expires_at: None,
        expired: false,
        created_at: at("2026-10-01T09:30:00.5Z"),
        last_login_at: None,
        chat_language: None,
    }
}

/// 선택 칸이 모두 찬 계정.
pub fn full_account(id: &str) -> Account {
    Account {
        role: Role::Admin,
        status: AccountStatus::Active,
        expires_at: Some(at("2027-01-02T03:04:05Z")),
        expired: true,
        last_login_at: Some(at("2026-10-15T23:59:59.999+09:00")),
        chat_language: Some(ChatLanguage::En),
        ..bare_account(id)
    }
}

#[derive(Default)]
pub struct FakeAccounts {
    calls: Mutex<Vec<String>>,
}

impl FakeAccounts {
    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    fn record(&self, call: String) {
        self.calls.lock().unwrap().push(call);
    }
}

fn ready<'a, T: Send + 'a>(value: T) -> BoxFuture<'a, Result<T, ApiError>> {
    Box::pin(async move { Ok(value) })
}

fn signed_in() -> SignedIn {
    SignedIn {
        token: "tok.en-1".to_owned(),
        account: full_account("acc-1"),
    }
}

impl AccountService for FakeAccounts {
    fn register(&self, input: RegisterInput) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("register {input:?}"));
        ready(bare_account("acc-new"))
    }
    fn setup_status(&self) -> BoxFuture<'_, Result<bool, ApiError>> {
        self.record("setup_status".to_owned());
        ready(true)
    }
    fn setup(&self, input: SetupInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        self.record(format!("setup {input:?}"));
        ready(signed_in())
    }
    fn login(&self, input: LoginInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        self.record(format!("login {input:?}"));
        if input.username == "nobody" {
            return Box::pin(async {
                Err(ApiError::Unauthorized("Invalid credentials".to_owned()))
            });
        }
        ready(signed_in())
    }
    fn me(&self, account_id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("me {account_id}"));
        ready(full_account(&account_id))
    }
    fn set_chat_language(
        &self,
        account_id: String,
        language: ChatLanguage,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("set_chat_language {account_id} {language:?}"));
        ready(full_account(&account_id))
    }
    fn create_account(
        &self,
        input: CreateAccountInput,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("create_account {input:?}"));
        ready(bare_account("acc-made"))
    }
    fn list_accounts(&self) -> BoxFuture<'_, Result<Vec<Account>, ApiError>> {
        self.record("list_accounts".to_owned());
        ready(vec![bare_account("a"), full_account("b")])
    }
    fn approve(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("approve {id}"));
        ready(bare_account(&id))
    }
    fn revoke(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("revoke {id}"));
        ready(bare_account(&id))
    }
    fn soft_delete(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("soft_delete {id}"));
        ready(bare_account(&id))
    }
    fn reactivate(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("reactivate {id}"));
        ready(bare_account(&id))
    }
    fn set_expiry(
        &self,
        id: String,
        expires_at: Option<String>,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        self.record(format!("set_expiry {id} {expires_at:?}"));
        ready(bare_account(&id))
    }
    fn delete_account(&self, id: String) -> BoxFuture<'_, Result<(), ApiError>> {
        self.record(format!("delete_account {id}"));
        ready(())
    }
}

/// 토큰 `viewer`·`admin` 은 그 역할의 계정, `gone` 은 쓸 수 없는 계정(401), 나머지는 `None`.
pub struct FakeAuthenticator;

impl Authenticator for FakeAuthenticator {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        let account = |id: &str, role: Role| AuthenticatedAccount {
            id: id.to_owned(),
            username: "maple".to_owned(),
            company: "Acme Pets".to_owned(),
            role,
        };
        let result = match token {
            "viewer" => Ok(Some(account("viewer-id", Role::Viewer))),
            "admin" => Ok(Some(account("admin-id", Role::Admin))),
            "gone" => Err(ApiError::Unauthorized("Account is unavailable".to_owned())),
            _ => Ok(None),
        };
        Box::pin(async move { result })
    }
}

/// 계정 `b` 의 활동: 세션 둘, 마지막 메시지 `2026-10-18T12:34:56.789Z`. 다른 계정은 세션이 없다(맵에서 빠진다).
pub fn activity_of_b() -> AccountActivity {
    AccountActivity {
        session_count: 2,
        last_active_at: Some(at("2026-10-18T21:34:56.789+09:00")),
    }
}

/// 세션 유무와 활동을 정해 둔 답으로 내고, 물은 계정을 적어 둔다.
pub struct FakeSessions {
    has_sessions: bool,
    asked: Mutex<Vec<String>>,
    activity_asked: Mutex<Vec<Vec<String>>>,
}

impl FakeSessions {
    pub fn answering(has_sessions: bool) -> FakeSessions {
        FakeSessions {
            has_sessions,
            asked: Mutex::new(Vec::new()),
            activity_asked: Mutex::new(Vec::new()),
        }
    }

    pub fn asked(&self) -> Vec<String> {
        self.asked.lock().unwrap().clone()
    }

    /// `activity_by_account` 를 부를 때마다 넘긴 계정 id 들.
    pub fn activity_asked(&self) -> Vec<Vec<String>> {
        self.activity_asked.lock().unwrap().clone()
    }
}

impl SessionPresence for FakeSessions {
    fn has_sessions<'a>(&'a self, account_id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        self.asked.lock().unwrap().push(account_id.to_owned());
        ready(self.has_sessions)
    }

    fn activity_by_account<'a>(
        &'a self,
        account_ids: &'a [String],
    ) -> BoxFuture<'a, Result<HashMap<String, AccountActivity>, ApiError>> {
        self.activity_asked
            .lock()
            .unwrap()
            .push(account_ids.to_vec());
        let answer = account_ids
            .iter()
            .filter(|id| id.as_str() == "b")
            .map(|id| (id.clone(), activity_of_b()))
            .collect();
        ready(answer)
    }
}

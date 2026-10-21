//! `AccountService` 와 `Authenticator` 의 구현: 계정 규칙과 저장, 비밀번호 해시, 토큰 서명, setup 게이트를 엮는 흐름.
//!
//! 오류 문구와 상태 코드는 TS API 의 유스케이스와 가드를 그대로 옮긴다(ADR-0017). 로그에는 오류의 종류만 남기고
//! 아이디, 비밀번호, 토큰은 싣지 않는다(기동 때 setup 토큰을 찍는 `setup::log_token` 만 예외).

use std::fmt;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::{
    AccountService, Authenticator, BoxFuture, CreateAccountInput, LoginInput, RegisterInput,
    SetupInput, SignedIn,
};
use crate::identity::rules::{AccountRecord, ApplicationInput, IssueInput};
use crate::identity::setup::{self, SetupGate};
use crate::identity::store::AccountStore;
use crate::identity::token::{DEFAULT_TTL, TokenClaims, TokenSigner};
use crate::identity::{Account, AccountStatus, AuthenticatedAccount, ChatLanguage, Role, password};
use crate::shared::{ApiError, Message, from_iso};

/// setup 으로 만든 관리자의 회사 이름이 비었을 때(TS 와 같다).
const DEFAULT_COMPANY: &str = "Beside Pet";

/// 서버가 끼우는 identity 의 구현. 시계는 함수로 받아 테스트가 고정한다.
pub struct IdentityService {
    store: AccountStore,
    signer: TokenSigner,
    gate: Arc<SetupGate>,
    now: fn() -> DateTime<Utc>,
}

/// identity 를 띄우지 못한 이유. 문구에 설정 값을 싣지 않는다.
#[derive(Debug)]
pub enum StartError {
    /// `JWT_TTL` 을 기간으로 읽지 못했다.
    InvalidTtl,
    /// 관리자가 있는지 보지 못했다.
    Database(sqlx::Error),
    /// setup 토큰을 만들 난수를 얻지 못했다.
    RandomUnavailable,
}

impl fmt::Display for StartError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StartError::InvalidTtl => f.write_str(
                "JWT_TTL is not a valid duration (e.g. 7d, 12h, 30m; a bare number is seconds)",
            ),
            StartError::Database(error) => write!(f, "could not read accounts: {error}"),
            StartError::RandomUnavailable => {
                f.write_str("could not get randomness for the setup token")
            }
        }
    }
}

impl std::error::Error for StartError {}

impl IdentityService {
    pub(super) fn new(
        store: AccountStore,
        signer: TokenSigner,
        gate: Arc<SetupGate>,
        now: fn() -> DateTime<Utc>,
    ) -> IdentityService {
        IdentityService {
            store,
            signer,
            gate,
            now,
        }
    }

    /// 서버 기동 때: 관리자가 없으면 setup 토큰을 만들어 로그에 찍고 게이트를 연다.
    /// `ttl` 이 `None` 이면 기본 수명(`7d`)이다.
    pub async fn start(
        pool: PgPool,
        secret: &str,
        ttl: Option<&str>,
    ) -> Result<IdentityService, StartError> {
        IdentityService::boot(AccountStore::new(pool), secret, ttl.unwrap_or(DEFAULT_TTL)).await
    }

    pub(super) async fn boot(
        store: AccountStore,
        secret: &str,
        ttl: &str,
    ) -> Result<IdentityService, StartError> {
        let signer = TokenSigner::new(secret, ttl).map_err(|_| StartError::InvalidTtl)?;
        // 단위 없는 숫자를 초로 읽으므로(TS 의 `ms` 는 밀리초) 실제로 쓰는 수명을 남긴다.
        tracing::info!(
            ttl_seconds = signer.ttl().num_seconds(),
            "login tokens: JWT HS256"
        );
        let accounts = store.list().await.map_err(StartError::Database)?;
        let gate = if accounts.iter().any(|account| account.role == Role::Admin) {
            SetupGate::closed()
        } else {
            let token = setup::fresh_token().map_err(|_| StartError::RandomUnavailable)?;
            setup::log_token(&token);
            SetupGate::open(token)
        };
        Ok(IdentityService::new(
            store,
            signer,
            Arc::new(gate),
            Utc::now,
        ))
    }

    fn now(&self) -> DateTime<Utc> {
        (self.now)()
    }

    /// 관리자 동작의 대상. 없으면 `404 Account not found: <id>`.
    async fn target(&self, id: &str) -> Result<AccountRecord, ApiError> {
        self.store
            .find_by_id(id)
            .await
            .map_err(internal)?
            .ok_or_else(|| ApiError::NotFound(format!("Account not found: {id}")))
    }

    /// 로그인한 본인. 없으면 `404 Account not found`(TS 와 같이 id 를 싣지 않는다).
    async fn own(&self, id: &str) -> Result<AccountRecord, ApiError> {
        self.store
            .find_by_id(id)
            .await
            .map_err(internal)?
            .ok_or_else(|| ApiError::NotFound("Account not found".to_owned()))
    }

    /// 같은 아이디가 있으면 `409`.
    async fn ensure_username_free(&self, username: &str) -> Result<(), ApiError> {
        match self
            .store
            .find_by_username(username)
            .await
            .map_err(internal)?
        {
            Some(_) => Err(username_taken(username)),
            None => Ok(()),
        }
    }

    /// 새 계정을 넣는다. 확인과 넣기 사이에 같은 아이디가 들어왔으면(유일 제약) `409`.
    async fn insert(&self, record: &AccountRecord) -> Result<(), ApiError> {
        self.store.save(record).await.map_err(|error| {
            if is_unique_violation(&error) {
                username_taken(&record.username)
            } else {
                internal(error)
            }
        })
    }

    async fn save(&self, record: &AccountRecord) -> Result<(), ApiError> {
        self.store.save(record).await.map_err(internal)
    }

    /// 바꾼 뒤 저장하고 바깥 모양으로.
    async fn update(
        &self,
        mut record: AccountRecord,
        change: impl FnOnce(&mut AccountRecord),
    ) -> Result<Account, ApiError> {
        change(&mut record);
        self.save(&record).await?;
        Ok(record.to_account(self.now()))
    }

    /// 관리자 동작: 대상을 찾아 바꾸고 저장한다.
    async fn change_target(
        &self,
        id: String,
        change: impl FnOnce(&mut AccountRecord),
    ) -> Result<Account, ApiError> {
        let record = self.target(&id).await?;
        self.update(record, change).await
    }

    /// 로그인 시각을 남기고 토큰을 서명한다.
    async fn sign_in(&self, mut record: AccountRecord) -> Result<SignedIn, ApiError> {
        let now = self.now();
        record.record_login(now);
        self.save(&record).await?;
        let claims = TokenClaims {
            sub: record.id.clone(),
            role: record.role,
        };
        let token = self.signer.sign(&claims, now).map_err(|_| {
            tracing::error!("login token could not be signed");
            ApiError::Internal
        })?;
        Ok(SignedIn {
            token,
            account: record.to_account(now),
        })
    }

    async fn do_register(&self, input: RegisterInput) -> Result<Account, ApiError> {
        self.ensure_username_free(&input.username).await?;
        let now = self.now();
        let record = AccountRecord::apply(ApplicationInput {
            id: new_id(),
            password_hash: hash_password(input.password).await?,
            username: input.username,
            company: input.company,
            created_at: now,
        });
        self.insert(&record).await?;
        Ok(record.to_account(now))
    }

    async fn do_setup(&self, input: SetupInput) -> Result<SignedIn, ApiError> {
        if !self.gate.is_pending() {
            return Err(ApiError::Conflict("Setup is already complete".to_owned()));
        }
        if !self.gate.redeem(&input.token) {
            return Err(ApiError::Forbidden("Invalid setup token".to_owned()));
        }
        self.ensure_username_free(&input.username).await?;
        let record = AccountRecord::issue(IssueInput {
            id: new_id(),
            password_hash: hash_password(input.password).await?,
            username: input.username,
            company: input.company.unwrap_or_else(|| DEFAULT_COMPANY.to_owned()),
            role: Role::Admin,
            created_at: self.now(),
            expires_at: None,
        });
        self.insert(&record).await?;
        self.sign_in(record).await
    }

    async fn do_login(&self, input: LoginInput) -> Result<SignedIn, ApiError> {
        let found = self
            .store
            .find_by_username(&input.username)
            .await
            .map_err(internal)?;
        let record = match found {
            Some(record)
                if verify_password(input.password, record.password_hash.clone()).await? =>
            {
                record
            }
            // 아이디가 있는지 드러내지 않도록 같은 문구다.
            _ => {
                return Err(ApiError::Unauthorized(
                    "Invalid username or password".to_owned(),
                ));
            }
        };
        match record.status {
            AccountStatus::Pending => {
                return Err(ApiError::Forbidden(
                    "Your account is awaiting approval.".to_owned(),
                ));
            }
            AccountStatus::Revoked => {
                return Err(ApiError::Unauthorized("Account is revoked".to_owned()));
            }
            AccountStatus::Deleted => {
                return Err(ApiError::Unauthorized("Account is unavailable".to_owned()));
            }
            AccountStatus::Active => {}
        }
        if record.is_expired(self.now()) {
            return Err(ApiError::Unauthorized("Account has expired".to_owned()));
        }
        self.sign_in(record).await
    }

    async fn do_create_account(&self, input: CreateAccountInput) -> Result<Account, ApiError> {
        let expires_at = parse_expiry(input.expires_at.as_deref())?;
        self.ensure_username_free(&input.username).await?;
        let now = self.now();
        let record = AccountRecord::issue(IssueInput {
            id: new_id(),
            password_hash: hash_password(input.password).await?,
            username: input.username,
            company: input.company,
            role: input.role.unwrap_or(Role::Viewer),
            created_at: now,
            expires_at,
        });
        self.insert(&record).await?;
        Ok(record.to_account(now))
    }

    async fn do_list(&self) -> Result<Vec<Account>, ApiError> {
        let now = self.now();
        let records = self.store.list().await.map_err(internal)?;
        Ok(records
            .iter()
            .map(|record| record.to_account(now))
            .collect())
    }

    async fn do_approve(&self, id: String) -> Result<Account, ApiError> {
        let record = self.target(&id).await?;
        if record.status != AccountStatus::Pending {
            return Err(ApiError::Conflict(
                "Only a pending account can be approved.".to_owned(),
            ));
        }
        self.update(record, AccountRecord::approve).await
    }

    async fn do_set_expiry(
        &self,
        id: String,
        expires_at: Option<String>,
    ) -> Result<Account, ApiError> {
        let expires_at = parse_expiry(expires_at.as_deref())?;
        self.change_target(id, |record| record.set_expiry(expires_at))
            .await
    }

    /// 맞는 토큰이면 그 계정(상태와 상관없이)에 지금 시각을 로그아웃으로 적는다.
    async fn do_log_out(&self, token: &str) -> Result<(), ApiError> {
        let now = self.now();
        let Some(verified) = self.signer.verify(token, now) else {
            return Ok(());
        };
        self.store
            .set_tokens_valid_from(&verified.claims.sub, now)
            .await
            .map_err(internal)
    }

    async fn do_delete(&self, id: String) -> Result<(), ApiError> {
        let record = self.target(&id).await?;
        self.store.delete(&record.id).await.map_err(internal)
    }

    /// 토큰을 읽지 못하면 `None`. 읽었지만 계정이 없거나 active 가 아니거나 만료면 `401`.
    /// 정지가 곧바로 듣도록 토큰만 믿지 않고 매번 계정을 다시 읽는다(ADR-0007).
    /// 계정의 마지막 로그아웃보다 앞선 초에 발급한 토큰도 읽지 못한 토큰과 같이 `None` 이다.
    async fn do_authenticate(&self, token: &str) -> Result<Option<AuthenticatedAccount>, ApiError> {
        let now = self.now();
        let Some(verified) = self.signer.verify(token, now) else {
            return Ok(None);
        };
        let record = self
            .store
            .find_by_id(&verified.claims.sub)
            .await
            .map_err(internal)?;
        if record
            .as_ref()
            .is_some_and(|record| !record.accepts_token_issued_at(verified.issued_at))
        {
            return Ok(None);
        }
        match record {
            Some(record) if record.status == AccountStatus::Active && !record.is_expired(now) => {
                Ok(Some(AuthenticatedAccount {
                    id: record.id,
                    username: record.username,
                    company: record.company,
                    role: record.role,
                }))
            }
            _ => Err(ApiError::Unauthorized("Account is unavailable".to_owned())),
        }
    }
}

impl AccountService for IdentityService {
    fn register(&self, input: RegisterInput) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.do_register(input))
    }

    fn setup_status(&self) -> BoxFuture<'_, Result<bool, ApiError>> {
        let pending = self.gate.is_pending();
        Box::pin(async move { Ok(pending) })
    }

    fn setup(&self, input: SetupInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        Box::pin(self.do_setup(input))
    }

    fn login(&self, input: LoginInput) -> BoxFuture<'_, Result<SignedIn, ApiError>> {
        Box::pin(self.do_login(input))
    }

    fn me(&self, account_id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(async move { Ok(self.own(&account_id).await?.to_account(self.now())) })
    }

    fn log_out(&self, token: String) -> BoxFuture<'_, Result<(), ApiError>> {
        Box::pin(async move { self.do_log_out(&token).await })
    }

    fn set_chat_language(
        &self,
        account_id: String,
        language: ChatLanguage,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(async move {
            let record = self.own(&account_id).await?;
            self.update(record, |record| record.set_chat_language(language))
                .await
        })
    }

    fn create_account(
        &self,
        input: CreateAccountInput,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.do_create_account(input))
    }

    fn list_accounts(&self) -> BoxFuture<'_, Result<Vec<Account>, ApiError>> {
        Box::pin(self.do_list())
    }

    fn approve(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.do_approve(id))
    }

    fn revoke(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.change_target(id, AccountRecord::revoke))
    }

    fn soft_delete(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.change_target(id, AccountRecord::soft_delete))
    }

    fn reactivate(&self, id: String) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.change_target(id, AccountRecord::reactivate))
    }

    fn set_expiry(
        &self,
        id: String,
        expires_at: Option<String>,
    ) -> BoxFuture<'_, Result<Account, ApiError>> {
        Box::pin(self.do_set_expiry(id, expires_at))
    }

    fn delete_account(&self, id: String) -> BoxFuture<'_, Result<(), ApiError>> {
        Box::pin(self.do_delete(id))
    }
}

impl Authenticator for IdentityService {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        Box::pin(self.do_authenticate(token))
    }
}

/// 계정 id: uuid v4(TS 의 `randomUUID` 와 같은 모양).
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// 검증을 지난 ISO 8601 글을 시각으로. RFC 3339 로 읽지 못하는 꼴(주 날짜 등)은 검증 문구와 같은 `400`.
fn parse_expiry(text: Option<&str>) -> Result<Option<DateTime<Utc>>, ApiError> {
    match text {
        None => Ok(None),
        Some(text) => from_iso(text).map(Some).ok_or_else(|| {
            ApiError::BadRequest(Message::Many(vec![
                "expiresAt must be a valid ISO 8601 date string".to_owned(),
            ]))
        }),
    }
}

/// 해시는 블로킹 CPU 작업이라 블로킹 스레드에서 돈다.
async fn hash_password(plain: String) -> Result<String, ApiError> {
    let hashed = tokio::task::spawn_blocking(move || password::hash(&plain))
        .await
        .map_err(|_| {
            tracing::error!("password hashing task failed");
            ApiError::Internal
        })?;
    hashed.map_err(|_| {
        tracing::error!("password could not be hashed (no randomness for the salt)");
        ApiError::Internal
    })
}

async fn verify_password(plain: String, hash: String) -> Result<bool, ApiError> {
    tokio::task::spawn_blocking(move || password::verify(&plain, &hash))
        .await
        .map_err(|_| {
            tracing::error!("password verification task failed");
            ApiError::Internal
        })
}

fn username_taken(username: &str) -> ApiError {
    ApiError::Conflict(format!("Username already exists: {username}"))
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(db) if db.is_unique_violation())
}

/// DB 오류는 `500` 이다. 로그에는 오류의 종류만 남긴다(DB 오류의 상세에는 칸의 값이 실릴 수 있다).
fn internal(error: sqlx::Error) -> ApiError {
    match &error {
        sqlx::Error::Database(db) => tracing::error!(
            code = db.code().as_deref().unwrap_or("unknown"),
            constraint = db.constraint().unwrap_or("none"),
            "accounts query failed"
        ),
        other => tracing::error!("accounts query failed: {other}"),
    }
    ApiError::Internal
}

#[cfg(test)]
mod tests;

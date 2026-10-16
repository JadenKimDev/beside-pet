//! identity 의 HTTP 겉: `/v1/auth/*` 와 `/v1/admin/*` 의 라우터와 핸들러. 핸들러는 검증하고 trait 를 부를 뿐이다.

mod cookie;
mod extract;
mod request;
mod response;

use axum::extract::{FromRef, Path, State};
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};

pub use extract::{AdminAccount, CurrentAccount};

use super::{SharedAccountService, SharedAuthenticator, SignedIn};
use crate::shared::{ApiError, JsonBody};
use cookie::{clear_auth_cookie, set_auth_cookie};
use response::{AccountResponse, SetupStatusResponse};

/// identity 라우터의 상태. `app.rs` 가 `FromRef` 로 꺼내 준다.
#[derive(Clone)]
pub struct IdentityState {
    pub accounts: SharedAccountService,
    pub authenticator: SharedAuthenticator,
    /// 쿠키에 Secure 를 붙이는가(`Config::is_production()`).
    pub secure_cookies: bool,
}

impl FromRef<IdentityState> for SharedAuthenticator {
    fn from_ref(state: &IdentityState) -> SharedAuthenticator {
        state.authenticator.clone()
    }
}

/// `/v1/auth/*` 일곱과 `/v1/admin/*` 여덟. 인증 추출기는 상태에서 `SharedAuthenticator` 만 꺼낸다.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    IdentityState: FromRef<S>,
    SharedAuthenticator: FromRef<S>,
{
    Router::new()
        .route("/v1/auth/register", post(register))
        .route("/v1/auth/setup", get(setup_status).post(setup))
        .route("/v1/auth/login", post(login))
        .route("/v1/auth/logout", post(logout))
        .route("/v1/auth/me", get(me))
        .route("/v1/auth/me/chat-language", patch(set_chat_language))
        .route(
            "/v1/admin/accounts",
            post(create_account).get(list_accounts),
        )
        .route("/v1/admin/accounts/{id}/approve", post(approve))
        .route("/v1/admin/accounts/{id}/revoke", post(revoke))
        .route("/v1/admin/accounts/{id}/soft-delete", post(soft_delete))
        .route("/v1/admin/accounts/{id}/reactivate", post(reactivate))
        .route("/v1/admin/accounts/{id}/expiry", patch(set_expiry))
        .route("/v1/admin/accounts/{id}", delete(delete_account))
}

type Reply = Result<Json<AccountResponse>, ApiError>;

/// 로그인한 응답: 쿠키를 심고 계정을 준다(200).
fn signed_in(state: &IdentityState, signed_in: SignedIn) -> Response {
    let cookie = set_auth_cookie(&signed_in.token, state.secure_cookies);
    (
        [(SET_COOKIE, cookie)],
        Json(AccountResponse::from(signed_in.account)),
    )
        .into_response()
}

async fn register(
    State(state): State<IdentityState>,
    JsonBody(body): JsonBody,
) -> Result<(StatusCode, Json<AccountResponse>), ApiError> {
    let input = request::register(&body)?;
    let account = state.accounts.register(input).await?;
    Ok((StatusCode::CREATED, Json(account.into())))
}

async fn setup_status(
    State(state): State<IdentityState>,
) -> Result<Json<SetupStatusResponse>, ApiError> {
    let required = state.accounts.setup_status().await?;
    Ok(Json(SetupStatusResponse { required }))
}

async fn setup(
    State(state): State<IdentityState>,
    JsonBody(body): JsonBody,
) -> Result<Response, ApiError> {
    let input = request::setup(&body)?;
    let result = state.accounts.setup(input).await?;
    Ok(signed_in(&state, result))
}

async fn login(
    State(state): State<IdentityState>,
    JsonBody(body): JsonBody,
) -> Result<Response, ApiError> {
    let input = request::login(&body)?;
    let result = state.accounts.login(input).await?;
    Ok(signed_in(&state, result))
}

async fn logout() -> impl IntoResponse {
    (StatusCode::NO_CONTENT, [(SET_COOKIE, clear_auth_cookie())])
}

async fn me(CurrentAccount(account): CurrentAccount, State(state): State<IdentityState>) -> Reply {
    Ok(Json(state.accounts.me(account.id).await?.into()))
}

async fn set_chat_language(
    CurrentAccount(account): CurrentAccount,
    State(state): State<IdentityState>,
    JsonBody(body): JsonBody,
) -> Reply {
    let language = request::chat_language(&body)?;
    let updated = state
        .accounts
        .set_chat_language(account.id, language)
        .await?;
    Ok(Json(updated.into()))
}

async fn create_account(
    _: AdminAccount,
    State(state): State<IdentityState>,
    JsonBody(body): JsonBody,
) -> Result<(StatusCode, Json<AccountResponse>), ApiError> {
    let input = request::create_account(&body)?;
    let account = state.accounts.create_account(input).await?;
    Ok((StatusCode::CREATED, Json(account.into())))
}

async fn list_accounts(
    _: AdminAccount,
    State(state): State<IdentityState>,
) -> Result<Json<Vec<AccountResponse>>, ApiError> {
    let accounts = state.accounts.list_accounts().await?;
    Ok(Json(accounts.into_iter().map(Into::into).collect()))
}

async fn approve(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
) -> Reply {
    Ok(Json(state.accounts.approve(id).await?.into()))
}

async fn revoke(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
) -> Reply {
    Ok(Json(state.accounts.revoke(id).await?.into()))
}

async fn soft_delete(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
) -> Reply {
    Ok(Json(state.accounts.soft_delete(id).await?.into()))
}

async fn reactivate(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
) -> Reply {
    Ok(Json(state.accounts.reactivate(id).await?.into()))
}

async fn set_expiry(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
    JsonBody(body): JsonBody,
) -> Reply {
    let expires_at = request::set_expiry(&body)?;
    Ok(Json(
        state.accounts.set_expiry(id, expires_at).await?.into(),
    ))
}

async fn delete_account(
    _: AdminAccount,
    State(state): State<IdentityState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    state.accounts.delete_account(id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests;

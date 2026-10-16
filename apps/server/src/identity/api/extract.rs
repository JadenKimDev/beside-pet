//! 인증 추출기와 역할 가드: 쿠키의 토큰을 `Authenticator` 로 확인해 핸들러에 계정을 넘긴다.

use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::COOKIE;
use axum::http::request::Parts;

use super::cookie::AUTH_COOKIE;
use crate::identity::{AuthenticatedAccount, Role, SharedAuthenticator};
use crate::shared::ApiError;

/// 인증된 계정. 쿠키가 없으면 `401 Not authenticated`, 토큰을 확인하지 못하면 `401 Invalid or expired token`.
#[derive(Debug, Clone)]
pub struct CurrentAccount(pub AuthenticatedAccount);

/// 인증된 `admin` 계정. 인증은 `CurrentAccount` 와 같고, 역할이 다르면 `403 Insufficient role`.
#[derive(Debug, Clone)]
pub struct AdminAccount(pub AuthenticatedAccount);

impl<S> FromRequestParts<S> for CurrentAccount
where
    S: Send + Sync,
    SharedAuthenticator: FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<CurrentAccount, ApiError> {
        let token = cookie_value(parts, AUTH_COOKIE)
            .filter(|token| !token.is_empty())
            .ok_or_else(|| ApiError::Unauthorized("Not authenticated".to_owned()))?;
        let authenticator = SharedAuthenticator::from_ref(state);
        authenticator
            .authenticate(&token)
            .await?
            .map(CurrentAccount)
            .ok_or_else(|| ApiError::Unauthorized("Invalid or expired token".to_owned()))
    }
}

impl<S> FromRequestParts<S> for AdminAccount
where
    S: Send + Sync,
    SharedAuthenticator: FromRef<S>,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<AdminAccount, ApiError> {
        let CurrentAccount(account) = CurrentAccount::from_request_parts(parts, state).await?;
        if account.role == Role::Admin {
            Ok(AdminAccount(account))
        } else {
            Err(ApiError::Forbidden("Insufficient role".to_owned()))
        }
    }
}

/// `Cookie` 헤더에서 이름이 맞는 첫 값. cookie-parser 와 같이 앞뒤 공백과 감싼 따옴표를 뗀다.
fn cookie_value(parts: &Parts, name: &str) -> Option<String> {
    parts
        .headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|header| header.to_str().ok())
        .flat_map(|header| header.split(';'))
        .find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key.trim() == name).then(|| {
                let value = value.trim();
                value
                    .strip_prefix('"')
                    .and_then(|v| v.strip_suffix('"'))
                    .unwrap_or(value)
                    .to_owned()
            })
        })
}

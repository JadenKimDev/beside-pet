//! 인증 쿠키 `beside-pet.token` 의 `Set-Cookie` 값(설정과 삭제). 글자 모양은 Express 4 의 `res.cookie`·`res.clearCookie` 와 같다.

use chrono::{Duration, Utc};

pub const AUTH_COOKIE: &str = "beside-pet.token";

const MAX_AGE_SECONDS: i64 = 7 * 24 * 60 * 60;

/// 7일짜리 httpOnly, SameSite=Lax 쿠키. `secure` 는 운영(`NODE_ENV=production`)에서만 참이다.
pub fn set_auth_cookie(token: &str, secure: bool) -> String {
    let expires =
        (Utc::now() + Duration::seconds(MAX_AGE_SECONDS)).format("%a, %d %b %Y %H:%M:%S GMT");
    let secure = if secure { "; Secure" } else { "" };
    format!(
        "{AUTH_COOKIE}={token}; Max-Age={MAX_AGE_SECONDS}; Path=/; Expires={expires}; HttpOnly{secure}; SameSite=Lax"
    )
}

/// `res.clearCookie(AUTH_COOKIE, { path: '/' })` 와 같은 값.
pub fn clear_auth_cookie() -> String {
    format!("{AUTH_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
}

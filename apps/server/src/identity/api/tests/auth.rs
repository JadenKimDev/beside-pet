//! `/v1/auth/*`: 상태 코드, 검증 문구, 쿠키 헤더, 401 두 문구.

use std::sync::Arc;

use axum::http::{Method, StatusCode};
use serde_json::json;

use super::{Harness, send_to, set_cookie, token};
use crate::identity::{IdentityState, Unimplemented};

const SET_PREFIX: &str = "beside-pet.token=tok.en-1; Max-Age=604800; Path=/; Expires=";
const CLEARED: &str = "beside-pet.token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT";

fn assert_auth_cookie(cookies: &[String], secure: bool) {
    assert_eq!(cookies.len(), 1, "{cookies:?}");
    let cookie = &cookies[0];
    assert!(cookie.starts_with(SET_PREFIX), "{cookie}");
    let suffix = if secure {
        "; HttpOnly; Secure; SameSite=Lax"
    } else {
        "; HttpOnly; SameSite=Lax"
    };
    assert!(cookie.ends_with(suffix), "{cookie}");
    let expires = &cookie[SET_PREFIX.len()..cookie.len() - suffix.len()];
    let at = chrono::DateTime::parse_from_rfc2822(expires).expect(expires);
    assert!(expires.ends_with(" GMT"), "{expires}");
    let ahead = at.timestamp() - chrono::Utc::now().timestamp();
    assert!((604_790..=604_800).contains(&ahead), "{ahead}");
}

#[tokio::test]
async fn register_는_201_과_선택_칸을_뺀_계정이다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/register",
            None,
            Some(r#"{"username":"maple","password":"longenough","company":"Acme Pets"}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    assert_eq!(
        reply.body,
        json!({
            "id": "acc-new",
            "username": "maple",
            "company": "Acme Pets",
            "role": "viewer",
            "status": "pending",
            "expired": false,
            "createdAt": "2026-10-01T09:30:00.500Z"
        })
    );
    assert_eq!(
        h.calls(),
        [
            r#"register RegisterInput { username: "maple", password: "longenough", company: "Acme Pets" }"#
        ]
    );
}

#[tokio::test]
async fn register_검증_문구는_class_validator_와_같다() {
    let h = Harness::new(false);
    let reply = h
        .send(Method::POST, "/v1/auth/register", None, Some("{}"))
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body,
        json!({
            "statusCode": 400,
            "message": [
                "username must be longer than or equal to 3 characters",
                "username must be a string",
                "password must be longer than or equal to 8 characters",
                "password must be a string",
                "company should not be empty",
                "company must be a string"
            ],
            "error": "Bad Request"
        })
    );
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/register",
            None,
            Some(r#"{"username":"ab","password":"short","company":"","x":1}"#),
        )
        .await;
    assert_eq!(
        reply.body["message"],
        json!([
            "property x should not exist",
            "username must be longer than or equal to 3 characters",
            "password must be longer than or equal to 8 characters",
            "company should not be empty"
        ])
    );
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn setup_상태는_required_다() {
    let h = Harness::new(false);
    let reply = h.send(Method::GET, "/v1/auth/setup", None, None).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body, json!({ "required": true }));
}

#[tokio::test]
async fn setup_은_200_과_쿠키와_계정이다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/setup",
            None,
            Some(r#"{"token":"one-time","username":"maple","password":"longenough"}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_auth_cookie(&set_cookie(&reply), false);
    assert_eq!(
        reply.body,
        json!({
            "id": "acc-1",
            "username": "maple",
            "company": "Acme Pets",
            "role": "admin",
            "status": "active",
            "expiresAt": "2027-01-02T03:04:05.000Z",
            "expired": true,
            "createdAt": "2026-10-01T09:30:00.500Z",
            "lastLoginAt": "2026-10-15T14:59:59.999Z",
            "chatLanguage": "en"
        })
    );
    assert_eq!(
        h.calls(),
        [
            r#"setup SetupInput { token: "one-time", username: "maple", password: "longenough", company: None }"#
        ]
    );
}

#[tokio::test]
async fn setup_검증_문구() {
    let h = Harness::new(false);
    let reply = h
        .send(Method::POST, "/v1/auth/setup", None, Some("{}"))
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body["message"],
        json!([
            "token should not be empty",
            "token must be a string",
            "username must be longer than or equal to 3 characters",
            "username must be a string",
            "password must be longer than or equal to 8 characters",
            "password must be a string"
        ])
    );
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/setup",
            None,
            Some(r#"{"token":"","username":"ab","password":"p","company":3}"#),
        )
        .await;
    assert_eq!(
        reply.body["message"],
        json!([
            "token should not be empty",
            "username must be longer than or equal to 3 characters",
            "password must be longer than or equal to 8 characters",
            "company must be a string"
        ])
    );
    assert!(set_cookie(&reply).is_empty());
}

#[tokio::test]
async fn login_은_200_과_쿠키다_운영이면_secure() {
    for secure in [false, true] {
        let h = Harness::new(secure);
        let reply = h
            .send(
                Method::POST,
                "/v1/auth/login",
                None,
                Some(r#"{"username":"maple","password":"pw"}"#),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK);
        assert_auth_cookie(&set_cookie(&reply), secure);
        assert_eq!(reply.body["id"], "acc-1");
        assert_eq!(
            h.calls(),
            [r#"login LoginInput { username: "maple", password: "pw" }"#]
        );
    }
}

#[tokio::test]
async fn login_실패는_서비스의_오류_그대로이고_쿠키가_없다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/login",
            None,
            Some(r#"{"username":"nobody","password":"pw"}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 401, "message": "Invalid credentials", "error": "Unauthorized" })
    );
    assert!(set_cookie(&reply).is_empty());
}

#[tokio::test]
async fn login_검증_문구() {
    let h = Harness::new(false);
    let reply = h
        .send(Method::POST, "/v1/auth/login", None, Some("{}"))
        .await;
    assert_eq!(
        reply.body["message"],
        json!([
            "username should not be empty",
            "username must be a string",
            "password should not be empty",
            "password must be a string"
        ])
    );
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/login",
            None,
            Some(r#"{"username":"","password":5}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body["message"],
        json!(["username should not be empty", "password must be a string"])
    );
}

#[tokio::test]
async fn logout_은_204_와_쿠키_삭제다_인증이_없어도() {
    let h = Harness::new(true);
    let reply = h.send(Method::POST, "/v1/auth/logout", None, None).await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(set_cookie(&reply), [CLEARED]);
    assert_eq!(reply.body, serde_json::Value::Null);
}

#[tokio::test]
async fn logout_은_쿠키가_없으면_계정_서비스를_부르지_않는다() {
    let h = Harness::new(false);
    h.send(Method::POST, "/v1/auth/logout", None, None).await;
    h.send(
        Method::POST,
        "/v1/auth/logout",
        Some("beside-pet.token="),
        None,
    )
    .await;
    assert!(h.calls().is_empty(), "{:?}", h.calls());
}

#[tokio::test]
async fn logout_은_쿠키의_토큰으로_로그아웃을_적고_204_와_쿠키_삭제다() {
    let h = Harness::new(true);
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/logout",
            Some(&token("viewer")),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(set_cookie(&reply), [CLEARED]);
    assert_eq!(h.calls(), ["log_out viewer"]);
}

#[tokio::test]
async fn logout_을_적지_못하면_그_오류지만_쿠키는_지운다() {
    let h = Harness::new(false);
    let state = IdentityState {
        accounts: Arc::new(Unimplemented),
        ..h.state.clone()
    };
    let reply = send_to(
        state,
        Method::POST,
        "/v1/auth/logout",
        Some(&token("viewer")),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED);
    assert_eq!(set_cookie(&reply), [CLEARED]);
}

#[tokio::test]
async fn me_는_쿠키가_없으면_401_not_authenticated() {
    let h = Harness::new(false);
    let reply = h.send(Method::GET, "/v1/auth/me", None, None).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 401, "message": "Not authenticated", "error": "Unauthorized" })
    );
    let reply = h
        .send(
            Method::GET,
            "/v1/auth/me",
            Some("other=1; beside-pet.token="),
            None,
        )
        .await;
    assert_eq!(reply.body["message"], "Not authenticated");
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn me_는_확인되지_않는_토큰이면_401_invalid_or_expired_token() {
    let h = Harness::new(false);
    let reply = h
        .send(Method::GET, "/v1/auth/me", Some(&token("forged")), None)
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 401, "message": "Invalid or expired token", "error": "Unauthorized" })
    );
    let reply = h
        .send(Method::GET, "/v1/auth/me", Some(&token("gone")), None)
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.body["message"], "Account is unavailable");
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn me_는_토큰의_계정으로_부른다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::GET,
            "/v1/auth/me",
            Some("theme=dark; beside-pet.token=viewer; x=y"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body["id"], "viewer-id");
    assert_eq!(h.calls(), ["me viewer-id"]);
}

#[tokio::test]
async fn me_의_has_profile_은_남아_있는_세션의_유무다() {
    for has_sessions in [true, false] {
        let h = Harness::with_sessions(has_sessions);
        let reply = h
            .send(Method::GET, "/v1/auth/me", Some(&token("viewer")), None)
            .await;
        assert_eq!(reply.status, StatusCode::OK);
        assert_eq!(reply.body["hasProfile"], json!(has_sessions));
        assert_eq!(reply.body["id"], "viewer-id", "계정 칸은 그대로다");
        assert_eq!(reply.body["username"], "maple");
        assert_eq!(h.sessions.asked(), ["viewer-id"]);
    }
}

#[tokio::test]
async fn me_의_세션_유무가_구현이_없으면_501_이다() {
    let h = Harness::new(false);
    let state = IdentityState {
        sessions: Arc::new(Unimplemented),
        ..h.state.clone()
    };
    let reply = send_to(
        state,
        Method::GET,
        "/v1/auth/me",
        Some(&token("viewer")),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED);
}

#[tokio::test]
async fn chat_language_는_인증이_검증보다_먼저다() {
    let h = Harness::new(false);
    let reply = h
        .send(Method::PATCH, "/v1/auth/me/chat-language", None, Some("{}"))
        .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.body["message"], "Not authenticated");
}

#[tokio::test]
async fn chat_language_검증과_호출() {
    let h = Harness::new(false);
    let viewer = token("viewer");
    for body in ["{}", r#"{"chatLanguage":"fr"}"#] {
        let reply = h
            .send(
                Method::PATCH,
                "/v1/auth/me/chat-language",
                Some(&viewer),
                Some(body),
            )
            .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST);
        assert_eq!(
            reply.body["message"],
            json!(["chatLanguage must be one of the following values: ko, en"])
        );
    }
    let reply = h
        .send(
            Method::PATCH,
            "/v1/auth/me/chat-language",
            Some(&viewer),
            Some(r#"{"chatLanguage":"ko"}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body["id"], "viewer-id");
    assert_eq!(h.calls(), ["set_chat_language viewer-id Ko"]);
}

#[tokio::test]
async fn unimplemented_는_501_이고_인증은_늘_401_이다() {
    let state = IdentityState {
        accounts: Arc::new(Unimplemented),
        authenticator: Arc::new(Unimplemented),
        sessions: Arc::new(Unimplemented),
        secure_cookies: false,
    };
    let reply = send_to(
        state.clone(),
        Method::POST,
        "/v1/auth/login",
        None,
        Some(r#"{"username":"maple","password":"pw"}"#),
    )
    .await;
    assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 501, "message": "Not implemented", "error": "Not Implemented" })
    );
    assert!(set_cookie(&reply).is_empty());
    let reply = send_to(state.clone(), Method::GET, "/v1/auth/setup", None, None).await;
    assert_eq!(reply.status, StatusCode::NOT_IMPLEMENTED);
    let reply = send_to(
        state,
        Method::GET,
        "/v1/auth/me",
        Some(&token("admin")),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.body["message"], "Invalid or expired token");
}

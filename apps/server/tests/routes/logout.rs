//! 로그아웃이 그 전 토큰을 무효로 한다: 실제 계정 구현(`IdentityService`)과 테스트 스키마로 돈다.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다). 아이디와 비밀번호는 지어낸 값이다.

use std::sync::Arc;
use std::time::Duration;

use axum::http::{Method, StatusCode};
use chrono::Utc;
use serde_json::json;

use beside_pet_server::app::Services;
use beside_pet_server::identity::IdentityService;
use beside_pet_server::support;

use crate::db::TestSchema;
use crate::harness::{Harness, Reply};

const USERNAME: &str = "fern-fixture";
const PASSWORD: &str = "fixture-pass-logout";

/// 응답이 심은 인증 쿠키의 값.
fn issued_token(reply: &Reply) -> String {
    let cookie = reply
        .headers
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok())
        .find_map(|v| v.strip_prefix("beside-pet.token="))
        .expect("인증 쿠키가 없다");
    cookie.split(';').next().unwrap_or_default().to_owned()
}

/// 토큰의 `iat` 는 초 단위라 같은 초의 로그아웃은 그 토큰을 막지 않는다(PRD 의 경계). 다음 초가 될 때까지 기다린다.
async fn wait_for_next_second() {
    let into = Utc::now().timestamp_subsec_millis();
    tokio::time::sleep(Duration::from_millis(u64::from(1_000 - into.min(999)) + 20)).await;
}

async fn login(h: &Harness) -> String {
    let reply = h
        .send(
            Method::POST,
            "/v1/auth/login",
            None,
            Some(json!({ "username": USERNAME, "password": PASSWORD })),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    issued_token(&reply)
}

#[tokio::test]
async fn 로그아웃_뒤에는_같은_쿠키가_401_이고_다시_로그인한_토큰은_200_이다() {
    let schema = TestSchema::open().await;
    let identity = Arc::new(
        IdentityService::start(schema.pool.clone(), "fixture-secret-not-real", Some("1h"))
            .await
            .unwrap(),
    );
    let h = Harness::with_services(Services {
        accounts: identity.clone(),
        authenticator: identity,
        session_presence: support::session_presence(schema.pool.clone()),
        ..Services::unimplemented()
    });

    let reply = h
        .send(
            Method::POST,
            "/v1/auth/register",
            None,
            Some(
                json!({ "username": USERNAME, "password": PASSWORD, "company": "Fictional Pets" }),
            ),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED, "{}", reply.text);
    schema
        .exec("UPDATE accounts SET status = 'active' WHERE username = 'fern-fixture'")
        .await;

    let old = login(&h).await;
    let reply = h.send(Method::GET, "/v1/auth/me", Some(&old), None).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);

    wait_for_next_second().await;
    let reply = h
        .send(Method::POST, "/v1/auth/logout", Some(&old), None)
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT, "{}", reply.text);

    let reply = h.send(Method::GET, "/v1/auth/me", Some(&old), None).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(
        reply.body,
        json!({ "statusCode": 401, "message": "Invalid or expired token", "error": "Unauthorized" })
    );

    // 로그아웃과 같은 초일 수 있는 새 로그인도 산다.
    let fresh = login(&h).await;
    let reply = h.send(Method::GET, "/v1/auth/me", Some(&fresh), None).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(reply.body["username"], USERNAME);

    schema.close().await;
}

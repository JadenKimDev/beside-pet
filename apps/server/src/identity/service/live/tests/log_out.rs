//! 로그아웃: 그 계정의 그 전 토큰을 모두 무효로 하고, 같은 초에 다시 발급한 토큰은 산다.

use std::sync::Arc;

use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{ADMIN_NAME, ADMIN_PASSWORD, Fixture, SECRET, fixed_now, login_input};
use crate::identity::IdentityService;
use crate::identity::setup::SetupGate;
use crate::identity::token::TokenSigner;
use crate::identity::{AccountService, Authenticator};

/// `fixed_now` 와 같은 초의 0.75 초 뒤.
fn same_second() -> DateTime<Utc> {
    fixed_now() + Duration::milliseconds(750)
}

/// `fixed_now` 의 다음 초.
fn next_second() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 1).unwrap()
}

/// 같은 스키마 위에서 시계만 다른 서비스.
fn service_at(fixture: &Fixture, now: fn() -> DateTime<Utc>) -> IdentityService {
    IdentityService::new(
        fixture.schema.store(),
        TokenSigner::new(SECRET, "1h").unwrap(),
        Arc::new(SetupGate::closed()),
        now,
    )
}

#[tokio::test]
async fn 로그아웃_뒤의_다음_초에는_그_전_토큰이_통하지_않는다() {
    let (fixture, admin) = Fixture::with_admin().await;
    let later = service_at(&fixture, next_second);
    assert!(later.authenticate(&admin.token).await.unwrap().is_some());

    later.log_out(admin.token.clone()).await.unwrap();
    assert_eq!(later.authenticate(&admin.token).await.unwrap(), None);

    // 로그아웃 뒤 다시 로그인한 토큰은 통한다.
    let again = later
        .login(login_input(ADMIN_NAME, ADMIN_PASSWORD))
        .await
        .unwrap();
    assert!(later.authenticate(&again.token).await.unwrap().is_some());
    assert_eq!(later.authenticate(&admin.token).await.unwrap(), None);
    fixture.close().await;
}

#[tokio::test]
async fn 로그아웃과_같은_초에_발급한_토큰은_산다() {
    let (fixture, admin) = Fixture::with_admin().await;
    // 발급은 9:00:00.000, 로그아웃은 9:00:00.750.
    let same = service_at(&fixture, same_second);
    same.log_out(admin.token.clone()).await.unwrap();
    let stored = fixture
        .schema
        .store()
        .find_by_username(ADMIN_NAME)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.tokens_valid_from, Some(same_second()));
    assert!(same.authenticate(&admin.token).await.unwrap().is_some());
    fixture.close().await;
}

#[tokio::test]
async fn 읽을_수_없는_토큰의_로그아웃은_아무것도_하지_않는다() {
    let (fixture, admin) = Fixture::with_admin().await;
    let later = service_at(&fixture, next_second);
    later.log_out("not.a.token".to_owned()).await.unwrap();
    later.log_out(String::new()).await.unwrap();
    let stored = fixture
        .schema
        .store()
        .find_by_username(ADMIN_NAME)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.tokens_valid_from, None);
    assert!(later.authenticate(&admin.token).await.unwrap().is_some());
    fixture.close().await;
}

//! 로그인과 토큰 확인(가드).

use chrono::Duration;

use super::{
    ADMIN_NAME, ADMIN_PASSWORD, Fixture, SECRET, VIEWER_NAME, fixed_now, login_input,
    register_input, unauthorized,
};
use crate::identity::token::{TokenClaims, TokenSigner};
use crate::identity::{AccountService, Authenticator, Role};
use crate::shared::ApiError;

#[tokio::test]
async fn 틀린_비밀번호와_없는_아이디는_같은_문구다() {
    let (fixture, _) = Fixture::with_admin().await;
    let wrong_password = fixture
        .service
        .login(login_input(ADMIN_NAME, "not-the-password"))
        .await
        .unwrap_err();
    let unknown_name = fixture
        .service
        .login(login_input("nobody-here", ADMIN_PASSWORD))
        .await
        .unwrap_err();
    assert_eq!(wrong_password, unauthorized("Invalid username or password"));
    assert_eq!(unknown_name, wrong_password);
    fixture.close().await;
}

#[tokio::test]
async fn 로그인은_마지막_로그인_시각을_남긴다() {
    let (fixture, _) = Fixture::with_admin().await;
    let signed = fixture
        .service
        .login(login_input(ADMIN_NAME, ADMIN_PASSWORD))
        .await
        .unwrap();
    assert_eq!(signed.account.last_login_at, Some(fixed_now()));
    let stored = fixture
        .schema
        .store()
        .find_by_username(ADMIN_NAME)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored.last_login_at, Some(fixed_now()));
    fixture.close().await;
}

#[tokio::test]
async fn 비밀번호는_argon2id_해시로만_저장한다() {
    let (fixture, _) = Fixture::with_admin().await;
    fixture
        .service
        .register(super::register_input())
        .await
        .unwrap();
    for (name, plain) in [
        (ADMIN_NAME, ADMIN_PASSWORD),
        (VIEWER_NAME, super::VIEWER_PASSWORD),
    ] {
        let stored = fixture
            .schema
            .store()
            .find_by_username(name)
            .await
            .unwrap()
            .unwrap();
        assert!(stored.password_hash.starts_with("$argon2id$"), "{name}");
        assert!(!stored.password_hash.contains(plain), "{name}");
    }
    fixture.close().await;
}

#[tokio::test]
async fn 읽을_수_없는_토큰은_none_이다() {
    let (fixture, admin) = Fixture::with_admin().await;
    let other_secret = TokenSigner::new("another-fixture-secret", "1h")
        .unwrap()
        .sign(
            &TokenClaims {
                sub: admin.account.id.clone(),
                role: Role::Admin,
            },
            fixed_now(),
        )
        .unwrap();
    let mut tampered = admin.token.clone();
    tampered.push('x');
    for token in ["", "not-a-jwt", tampered.as_str(), other_secret.as_str()] {
        assert_eq!(
            fixture.service.authenticate(token).await,
            Ok(None),
            "{token:?}"
        );
    }
    fixture.close().await;
}

#[tokio::test]
async fn 수명이_다한_토큰은_none_이다() {
    let (fixture, admin) = Fixture::with_admin().await;
    let stale = TokenSigner::new(SECRET, "1h")
        .unwrap()
        .sign(
            &TokenClaims {
                sub: admin.account.id.clone(),
                role: Role::Admin,
            },
            fixed_now() - Duration::hours(2),
        )
        .unwrap();
    assert_eq!(fixture.service.authenticate(&stale).await, Ok(None));
    fixture.close().await;
}

#[tokio::test]
async fn 토큰은_맞지만_계정이_없으면_401_이다() {
    let fixture = Fixture::fresh().await;
    let orphan = TokenSigner::new(SECRET, "1h")
        .unwrap()
        .sign(
            &TokenClaims {
                sub: "00000000-0000-4000-8000-000000000000".to_owned(),
                role: Role::Admin,
            },
            fixed_now(),
        )
        .unwrap();
    assert_eq!(
        fixture.service.authenticate(&orphan).await,
        Err(unauthorized("Account is unavailable"))
    );
    fixture.close().await;
}

#[tokio::test]
async fn 신청한_아이디가_이미_있으면_409_다() {
    let fixture = Fixture::fresh().await;
    fixture.service.register(register_input()).await.unwrap();
    assert_eq!(
        fixture
            .service
            .register(register_input())
            .await
            .unwrap_err(),
        ApiError::Conflict(format!("Username already exists: {VIEWER_NAME}"))
    );
    fixture.close().await;
}

#[tokio::test]
async fn 대화_언어를_바꾸면_me_에_보인다() {
    let (fixture, admin) = Fixture::with_admin().await;
    let id = admin.account.id.clone();
    let updated = fixture
        .service
        .set_chat_language(id.clone(), crate::identity::ChatLanguage::Ko)
        .await
        .unwrap();
    assert_eq!(
        updated.chat_language,
        Some(crate::identity::ChatLanguage::Ko)
    );
    assert_eq!(
        fixture.service.me(id).await.unwrap().chat_language,
        Some(crate::identity::ChatLanguage::Ko)
    );
    assert_eq!(
        fixture
            .service
            .set_chat_language("no-such-id".to_owned(), crate::identity::ChatLanguage::En)
            .await
            .unwrap_err(),
        ApiError::NotFound("Account not found".to_owned())
    );
    fixture.close().await;
}

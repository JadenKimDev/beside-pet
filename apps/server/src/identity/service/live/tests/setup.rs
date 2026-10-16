//! 첫 관리자 setup 과 기동 때의 게이트.

use super::{Fixture, SECRET, SETUP_TOKEN, VIEWER_NAME, register_input, setup_input};
use crate::identity::service::live::{IdentityService, StartError};
use crate::identity::setup::SetupGate;
use crate::identity::store::tests::AccountsSchema;
use crate::identity::{AccountService, SetupInput};
use crate::shared::ApiError;

#[tokio::test]
async fn 두_번째_setup_은_409_다() {
    let (fixture, _) = Fixture::with_admin().await;
    assert_eq!(
        fixture
            .service
            .setup(setup_input(SETUP_TOKEN))
            .await
            .unwrap_err(),
        ApiError::Conflict("Setup is already complete".to_owned())
    );
    fixture.close().await;
}

#[tokio::test]
async fn 틀린_토큰은_403_이고_토큰을_쓰지_않는다() {
    let fixture = Fixture::fresh().await;
    let wrong = "f".repeat(SETUP_TOKEN.len());
    assert_eq!(
        fixture
            .service
            .setup(setup_input(&wrong))
            .await
            .unwrap_err(),
        ApiError::Forbidden("Invalid setup token".to_owned())
    );
    assert!(fixture.service.setup_status().await.unwrap());
    fixture
        .service
        .setup(setup_input(SETUP_TOKEN))
        .await
        .unwrap();
    fixture.close().await;
}

#[tokio::test]
async fn 닫힌_게이트는_setup_이_필요_없고_409_다() {
    let fixture = Fixture::with_gate(SetupGate::closed()).await;
    assert!(!fixture.service.setup_status().await.unwrap());
    assert_eq!(
        fixture
            .service
            .setup(setup_input(SETUP_TOKEN))
            .await
            .unwrap_err(),
        ApiError::Conflict("Setup is already complete".to_owned())
    );
    fixture.close().await;
}

#[tokio::test]
async fn setup_은_고른_회사_이름을_쓴다() {
    let fixture = Fixture::fresh().await;
    let admin = fixture
        .service
        .setup(SetupInput {
            company: Some("Fictional Shelter".to_owned()),
            ..setup_input(SETUP_TOKEN)
        })
        .await
        .unwrap();
    assert_eq!(admin.account.company, "Fictional Shelter");
    fixture.close().await;
}

#[tokio::test]
async fn setup_의_아이디가_이미_있으면_409_다() {
    let fixture = Fixture::fresh().await;
    fixture.service.register(register_input()).await.unwrap();
    let taken = SetupInput {
        username: VIEWER_NAME.to_owned(),
        ..setup_input(SETUP_TOKEN)
    };
    assert_eq!(
        fixture.service.setup(taken).await.unwrap_err(),
        ApiError::Conflict(format!("Username already exists: {VIEWER_NAME}"))
    );
    fixture.close().await;
}

#[tokio::test]
async fn 기동_때_관리자가_없으면_게이트를_열고_있으면_닫는다() {
    let schema = AccountsSchema::open().await;
    let fresh = IdentityService::boot(schema.store(), SECRET, "7d")
        .await
        .unwrap();
    assert!(fresh.setup_status().await.unwrap());

    // 신청한 viewer 만 있어도 관리자가 없으므로 열린다
    fresh.register(register_input()).await.unwrap();
    let still_fresh = IdentityService::boot(schema.store(), SECRET, "7d")
        .await
        .unwrap();
    assert!(still_fresh.setup_status().await.unwrap());

    // 기동 로그의 토큰은 테스트가 볼 수 없으므로 열린 게이트를 하나 더 만들어 관리자를 들인다
    let (with_admin, _) = Fixture::with_admin().await;
    let rebooted = IdentityService::boot(with_admin.schema.store(), SECRET, "7d")
        .await
        .unwrap();
    assert!(!rebooted.setup_status().await.unwrap());

    with_admin.close().await;
    schema.close().await;
}

#[tokio::test]
async fn 읽지_못하는_jwt_ttl_이면_기동하지_않는다() {
    let schema = AccountsSchema::open().await;
    for ttl in ["", "soon", "0", "-5m"] {
        assert!(
            matches!(
                IdentityService::boot(schema.store(), SECRET, ttl).await,
                Err(StartError::InvalidTtl)
            ),
            "{ttl:?}"
        );
    }
    schema.close().await;
}

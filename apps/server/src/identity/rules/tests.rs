use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{AccountRecord, ApplicationInput, IssueInput};
use crate::identity::{Account, AccountStatus, ChatLanguage, Role};

fn at(hour: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, hour, 0, 0).unwrap()
}

fn issued(role: Role, expires_at: Option<DateTime<Utc>>) -> AccountRecord {
    AccountRecord::issue(IssueInput {
        id: "acc-1".to_owned(),
        username: "maple".to_owned(),
        password_hash: "hash-of-something".to_owned(),
        company: "Fictional Co".to_owned(),
        role,
        created_at: at(1),
        expires_at,
    })
}

fn applied() -> AccountRecord {
    AccountRecord::apply(ApplicationInput {
        id: "acc-2".to_owned(),
        username: "willow".to_owned(),
        password_hash: "hash-of-other".to_owned(),
        company: "Imaginary Ltd".to_owned(),
        created_at: at(2),
    })
}

#[test]
fn 발급한_계정은_active_로_역할과_만료를_가진다() {
    let record = issued(Role::Admin, Some(at(9)));
    assert_eq!(record.id, "acc-1");
    assert_eq!(record.username, "maple");
    assert_eq!(record.password_hash, "hash-of-something");
    assert_eq!(record.company, "Fictional Co");
    assert_eq!(record.role, Role::Admin);
    assert_eq!(record.status, AccountStatus::Active);
    assert_eq!(record.created_at, at(1));
    assert_eq!(record.expires_at, Some(at(9)));
    assert_eq!(record.last_login_at, None);
    assert_eq!(record.chat_language, None);
}

#[test]
fn 신청한_계정은_pending_인_viewer_로_만료가_없다() {
    let record = applied();
    assert_eq!(record.role, Role::Viewer);
    assert_eq!(record.status, AccountStatus::Pending);
    assert_eq!(record.created_at, at(2));
    assert_eq!(record.expires_at, None);
    assert_eq!(record.last_login_at, None);
    assert_eq!(record.chat_language, None);
}

#[test]
fn 승인하면_pending_이_active_가_된다() {
    let mut record = applied();
    record.approve();
    assert_eq!(record.status, AccountStatus::Active);
}

#[test]
fn 정지_삭제_재개는_상태를_따지지_않고_바꾼다() {
    let mut record = issued(Role::Viewer, None);
    record.revoke();
    assert_eq!(record.status, AccountStatus::Revoked);
    record.soft_delete();
    assert_eq!(record.status, AccountStatus::Deleted);
    record.reactivate();
    assert_eq!(record.status, AccountStatus::Active);

    let mut pending = applied();
    pending.reactivate();
    assert_eq!(pending.status, AccountStatus::Active);
}

#[test]
fn 만료를_정하고_지운다() {
    let mut record = issued(Role::Viewer, None);
    record.set_expiry(Some(at(5)));
    assert_eq!(record.expires_at, Some(at(5)));
    record.set_expiry(Some(at(7)));
    assert_eq!(record.expires_at, Some(at(7)));
    record.set_expiry(None);
    assert_eq!(record.expires_at, None);
}

#[test]
fn 만료는_그_시각에_닿으면_참이다() {
    let record = issued(Role::Viewer, Some(at(5)));
    assert!(!record.is_expired(at(5) - Duration::milliseconds(1)));
    assert!(record.is_expired(at(5)));
    assert!(record.is_expired(at(6)));
}

#[test]
fn 만료가_없으면_만료되지_않는다() {
    assert!(!issued(Role::Viewer, None).is_expired(at(23)));
}

#[test]
fn 대화_언어와_마지막_로그인을_적는다() {
    let mut record = issued(Role::Viewer, None);
    record.set_chat_language(ChatLanguage::En);
    assert_eq!(record.chat_language, Some(ChatLanguage::En));
    record.set_chat_language(ChatLanguage::Ko);
    assert_eq!(record.chat_language, Some(ChatLanguage::Ko));
    record.record_login(at(3));
    assert_eq!(record.last_login_at, Some(at(3)));
    record.record_login(at(4));
    assert_eq!(record.last_login_at, Some(at(4)));
}

#[test]
fn 바깥_계정은_해시가_없고_expired_를_지금_시각으로_계산한다() {
    let mut record = issued(Role::Admin, Some(at(5)));
    record.record_login(at(3));
    record.set_chat_language(ChatLanguage::Ko);
    let before = record.to_account(at(4));
    assert_eq!(
        before,
        Account {
            id: "acc-1".to_owned(),
            username: "maple".to_owned(),
            company: "Fictional Co".to_owned(),
            role: Role::Admin,
            status: AccountStatus::Active,
            expires_at: Some(at(5)),
            expired: false,
            created_at: at(1),
            last_login_at: Some(at(3)),
            chat_language: Some(ChatLanguage::Ko),
        }
    );
    assert!(record.to_account(at(5)).expired);
}

fn second(hour: u32, sec: u32, millis: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, hour, 0, sec).unwrap()
        + Duration::milliseconds(millis.into())
}

#[test]
fn 로그아웃한_적이_없으면_어느_토큰이든_받는다() {
    let record = issued(Role::Viewer, None);
    assert_eq!(record.tokens_valid_from, None);
    assert!(record.accepts_token_issued_at(second(1, 0, 0).timestamp()));
    assert!(record.accepts_token_issued_at(0));
}

#[test]
fn 로그아웃보다_앞선_초에_발급한_토큰은_받지_않는다() {
    let mut record = issued(Role::Viewer, None);
    record.tokens_valid_from = Some(second(9, 10, 0));
    assert!(!record.accepts_token_issued_at(second(9, 9, 999).timestamp()));
    assert!(!record.accepts_token_issued_at(second(8, 0, 0).timestamp()));
}

#[test]
fn 로그아웃과_같은_초나_뒤에_발급한_토큰은_받는다() {
    let mut record = issued(Role::Viewer, None);
    // 로그아웃이 10.750 초에 적혀도 10 초에 발급한 토큰(iat 는 초 단위)은 산다.
    record.tokens_valid_from = Some(second(9, 10, 750));
    assert!(record.accepts_token_issued_at(second(9, 10, 0).timestamp()));
    assert!(record.accepts_token_issued_at(second(9, 11, 0).timestamp()));
}

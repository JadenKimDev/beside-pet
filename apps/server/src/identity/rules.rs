//! 저장된 계정의 상태 전이 규칙. 시각과 id 는 부른 쪽이 넘긴다(I/O 없음).
//!
//! 전이는 지금 상태를 따지지 않고 그대로 바꾼다(TS 애그리게이트와 같다). 어느 상태에서 무엇을 허락할지는
//! 흐름이 정한다. `expired` 는 저장하지 않고 `now` 에 대해 계산한다.

use chrono::{DateTime, Months, Utc};

use super::{Account, AccountStatus, ChatLanguage, Role};

/// 정지한 계정을 완전히 지울 수 있기까지 두는 달 수. 완전 삭제의 가드가 쓰고, 기동 파기는 같은 값을 넘긴다(ADR-0036).
pub const SUSPENSION_HOLD_MONTHS: u32 = 3;

/// `now` 에서 달력으로 `months` 달 앞의 시각(UTC). 그 달에 같은 날이 없으면 그 달의 마지막 날이다.
/// 이보다 앞서 정지한 계정이 보관 기간을 지났다.
pub fn suspension_cutoff(now: DateTime<Utc>, months: u32) -> DateTime<Utc> {
    now.checked_sub_months(Months::new(months))
        .unwrap_or(DateTime::<Utc>::MIN_UTC)
}

/// `accounts` 의 한 줄. 비밀번호는 해시만 담는다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountRecord {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub role: Role,
    pub status: AccountStatus,
    pub created_at: DateTime<Utc>,
    pub last_login_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub chat_language: Option<ChatLanguage>,
    /// 마지막 로그아웃 시각. 이보다 앞선 초에 발급한 토큰은 받지 않는다. 로그아웃한 적이 없으면 `None`.
    pub tokens_valid_from: Option<DateTime<Utc>>,
    /// 정지(`Deleted`)한 시각. 정지 상태일 때만 있다. 마이그레이션 전에 정지한 계정은 `None` 이다.
    pub deleted_at: Option<DateTime<Utc>>,
}

/// 관리자(또는 첫 설치)가 계정을 발급할 때 넘기는 값.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IssueInput {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// 방문자가 스스로 신청할 때 넘기는 값. 역할은 늘 `Viewer` 다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApplicationInput {
    pub id: String,
    pub username: String,
    pub password_hash: String,
    pub company: String,
    pub created_at: DateTime<Utc>,
}

impl AccountRecord {
    /// 발급한 계정은 곧바로 `Active` 다.
    pub fn issue(input: IssueInput) -> AccountRecord {
        AccountRecord {
            id: input.id,
            username: input.username,
            password_hash: input.password_hash,
            company: input.company,
            role: input.role,
            status: AccountStatus::Active,
            created_at: input.created_at,
            last_login_at: None,
            expires_at: input.expires_at,
            chat_language: None,
            tokens_valid_from: None,
            deleted_at: None,
        }
    }

    /// 신청한 계정은 관리자가 승인할 때까지 `Pending` 인 `Viewer` 다.
    pub fn apply(input: ApplicationInput) -> AccountRecord {
        AccountRecord {
            id: input.id,
            username: input.username,
            password_hash: input.password_hash,
            company: input.company,
            role: Role::Viewer,
            status: AccountStatus::Pending,
            created_at: input.created_at,
            last_login_at: None,
            expires_at: None,
            chat_language: None,
            tokens_valid_from: None,
            deleted_at: None,
        }
    }

    pub fn approve(&mut self) {
        self.leave_suspension(AccountStatus::Active);
    }

    pub fn revoke(&mut self) {
        self.leave_suspension(AccountStatus::Revoked);
    }

    /// 정지한다. 이미 정지한 계정이면 처음 정지한 시각(없으면 없는 대로)을 그대로 둔다.
    pub fn soft_delete(&mut self, at: DateTime<Utc>) {
        if self.status != AccountStatus::Deleted {
            self.deleted_at = Some(at);
        }
        self.status = AccountStatus::Deleted;
    }

    pub fn reactivate(&mut self) {
        self.leave_suspension(AccountStatus::Active);
    }

    /// 정지가 아닌 상태로 바꾸고 정지 시각을 비운다.
    fn leave_suspension(&mut self, status: AccountStatus) {
        self.status = status;
        self.deleted_at = None;
    }

    /// 완전히 지울 수 있는가: 정지했고 그 시각이 `now` 의 `months` 달 앞보다 이르다.
    /// 정지 시각이 없는 정지 계정(마이그레이션 전 정지)은 지울 수 없다.
    pub fn may_be_deleted(&self, now: DateTime<Utc>, months: u32) -> bool {
        self.status == AccountStatus::Deleted
            && self
                .deleted_at
                .is_some_and(|deleted_at| deleted_at < suspension_cutoff(now, months))
    }

    /// 절대 만료 시각을 정하거나(`Some`) 지운다(`None`).
    pub fn set_expiry(&mut self, expires_at: Option<DateTime<Utc>>) {
        self.expires_at = expires_at;
    }

    pub fn set_chat_language(&mut self, language: ChatLanguage) {
        self.chat_language = Some(language);
    }

    pub fn record_login(&mut self, at: DateTime<Utc>) {
        self.last_login_at = Some(at);
    }

    /// 만료 시각에 닿았으면(같은 시각 포함) 참이다.
    pub fn is_expired(&self, now: DateTime<Utc>) -> bool {
        self.expires_at.is_some_and(|expires_at| expires_at <= now)
    }

    /// `issued_at`(토큰의 `iat`, 초)에 발급한 토큰을 아직 받는가. 비교는 초 단위다:
    /// `iat 초 < 로그아웃 시각의 초(내림)` 이면 받지 않으므로, 로그아웃과 같은 초에 새로 로그인한 토큰은 산다.
    pub fn accepts_token_issued_at(&self, issued_at: i64) -> bool {
        self.tokens_valid_from
            .is_none_or(|valid_from| issued_at >= valid_from.timestamp())
    }

    /// 바깥에 보이는 계정. 해시는 빠지고 `expired` 는 `now` 에 대해 계산한다.
    pub fn to_account(&self, now: DateTime<Utc>) -> Account {
        Account {
            id: self.id.clone(),
            username: self.username.clone(),
            company: self.company.clone(),
            role: self.role,
            status: self.status,
            expires_at: self.expires_at,
            expired: self.is_expired(now),
            created_at: self.created_at,
            last_login_at: self.last_login_at,
            chat_language: self.chat_language,
            deleted_at: self.deleted_at,
        }
    }
}

#[cfg(test)]
mod tests;

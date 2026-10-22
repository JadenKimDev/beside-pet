//! 계정과 인증: 계정의 등록·승인·만료, 쿠키 토큰의 발급과 확인, 인증 추출기와 역할 가드.
//! 대화나 모델은 맡지 않는다. 바깥에는 trait(`AccountService`, `Authenticator`)로 보이고, 그 구현(`IdentityService`)을
//! `app.rs` 가 기동 때 만들어 끼운다. 계정의 세션 유무와 대화 활동은 `SessionPresence` 로, 완전 삭제 때의 대화·기억 지우기는
//! `OwnedDataPurger` 로 묻고 대화 기능이 구현한다. 기동 파기에는 `SuspendedAccounts` 로 보관 기간이 지난 정지 계정을 내준다.

mod account;
mod api;
mod password;
mod rules;
mod service;
mod setup;
mod store;
mod token;

pub use account::{Account, AccountStatus, AuthenticatedAccount, ChatLanguage, Role};
pub use api::{AdminAccount, CurrentAccount, IdentityState, router};
pub use rules::SUSPENSION_HOLD_MONTHS;
pub use service::suspended::suspended_accounts;
pub use service::{
    AccountActivity, AccountService, Authenticator, BoxFuture, CreateAccountInput, IdentityService,
    LoginInput, OwnedDataPurger, RegisterInput, SessionPresence, SetupInput, SharedAccountService,
    SharedAuthenticator, SharedOwnedDataPurger, SharedSessionPresence, SharedSuspendedAccounts,
    SignedIn, StartError, SuspendedAccounts, Unimplemented,
};

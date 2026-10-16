//! 계정과 인증: 계정의 등록·승인·만료, 쿠키 토큰의 발급과 확인, 인증 추출기와 역할 가드.
//! 대화나 모델은 맡지 않는다. 바깥에는 trait(`AccountService`, `Authenticator`)로 보이고, 그 구현(`IdentityService`)을
//! `app.rs` 가 기동 때 만들어 끼운다.

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
pub use service::{
    AccountService, Authenticator, BoxFuture, CreateAccountInput, IdentityService, LoginInput,
    RegisterInput, SetupInput, SharedAccountService, SharedAuthenticator, SignedIn, StartError,
    Unimplemented,
};

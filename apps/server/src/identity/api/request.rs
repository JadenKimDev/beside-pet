//! identity 의 요청 본문: TS DTO 의 데코레이터를 같은 순서로 `Validator` 에 옮기고, 지난 본문을 입력 타입으로 바꾼다.
//! `serde_json::Value` 는 여기서 멈춘다.

use serde_json::Value;

use crate::identity::{
    ChatLanguage, CreateAccountInput, LoginInput, RegisterInput, Role, SetupInput,
};
use crate::shared::{ApiError, Rule, Validator};

const ROLES: &[&str] = &["admin", "viewer"];
const CHAT_LANGUAGES: &[&str] = &["ko", "en"];

/// `RegisterRequest`.
pub fn register(body: &Value) -> Result<RegisterInput, ApiError> {
    Validator::new(body)
        .required("username", &[Rule::IsString, Rule::MinLength(3)])
        .required("password", &[Rule::IsString, Rule::MinLength(8)])
        .required("company", &[Rule::IsString, Rule::IsNotEmpty])
        .finish()?;
    Ok(RegisterInput {
        username: text(body, "username"),
        password: text(body, "password"),
        company: text(body, "company"),
    })
}

/// `SetupRequest`.
pub fn setup(body: &Value) -> Result<SetupInput, ApiError> {
    Validator::new(body)
        .required("token", &[Rule::IsString, Rule::IsNotEmpty])
        .required("username", &[Rule::IsString, Rule::MinLength(3)])
        .required("password", &[Rule::IsString, Rule::MinLength(8)])
        .optional("company", &[Rule::IsString])
        .finish()?;
    Ok(SetupInput {
        token: text(body, "token"),
        username: text(body, "username"),
        password: text(body, "password"),
        company: optional_text(body, "company"),
    })
}

/// `LoginRequest`.
pub fn login(body: &Value) -> Result<LoginInput, ApiError> {
    Validator::new(body)
        .required("username", &[Rule::IsString, Rule::IsNotEmpty])
        .required("password", &[Rule::IsString, Rule::IsNotEmpty])
        .finish()?;
    Ok(LoginInput {
        username: text(body, "username"),
        password: text(body, "password"),
    })
}

/// `UpdateChatLanguageRequest`.
pub fn chat_language(body: &Value) -> Result<ChatLanguage, ApiError> {
    Validator::new(body)
        .required("chatLanguage", &[Rule::IsIn(CHAT_LANGUAGES)])
        .finish()?;
    ChatLanguage::parse(&text(body, "chatLanguage")).ok_or(ApiError::Internal)
}

/// `CreateAccountRequest`.
pub fn create_account(body: &Value) -> Result<CreateAccountInput, ApiError> {
    Validator::new(body)
        .required("username", &[Rule::IsString, Rule::MinLength(3)])
        .required("password", &[Rule::IsString, Rule::MinLength(8)])
        .required("company", &[Rule::IsString, Rule::IsNotEmpty])
        .optional("role", &[Rule::IsIn(ROLES)])
        .optional("expiresAt", &[Rule::IsIso8601])
        .finish()?;
    Ok(CreateAccountInput {
        username: text(body, "username"),
        password: text(body, "password"),
        company: text(body, "company"),
        role: optional_text(body, "role").and_then(|role| Role::parse(&role)),
        expires_at: optional_text(body, "expiresAt"),
    })
}

/// `SetExpiryRequest`: 칸이 없거나 `null` 이면 만료를 지운다.
pub fn set_expiry(body: &Value) -> Result<Option<String>, ApiError> {
    Validator::new(body)
        .optional("expiresAt", &[Rule::IsIso8601])
        .finish()?;
    Ok(optional_text(body, "expiresAt"))
}

/// 검증을 지난 문자열 칸.
fn text(body: &Value, name: &str) -> String {
    optional_text(body, name).unwrap_or_default()
}

fn optional_text(body: &Value, name: &str) -> Option<String> {
    body.get(name).and_then(Value::as_str).map(str::to_owned)
}

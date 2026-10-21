//! 대화 경로의 요청 본문: class-validator 와 같은 검증을 거쳐 타입으로 읽는다.
//!
//! 규칙은 TS 의 `support/interface/dto/*.request.ts` 의 데코레이터를 위에서 아래로 적은 순서 그대로다.
//! `serde_json::Value` 는 여기서 받고 안쪽으로 넘기지 않는다.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::identity::ChatLanguage;
use crate::shared::{ApiError, Message, Rule, Validator};

const GRIEF_PATHS: &[&str] = &["afterLoss", "beforeLoss"];
const TOGETHER_RANGES: &[&str] = &["0-3", "4-7", "8-11", "12+"];
const LOSS_TYPES: &[&str] = &["sudden", "illness", "natural", "euthanasia", "unknown"];
const SITUATIONS: &[&str] = &["aging", "endOfLife", "ongoingCare", "other"];
const SLEEP_STATES: &[&str] = &["ok", "fair", "disturbed"];
const EATING_STATES: &[&str] = &["ok", "reduced"];
/// TS 의 `LOCALES`. `ChatLanguage` 의 이름과 같다.
const LOCALES: &[&str] = &["ko", "en"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GriefPath {
    AfterLoss,
    BeforeLoss,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
pub enum TogetherRange {
    #[serde(rename = "0-3")]
    UpToThree,
    #[serde(rename = "4-7")]
    FourToSeven,
    #[serde(rename = "8-11")]
    EightToEleven,
    #[serde(rename = "12+")]
    TwelvePlus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LossType {
    Sudden,
    Illness,
    Natural,
    Euthanasia,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Situation {
    Aging,
    EndOfLife,
    OngoingCare,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SleepState {
    Ok,
    Fair,
    Disturbed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EatingState {
    Ok,
    Reduced,
}

#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStateRequest {
    pub sleep: Option<SleepState>,
    pub eating: Option<EatingState>,
}

/// 처음(온보딩) 세션의 프로필. 대화 언어는 `preferred_language` 한 곳에만 있다.
#[derive(Debug, Clone, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GriefProfileRequest {
    pub grief_path: GriefPath,
    pub pet_name: Option<String>,
    pub together_range: Option<TogetherRange>,
    pub loss_type: Option<LossType>,
    pub situation: Option<Situation>,
    /// TS 의 `number`. 검증이 정수이고 0 이상임을 보장한다(`2.0` 도 정수로 받는다).
    pub weeks_since_loss: Option<f64>,
    pub daily_state: Option<DailyStateRequest>,
    pub preferred_language: Option<ChatLanguage>,
}

/// `POST /v1/sessions` 와 `/v1/sessions/stream` 의 본문. 프로필이 없으면 기록에서 이어 간다.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionRequest {
    pub session_id: String,
    pub grief_profile: Option<GriefProfileRequest>,
}

/// `POST /v1/sessions/:id/messages` 와 그 스트림의 본문. `turn_id` 는 클라이언트가 만든 멱등 키(UUID)이고, 없으면 흐름이 만든다(ADR-0028).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub text: String,
    pub turn_id: Option<String>,
}

fn daily_state(v: Validator<'_>) -> Validator<'_> {
    v.optional("sleep", &[Rule::IsIn(SLEEP_STATES)])
        .optional("eating", &[Rule::IsIn(EATING_STATES)])
}

fn grief_profile(v: Validator<'_>) -> Validator<'_> {
    v.required("griefPath", &[Rule::IsIn(GRIEF_PATHS)])
        .optional("petName", &[Rule::IsString])
        .optional("togetherRange", &[Rule::IsIn(TOGETHER_RANGES)])
        .optional("lossType", &[Rule::IsIn(LOSS_TYPES)])
        .optional("situation", &[Rule::IsIn(SITUATIONS)])
        .optional("weeksSinceLoss", &[Rule::IsInt, Rule::Min(0)])
        .nested_optional("dailyState", daily_state)
        .optional("preferredLanguage", &[Rule::IsIn(LOCALES)])
}

fn start_session(v: Validator<'_>) -> Validator<'_> {
    v.required("sessionId", &[Rule::IsString, Rule::IsNotEmpty])
        .nested_optional("griefProfile", grief_profile)
}

fn send_message(v: Validator<'_>) -> Validator<'_> {
    v.required(
        "text",
        &[Rule::IsString, Rule::IsNotEmpty, Rule::MaxLength(4000)],
    )
    // `@IsOptional @IsUUID()` 의 검사는 `turn_id_message` 가 한다(공용 규칙에 UUID 가 없다).
    .optional("turnId", &[])
}

const TURN_ID_NOT_UUID: &str = "turnId must be a UUID";

/// `@IsOptional @IsUUID()`: 없거나 `null` 이면 지나고, 아니면 하이픈이 든 36자 16진 UUID 문자열이어야 한다(대소문자 무관, validator.js 의 `all`).
fn turn_id_message(body: &Value) -> Option<&'static str> {
    match body.get("turnId") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) if is_uuid(value) => None,
        Some(_) => Some(TURN_ID_NOT_UUID),
    }
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.char_indices().all(|(index, c)| match index {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

pub fn parse_start_session(body: &Value) -> Result<StartSessionRequest, ApiError> {
    start_session(Validator::new(body)).finish()?;
    read(body)
}

pub fn parse_send_message(body: &Value) -> Result<SendMessageRequest, ApiError> {
    let mut messages = send_message(Validator::new(body)).messages();
    messages.extend(turn_id_message(body).map(str::to_owned));
    if !messages.is_empty() {
        return Err(ApiError::BadRequest(Message::Many(messages)));
    }
    read(body)
}

/// 검증을 지난 본문을 타입으로 읽는다. 여기서 실패하면 검증 규칙과 타입이 어긋난 것이다(본문은 로그에 싣지 않는다).
fn read<T: DeserializeOwned>(body: &Value) -> Result<T, ApiError> {
    T::deserialize(body).map_err(|error| {
        tracing::error!(
            category = ?error.classify(),
            "검증을 지난 요청 본문을 타입으로 읽지 못했다"
        );
        ApiError::Internal
    })
}

#[cfg(test)]
mod tests;

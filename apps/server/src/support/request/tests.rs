// 기대 문구는 `apps/api` 의 class-validator 를 같은 DTO 와 ValidationPipe(whitelist, forbidNonWhitelisted, transform)
// 로 돌려 얻은 것이다(2026-10-16). 픽스처 값은 지어낸 것이다.

use serde_json::{Value, json};

use super::{
    DailyStateRequest, EatingState, GriefPath, GriefProfileRequest, LossType, SendMessageRequest,
    Situation, SleepState, StartSessionRequest, TogetherRange, parse_send_message,
    parse_start_session,
};
use crate::identity::ChatLanguage;
use crate::shared::{ApiError, Message};

fn messages(result: Result<impl std::fmt::Debug, ApiError>) -> Vec<String> {
    match result {
        Err(ApiError::BadRequest(Message::Many(messages))) => messages,
        other => panic!("400 문구 배열이 아니다: {other:?}"),
    }
}

#[test]
fn 시작_빈_본문() {
    assert_eq!(
        messages(parse_start_session(&json!({}))),
        [
            "sessionId should not be empty",
            "sessionId must be a string"
        ]
    );
}

#[test]
fn 시작_모르는_칸() {
    assert_eq!(
        messages(parse_start_session(&json!({ "zz": 1, "sessionId": "a" }))),
        ["property zz should not exist"]
    );
}

#[test]
fn 시작_프로필의_모든_칸이_틀렸다() {
    let body = json!({
        "sessionId": "a",
        "griefProfile": {
            "griefPath": "x",
            "petName": 3,
            "togetherRange": "5",
            "lossType": "x",
            "situation": "x",
            "weeksSinceLoss": -1.5,
            "dailyState": { "sleep": "bad", "eating": "x", "q": 1 },
            "preferredLanguage": "fr",
            "zz": 1
        }
    });
    assert_eq!(
        messages(parse_start_session(&body)),
        [
            "griefProfile.property zz should not exist",
            "griefProfile.griefPath must be one of the following values: afterLoss, beforeLoss",
            "griefProfile.petName must be a string",
            "griefProfile.togetherRange must be one of the following values: 0-3, 4-7, 8-11, 12+",
            "griefProfile.lossType must be one of the following values: sudden, illness, natural, euthanasia, unknown",
            "griefProfile.situation must be one of the following values: aging, endOfLife, ongoingCare, other",
            "griefProfile.weeksSinceLoss must not be less than 0",
            "griefProfile.weeksSinceLoss must be an integer number",
            "griefProfile.dailyState.property q should not exist",
            "griefProfile.dailyState.sleep must be one of the following values: ok, fair, disturbed",
            "griefProfile.dailyState.eating must be one of the following values: ok, reduced",
            "griefProfile.preferredLanguage must be one of the following values: ko, en",
        ]
    );
}

#[test]
fn 시작_빈_프로필() {
    let body = json!({ "sessionId": "a", "griefProfile": {} });
    assert_eq!(
        messages(parse_start_session(&body)),
        ["griefProfile.griefPath must be one of the following values: afterLoss, beforeLoss"]
    );
}

#[test]
fn 시작_객체가_아닌_프로필과_일상() {
    let body = json!({ "sessionId": "a", "griefProfile": "x" });
    assert_eq!(
        messages(parse_start_session(&body)),
        ["nested property griefProfile must be either object or array"]
    );
    let body = json!({ "sessionId": "a", "griefProfile": { "griefPath": "afterLoss", "dailyState": "s" } });
    assert_eq!(
        messages(parse_start_session(&body)),
        ["griefProfile.nested property dailyState must be either object or array"]
    );
}

#[test]
fn 시작_올바른_본문은_타입으로_읽힌다() {
    let body = json!({
        "sessionId": "a",
        "griefProfile": {
            "griefPath": "beforeLoss",
            "petName": "Bori",
            "togetherRange": "12+",
            "lossType": "illness",
            "situation": "aging",
            "weeksSinceLoss": 2.0,
            "dailyState": { "sleep": "fair", "eating": "reduced" },
            "preferredLanguage": "ko"
        }
    });
    assert_eq!(
        parse_start_session(&body).unwrap(),
        StartSessionRequest {
            session_id: "a".to_owned(),
            grief_profile: Some(GriefProfileRequest {
                grief_path: GriefPath::BeforeLoss,
                pet_name: Some("Bori".to_owned()),
                together_range: Some(TogetherRange::TwelvePlus),
                loss_type: Some(LossType::Illness),
                situation: Some(Situation::Aging),
                weeks_since_loss: Some(2.0),
                daily_state: Some(DailyStateRequest {
                    sleep: Some(SleepState::Fair),
                    eating: Some(EatingState::Reduced),
                }),
                preferred_language: Some(ChatLanguage::Ko),
            }),
        }
    );
    let body = json!({ "sessionId": "a", "griefProfile": null });
    assert_eq!(parse_start_session(&body).unwrap().grief_profile, None);
}

/// `@IsIn` 의 목록과 serde 의 이름이 어긋나지 않는다: 허용하는 값은 모두 타입으로 읽힌다.
#[test]
fn 허용하는_값은_모두_읽힌다() {
    let cases: &[(&str, &[&str])] = &[
        ("griefPath", &["afterLoss", "beforeLoss"]),
        ("togetherRange", &["0-3", "4-7", "8-11", "12+"]),
        (
            "lossType",
            &["sudden", "illness", "natural", "euthanasia", "unknown"],
        ),
        ("situation", &["aging", "endOfLife", "ongoingCare", "other"]),
        ("preferredLanguage", &["ko", "en"]),
    ];
    for (field, values) in cases {
        for value in *values {
            let mut profile = json!({ "griefPath": "afterLoss" });
            profile[*field] = Value::from(*value);
            let body = json!({ "sessionId": "a", "griefProfile": profile });
            assert!(parse_start_session(&body).is_ok(), "{field}={value}");
        }
    }
    for (field, values) in [
        ("sleep", &["ok", "fair", "disturbed"][..]),
        ("eating", &["ok", "reduced"][..]),
    ] {
        for value in values {
            let body = json!({
                "sessionId": "a",
                "griefProfile": { "griefPath": "afterLoss", "dailyState": { field: value } }
            });
            assert!(parse_start_session(&body).is_ok(), "{field}={value}");
        }
    }
}

#[test]
fn 메시지_검증() {
    assert_eq!(
        messages(parse_send_message(&json!({}))),
        [
            "text must be shorter than or equal to 4000 characters",
            "text should not be empty",
            "text must be a string"
        ]
    );
    assert_eq!(
        messages(parse_send_message(&json!({ "text": "x".repeat(4001) }))),
        ["text must be shorter than or equal to 4000 characters"]
    );
    assert_eq!(
        messages(parse_send_message(&json!({ "text": "" }))),
        ["text should not be empty"]
    );
    assert_eq!(
        messages(parse_send_message(&json!({ "text": 5, "extra": true }))),
        [
            "property extra should not exist",
            "text must be shorter than or equal to 4000 characters",
            "text must be a string"
        ]
    );
    assert_eq!(
        parse_send_message(&json!({ "text": "x".repeat(4000) })).unwrap(),
        SendMessageRequest {
            text: "x".repeat(4000),
            turn_id: None,
        }
    );
}

const TURN_ID: &str = "6f1c2a4e-3b7d-4c55-9a10-2e8f0d6b7c31";

#[test]
fn 메시지의_턴_id_는_선택이고_uuid_를_받는다() {
    assert_eq!(
        parse_send_message(&json!({ "text": "hi", "turnId": TURN_ID })).unwrap(),
        SendMessageRequest {
            text: "hi".to_owned(),
            turn_id: Some(TURN_ID.to_owned()),
        }
    );
    assert_eq!(
        parse_send_message(&json!({ "text": "hi", "turnId": null })).unwrap(),
        SendMessageRequest {
            text: "hi".to_owned(),
            turn_id: None,
        }
    );
    assert_eq!(
        parse_send_message(&json!({ "text": "hi", "turnId": TURN_ID.to_uppercase() }))
            .unwrap()
            .turn_id,
        Some(TURN_ID.to_uppercase())
    );
}

#[test]
fn 메시지의_턴_id_가_uuid_가_아니면_400_이다() {
    for bad in [
        json!("not-a-uuid"),
        json!(""),
        json!(5),
        json!(true),
        json!(["6f1c2a4e-3b7d-4c55-9a10-2e8f0d6b7c31"]),
        json!("6f1c2a4e3b7d4c559a102e8f0d6b7c31"),
        json!("{6f1c2a4e-3b7d-4c55-9a10-2e8f0d6b7c31}"),
    ] {
        assert_eq!(
            messages(parse_send_message(&json!({ "text": "hi", "turnId": bad }))),
            ["turnId must be a UUID"],
            "{bad}"
        );
    }
    assert_eq!(
        messages(parse_send_message(&json!({ "text": "", "turnId": "x" }))),
        ["text should not be empty", "turnId must be a UUID"]
    );
}

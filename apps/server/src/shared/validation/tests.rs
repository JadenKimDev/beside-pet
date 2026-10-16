//! 기대 문구는 TS API(apps/api) 의 ValidationPipe(whitelist, forbidNonWhitelisted, transform)와
//! class-validator 0.14.4 에 같은 DTO 를 넣어 얻은 응답을 그대로 옮긴 것이다.

use serde_json::{Value, json};

use super::{Rule, Validator};
use crate::shared::{ApiError, Message};

// 규칙은 TS 의 데코레이터를 위에서 아래로 적은 순서로 둔다(IsOptional 은 optional 로).
fn start_session(v: Validator<'_>) -> Validator<'_> {
    v.required("sessionId", &[Rule::IsString, Rule::IsNotEmpty])
        .nested_optional("griefProfile", grief_profile)
}

fn grief_profile(v: Validator<'_>) -> Validator<'_> {
    v.required("griefPath", &[Rule::IsIn(&["afterLoss", "beforeLoss"])])
        .optional("petName", &[Rule::IsString])
        .optional("weeksSinceLoss", &[Rule::IsInt, Rule::Min(0)])
        .nested_optional("dailyState", daily_state)
}

fn daily_state(v: Validator<'_>) -> Validator<'_> {
    v.optional("sleep", &[Rule::IsIn(&["ok", "fair", "disturbed"])])
        .optional("eating", &[Rule::IsIn(&["ok", "reduced"])])
}

fn create_account(v: Validator<'_>) -> Validator<'_> {
    v.required("username", &[Rule::IsString, Rule::MinLength(3)])
        .required("password", &[Rule::IsString, Rule::MinLength(8)])
        .required("company", &[Rule::IsString, Rule::IsNotEmpty])
        .optional("role", &[Rule::IsIn(&["admin", "viewer"])])
        .optional("expiresAt", &[Rule::IsIso8601])
}

fn send_message(v: Validator<'_>) -> Validator<'_> {
    v.required(
        "text",
        &[Rule::IsString, Rule::IsNotEmpty, Rule::MaxLength(4000)],
    )
}

fn messages(build: fn(Validator<'_>) -> Validator<'_>, body: Value) -> Vec<String> {
    build(Validator::new(&body)).messages()
}

#[test]
fn 빈_본문은_칸마다_뒤의_규칙부터_모은다() {
    assert_eq!(
        messages(start_session, json!({})),
        [
            "sessionId should not be empty",
            "sessionId must be a string"
        ]
    );
    assert_eq!(
        messages(create_account, json!({})),
        [
            "username must be longer than or equal to 3 characters",
            "username must be a string",
            "password must be longer than or equal to 8 characters",
            "password must be a string",
            "company should not be empty",
            "company must be a string",
        ]
    );
    assert_eq!(
        messages(send_message, json!({})),
        [
            "text must be shorter than or equal to 4000 characters",
            "text should not be empty",
            "text must be a string",
        ]
    );
}

#[test]
fn 타입이_틀리면_그_규칙만_실패한다() {
    assert_eq!(
        messages(start_session, json!({ "sessionId": 5 })),
        ["sessionId must be a string"]
    );
    assert_eq!(
        messages(start_session, json!({ "sessionId": null })),
        [
            "sessionId should not be empty",
            "sessionId must be a string"
        ]
    );
    assert_eq!(
        messages(start_session, json!({ "sessionId": "" })),
        ["sessionId should not be empty"]
    );
}

#[test]
fn 길이와_허용_값과_iso8601() {
    assert_eq!(
        messages(
            create_account,
            json!({ "username": "ab", "password": "x", "company": "", "role": "root", "expiresAt": "nope" })
        ),
        [
            "username must be longer than or equal to 3 characters",
            "password must be longer than or equal to 8 characters",
            "company should not be empty",
            "role must be one of the following values: admin, viewer",
            "expiresAt must be a valid ISO 8601 date string",
        ]
    );
    assert_eq!(
        messages(
            create_account,
            json!({ "username": "abc", "password": "12345678", "company": "c", "expiresAt": 5 })
        ),
        ["expiresAt must be a valid ISO 8601 date string"]
    );
    let long = "x".repeat(4001);
    assert_eq!(
        messages(send_message, json!({ "text": long })),
        ["text must be shorter than or equal to 4000 characters"]
    );
}

#[test]
fn 선택_칸은_null_과_없음을_건너뛴다() {
    let body =
        json!({ "username": "abc", "password": "12345678", "company": "c", "expiresAt": null });
    assert!(messages(create_account, body).is_empty());
    assert!(
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": null })
        )
        .is_empty()
    );
}

#[test]
fn 모르는_칸은_먼저_본문의_순서로_낸다() {
    assert_eq!(
        messages(start_session, json!({ "zz": 1, "sessionId": 3, "aa": 2 })),
        [
            "property zz should not exist",
            "property aa should not exist",
            "sessionId must be a string"
        ]
    );
}

#[test]
fn 중첩_객체는_경로를_앞에_붙인다() {
    assert_eq!(
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": {} })
        ),
        ["griefProfile.griefPath must be one of the following values: afterLoss, beforeLoss"]
    );
    assert_eq!(
        messages(
            start_session,
            json!({
                "sessionId": "a",
                "griefProfile": {
                    "griefPath": "afterLoss",
                    "weeksSinceLoss": -1,
                    "petName": 3,
                    "dailyState": { "sleep": "bad", "x": 1 },
                    "zz": 1
                }
            })
        ),
        [
            "griefProfile.property zz should not exist",
            "griefProfile.petName must be a string",
            "griefProfile.weeksSinceLoss must not be less than 0",
            "griefProfile.dailyState.property x should not exist",
            "griefProfile.dailyState.sleep must be one of the following values: ok, fair, disturbed",
        ]
    );
}

#[test]
fn 객체가_아닌_중첩_칸() {
    for value in [json!("x"), json!(7)] {
        assert_eq!(
            messages(
                start_session,
                json!({ "sessionId": "a", "griefProfile": value })
            ),
            ["nested property griefProfile must be either object or array"]
        );
    }
    assert_eq!(
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": { "griefPath": "x", "dailyState": "s" } })
        ),
        [
            "griefProfile.griefPath must be one of the following values: afterLoss, beforeLoss",
            "griefProfile.nested property dailyState must be either object or array",
        ]
    );
}

#[test]
fn 배열인_중첩_칸은_원소마다_본다() {
    assert!(
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": [] })
        )
        .is_empty()
    );
    assert_eq!(
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": [{ "griefPath": "q", "zz": 1 }, 3] })
        ),
        [
            "griefProfile.0.property zz should not exist",
            "griefProfile.0.griefPath must be one of the following values: afterLoss, beforeLoss",
            "griefProfile.nested property griefProfile must be either object or array",
        ]
    );
}

#[test]
fn 정수와_최소값() {
    let with_weeks = |weeks: Value| {
        messages(
            start_session,
            json!({ "sessionId": "a", "griefProfile": { "griefPath": "afterLoss", "weeksSinceLoss": weeks } }),
        )
    };
    assert_eq!(
        with_weeks(json!(1.5)),
        ["griefProfile.weeksSinceLoss must be an integer number"]
    );
    assert_eq!(
        with_weeks(json!("x")),
        [
            "griefProfile.weeksSinceLoss must not be less than 0",
            "griefProfile.weeksSinceLoss must be an integer number",
        ]
    );
    assert!(with_weeks(json!(2.0)).is_empty());
    assert!(with_weeks(json!(0)).is_empty());
}

#[test]
fn 객체가_아닌_본문은_빈_객체처럼_본다() {
    for body in [json!([]), json!("str")] {
        assert_eq!(
            messages(start_session, body),
            [
                "sessionId should not be empty",
                "sessionId must be a string"
            ]
        );
    }
}

#[test]
fn 길이는_js_처럼_센다() {
    // 서로게이트 쌍은 한 글자, 이모지 변형 선택자(U+FE0F)는 앞 글자에 붙여 센다(validator.js isLength).
    fn rule(v: Validator<'_>) -> Validator<'_> {
        v.required("text", &[Rule::MinLength(2), Rule::MaxLength(2)])
    }
    assert!(
        rule(Validator::new(&json!({ "text": "가나" })))
            .messages()
            .is_empty()
    );
    assert!(
        rule(Validator::new(&json!({ "text": "😀😀" })))
            .messages()
            .is_empty()
    );
    assert!(
        rule(Validator::new(&json!({ "text": "❤\u{fe0f}❤\u{fe0f}" })))
            .messages()
            .is_empty()
    );
    assert_eq!(
        rule(Validator::new(&json!({ "text": "가나다" }))).messages(),
        ["text must be shorter than or equal to 2 characters"]
    );
}

#[test]
fn finish_는_400_배열을_낸다() {
    let body = json!({});
    match start_session(Validator::new(&body)).finish() {
        Err(ApiError::BadRequest(Message::Many(list))) => assert_eq!(list.len(), 2),
        other => panic!("{other:?}"),
    }
    let ok = json!({ "sessionId": "a" });
    assert!(start_session(Validator::new(&ok)).finish().is_ok());
}

#[test]
fn iso8601_은_validator_js_와_같게_가른다() {
    // validator 13.15.35 의 isISO8601(엄격 모드 아님)에 넣어 얻은 판정.
    let accepted = [
        "2026",
        "2026-10",
        "2026-10-16",
        "20261016",
        "2026-02-30",
        "2026-W42",
        "2026W423",
        "2026-W42-5",
        "2026-289",
        "2026289",
        "-2026-10-16",
        "2026-10-16T10",
        "2026-10-16T10:30",
        "2026-10-16T1030",
        "2026-10-16T10:30:15",
        "2026-10-16T103015",
        "2026-10-16T10:30:15.123Z",
        "2026-10-16T10:30:15,5+09:00",
        "2026-10-16T10:30:15+0900",
        "2026-10-16T10:30:15+09",
        "2026-10-16 10:30",
        "2026-10-16T24:00",
        "2026-10-16T2400",
        "2026-10-16T10.5",
        "2026-10-16TZ",
        "2026-10-16T",
        "2026-10-16Tz",
        "2026-10-16T10Z",
        "2026-10-16T1030.5",
        "2026-10-16T10:30.5",
    ];
    let rejected = [
        "202610",
        "2026-1016",
        "202610-16",
        "2026-13-01",
        "2026-367",
        "+002026-10-16",
        "2026-10-16T10:3015",
        "2026-10-16T1030:15",
        "2026-10-16T24:00:30",
        "2026-10-16T25:00",
        "2026-10-16T10.5:30",
        "2026-10-16T10:30.5:15",
        "2026-10-16T:30",
        "2026-10-16t10",
        "nope",
        "",
        "2026-10-16T10:30:15.123Zx",
        "2026-10-16T10:60",
        "１２３４",
        "2026-10-16T10:30:15.",
        "2026-10-16T10:30:15+24:00",
    ];
    let check = |s: &str| {
        let body = json!({ "at": s });
        Validator::new(&body)
            .required("at", &[Rule::IsIso8601])
            .messages()
            .is_empty()
    };
    for s in accepted {
        assert!(check(s), "받아야 한다: {s}");
    }
    for s in rejected {
        assert!(!check(s), "거절해야 한다: {s}");
    }
}

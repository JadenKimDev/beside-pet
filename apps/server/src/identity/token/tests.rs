use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{InvalidTtl, TokenClaims, TokenSigner};
use crate::identity::account::Role;

const SECRET: &str = "test-secret-not-real";

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0)
        .single()
        .expect("time")
}

fn claims() -> TokenClaims {
    TokenClaims {
        sub: "00000000-0000-4000-8000-000000000001".to_owned(),
        role: Role::Viewer,
    }
}

fn signer(ttl: &str) -> TokenSigner {
    TokenSigner::new(SECRET, ttl).expect("signer")
}

fn payload(token: &str) -> serde_json::Value {
    let part = token.split('.').nth(1).expect("payload part");
    serde_json::from_slice(&base64_url_decode(part)).expect("json payload")
}

/// 테스트 전용 base64url 해독(패딩 없음).
fn base64_url_decode(text: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut bits = 0u32;
    let mut count = 0;
    let mut out = Vec::new();
    for byte in text.bytes() {
        let value = ALPHABET.iter().position(|c| *c == byte).expect("base64url") as u32;
        bits = (bits << 6) | value;
        count += 6;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
    }
    out
}

#[test]
fn rejects_unreadable_ttl() {
    assert_eq!(TokenSigner::new(SECRET, "soon").err(), Some(InvalidTtl));
    assert_eq!(signer("12h").ttl(), Duration::hours(12));
}

#[test]
fn sign_then_verify_round_trips() {
    let signer = signer("7d");
    let token = signer.sign(&claims(), now()).expect("sign");
    assert_eq!(
        signer.verify(&token, now()).map(|v| v.claims),
        Some(claims())
    );

    let admin = TokenClaims {
        sub: "admin-id".to_owned(),
        role: Role::Admin,
    };
    let token = signer.sign(&admin, now()).expect("sign");
    assert_eq!(signer.verify(&token, now()).map(|v| v.claims), Some(admin));
}

#[test]
fn payload_has_sub_role_iat_exp_and_hs256_header() {
    let token = signer("7d").sign(&claims(), now()).expect("sign");
    let body = payload(&token);
    let iat = now().timestamp();
    assert_eq!(
        body,
        serde_json::json!({
            "sub": "00000000-0000-4000-8000-000000000001",
            "role": "viewer",
            "iat": iat,
            "exp": iat + 7 * 24 * 3600,
        })
    );
    let header: serde_json::Value =
        serde_json::from_slice(&base64_url_decode(token.split('.').next().expect("header")))
            .expect("json header");
    assert_eq!(header["alg"], "HS256");
}

#[test]
fn other_secret_does_not_verify() {
    let token = signer("7d").sign(&claims(), now()).expect("sign");
    let other = TokenSigner::new("another-test-secret", "7d").expect("signer");
    assert_eq!(other.verify(&token, now()), None);
}

#[test]
fn expires_at_exp() {
    let signer = signer("1h");
    let token = signer.sign(&claims(), now()).expect("sign");
    let just_before = now() + Duration::hours(1) - Duration::seconds(1);
    assert_eq!(
        signer.verify(&token, just_before).map(|v| v.claims),
        Some(claims())
    );
    assert_eq!(signer.verify(&token, now() + Duration::hours(1)), None);
    assert_eq!(signer.verify(&token, now() + Duration::days(2)), None);
}

#[test]
fn garbage_and_tampered_tokens_do_not_verify() {
    let signer = signer("7d");
    assert_eq!(signer.verify("", now()), None);
    assert_eq!(signer.verify("not.a.token", now()), None);
    let token = signer.sign(&claims(), now()).expect("sign");
    let mut parts: Vec<&str> = token.split('.').collect();
    let forged = signer
        .sign(
            &TokenClaims {
                sub: "someone-else".to_owned(),
                role: Role::Admin,
            },
            now(),
        )
        .expect("sign");
    let forged_payload = forged.split('.').nth(1).expect("payload");
    parts[1] = forged_payload;
    let tampered = format!(
        "{}.{}.{}",
        parts[0],
        parts[1],
        token.split('.').nth(2).expect("sig")
    );
    assert_eq!(signer.verify(&tampered, now()), None);
}

#[test]
fn unknown_role_does_not_verify() {
    // 같은 비밀 값으로 서명했지만 역할이 모르는 글인 토큰.
    let raw = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
        &serde_json::json!({
            "sub": "x",
            "role": "owner",
            "iat": now().timestamp(),
            "exp": now().timestamp() + 60,
        }),
        &jsonwebtoken::EncodingKey::from_secret(SECRET.as_bytes()),
    )
    .expect("encode");
    assert_eq!(signer("7d").verify(&raw, now()), None);
}

#[test]
fn other_algorithm_does_not_verify() {
    let raw = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS512),
        &serde_json::json!({
            "sub": "x",
            "role": "viewer",
            "iat": now().timestamp(),
            "exp": now().timestamp() + 60,
        }),
        &jsonwebtoken::EncodingKey::from_secret(SECRET.as_bytes()),
    )
    .expect("encode");
    assert_eq!(signer("7d").verify(&raw, now()), None);
}

#[test]
fn verify_gives_the_issued_second() {
    let signer = signer("7d");
    let token = signer
        .sign(&claims(), now() + Duration::milliseconds(750))
        .expect("sign");
    let verified = signer
        .verify(&token, now() + Duration::seconds(5))
        .expect("verify");
    assert_eq!(verified.issued_at, now().timestamp());
    assert_eq!(verified.claims, claims());
}

#[test]
fn token_without_iat_does_not_verify() {
    // 같은 비밀 값으로 서명했지만 발급 시각이 없는 토큰. 로그아웃 경계를 잴 수 없으므로 받지 않는다.
    let raw = jsonwebtoken::encode(
        &jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256),
        &serde_json::json!({
            "sub": "x",
            "role": "viewer",
            "exp": now().timestamp() + 60,
        }),
        &jsonwebtoken::EncodingKey::from_secret(SECRET.as_bytes()),
    )
    .expect("encode");
    assert_eq!(signer("7d").verify(&raw, now()), None);
}

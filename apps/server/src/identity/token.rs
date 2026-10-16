//! 로그인 토큰(JWT HS256, `{ sub, role, iat, exp }`)의 서명과 확인. 시각은 인자로 받는다.

mod ttl;

use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

pub use ttl::parse_ttl;

use super::account::Role;

/// `JWT_TTL` 이 없을 때의 수명(TS API 와 같다).
pub const DEFAULT_TTL: &str = "7d";

/// 토큰에 담는 사실: 계정 id 와 역할.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenClaims {
    pub sub: String,
    pub role: Role,
}

/// `JWT_TTL` 을 읽지 못했다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidTtl;

/// 토큰을 서명하지 못했다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignFailed;

/// 비밀 값과 수명을 품은 서명기. 비밀 값은 `Debug` 에 싣지 않는다.
pub struct TokenSigner {
    encoding: EncodingKey,
    decoding: DecodingKey,
    validation: Validation,
    ttl: Duration,
}

/// 서명할 토큰 몸통. 칸 순서는 TS API(`jsonwebtoken`)와 같고, 역할은 `Role` 의 직렬화(`"admin"`, `"viewer"`)다.
#[derive(Serialize)]
struct SignedPayload<'a> {
    sub: &'a str,
    role: Role,
    iat: i64,
    exp: i64,
}

/// 확인할 토큰 몸통. 역할은 글로 받아 `Role::parse` 로 읽는다.
#[derive(Deserialize)]
struct ReceivedPayload {
    sub: String,
    role: String,
    exp: i64,
}

impl TokenSigner {
    /// `secret` 은 `JWT_SECRET`, `ttl_text` 는 `JWT_TTL` 의 값이다(읽는 것은 설정의 몫).
    pub fn new(secret: &str, ttl_text: &str) -> Result<TokenSigner, InvalidTtl> {
        let ttl = parse_ttl(ttl_text).ok_or(InvalidTtl)?;
        // 만료는 `now` 를 받아 직접 본다(라이브러리는 시스템 시계를 쓴다). 알고리즘은 HS256 하나만 받는다.
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = false;
        validation.validate_nbf = false;
        validation.validate_aud = false;
        validation.required_spec_claims.clear();
        Ok(TokenSigner {
            encoding: EncodingKey::from_secret(secret.as_bytes()),
            decoding: DecodingKey::from_secret(secret.as_bytes()),
            validation,
            ttl,
        })
    }

    pub fn ttl(&self) -> Duration {
        self.ttl
    }

    /// `iat` 는 `now`, `exp` 는 `now + ttl`(초).
    pub fn sign(&self, claims: &TokenClaims, now: DateTime<Utc>) -> Result<String, SignFailed> {
        let iat = now.timestamp();
        let payload = SignedPayload {
            sub: &claims.sub,
            role: claims.role,
            iat,
            exp: iat.saturating_add(self.ttl.num_seconds()),
        };
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &payload, &self.encoding)
            .map_err(|_| SignFailed)
    }

    /// 서명이 맞고 `now < exp` 이고 역할을 읽을 수 있으면 클레임을, 아니면 `None`.
    pub fn verify(&self, token: &str, now: DateTime<Utc>) -> Option<TokenClaims> {
        let payload =
            jsonwebtoken::decode::<ReceivedPayload>(token, &self.decoding, &self.validation)
                .ok()?
                .claims;
        if now.timestamp() >= payload.exp {
            return None;
        }
        Some(TokenClaims {
            sub: payload.sub,
            role: Role::parse(&payload.role)?,
        })
    }
}

#[cfg(test)]
mod tests;

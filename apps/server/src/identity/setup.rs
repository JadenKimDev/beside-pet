//! 첫 관리자 setup 토큰의 게이트: 1회용 토큰을 들고 있다가 상수 시간으로 비교해 한 번만 바꿔 준다.
//!
//! 관리자가 이미 있는지 보는 것은 이 모듈의 몫이 아니다(부르는 쪽이 DB 를 보고 `open` 이나 `closed` 를 고른다).

use std::sync::{Mutex, MutexGuard, PoisonError};

use subtle::ConstantTimeEq;

/// 토큰을 만들 난수를 얻지 못했다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RandomUnavailable;

/// 16바이트 난수의 hex(32글자). TS API 의 `randomBytes(16).toString('hex')` 와 같은 모양.
pub fn fresh_token() -> Result<String, RandomUnavailable> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| RandomUnavailable)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// 기동 로그에 찍을 두 줄. 토큰을 싣는 곳은 여기뿐이다.
pub fn announcement(token: &str) -> [String; 2] {
    [
        format!("no admin account yet — one-time setup token: {token}"),
        "exchange it for the first admin account: POST /v1/auth/setup".to_owned(),
    ]
}

/// `announcement` 의 두 줄을 `info` 로 찍는다.
pub fn log_token(token: &str) {
    for line in announcement(token) {
        tracing::info!("{line}");
    }
}

/// 1회용 setup 토큰. `Arc` 로 공유한다.
pub struct SetupGate {
    token: Mutex<Option<String>>,
}

impl SetupGate {
    /// 관리자가 없을 때: 이 토큰으로 한 번 교환할 수 있다.
    pub fn open(token: String) -> SetupGate {
        SetupGate {
            token: Mutex::new(Some(token)),
        }
    }

    /// 관리자가 이미 있을 때: 교환할 토큰이 없다.
    pub fn closed() -> SetupGate {
        SetupGate {
            token: Mutex::new(None),
        }
    }

    pub fn is_pending(&self) -> bool {
        self.lock().is_some()
    }

    /// 길이와 내용이 같으면(상수 시간 비교) 토큰을 비우고 `true`. 그 뒤로는 늘 `false`.
    pub fn redeem(&self, candidate: &str) -> bool {
        let mut token = self.lock();
        let Some(expected) = token.as_deref() else {
            return false;
        };
        let (expected, given) = (expected.as_bytes(), candidate.as_bytes());
        if expected.len() != given.len() || !bool::from(expected.ct_eq(given)) {
            return false;
        }
        *token = None;
        true
    }

    /// 다른 스레드가 잡은 채 죽었어도 값(`Option<String>`)은 깨지지 않으므로 그대로 쓴다.
    fn lock(&self) -> MutexGuard<'_, Option<String>> {
        self.token.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests;

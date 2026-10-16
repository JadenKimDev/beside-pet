//! 비밀번호의 argon2id 해시와 확인. I/O 는 없다.
//!
//! 두 함수 모두 블로킹 CPU 작업(수십 ms)이므로 비동기 흐름에서는 `tokio::task::spawn_blocking` 으로 감싼다.

use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};

/// 솔트를 만들 난수를 얻지 못했다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HashFailed;

/// 평문을 argon2id(크레이트 기본값: m=19 MiB, t=2, p=1)로 해시해 PHC 문자열(`$argon2id$v=19$…`)을 낸다.
/// 솔트는 부를 때마다 새 난수다.
pub fn hash(plain: &str) -> Result<String, HashFailed> {
    Argon2::default()
        .hash_password(plain.as_bytes())
        .map(|hashed| hashed.to_string())
        .map_err(|_| HashFailed)
}

/// 평문이 PHC 문자열과 맞는가. 해시가 깨진 글이면 `false`.
pub fn verify(plain: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .is_ok()
}

#[cfg(test)]
mod tests;

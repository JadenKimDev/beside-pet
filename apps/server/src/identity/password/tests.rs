use super::{hash, verify};

#[test]
fn hash_is_argon2id_phc_string() {
    let hashed = hash("correct horse").expect("hash");
    assert!(hashed.starts_with("$argon2id$v=19$"), "{hashed}");
}

#[test]
fn same_plain_gives_different_hashes_that_both_verify() {
    let first = hash("correct horse").expect("hash");
    let second = hash("correct horse").expect("hash");
    assert_ne!(first, second);
    assert!(verify("correct horse", &first));
    assert!(verify("correct horse", &second));
}

#[test]
fn wrong_plain_does_not_verify() {
    let hashed = hash("correct horse").expect("hash");
    assert!(!verify("correct horse ", &hashed));
    assert!(!verify("", &hashed));
}

#[test]
fn broken_hash_does_not_verify() {
    assert!(!verify("correct horse", ""));
    assert!(!verify("correct horse", "not a hash"));
    assert!(!verify(
        "correct horse",
        "$2b$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY"
    ));
    let hashed = hash("correct horse").expect("hash");
    let truncated = &hashed[..hashed.len() - 4];
    assert!(!verify("correct horse", truncated));
}

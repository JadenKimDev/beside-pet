use super::{SetupGate, announcement, fresh_token};

const TOKEN: &str = "0123456789abcdef0123456789abcdef";

#[test]
fn fresh_token_is_32_lowercase_hex_and_differs() {
    let first = fresh_token().expect("token");
    let second = fresh_token().expect("token");
    assert_eq!(first.len(), 32);
    assert!(
        first.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')),
        "{first}"
    );
    assert_ne!(first, second);
}

#[test]
fn announcement_matches_ts_lines() {
    assert_eq!(
        announcement(TOKEN),
        [
            format!("no admin account yet — one-time setup token: {TOKEN}"),
            "exchange it for the first admin account: POST /v1/auth/setup".to_owned(),
        ]
    );
}

#[test]
fn closed_gate_is_not_pending_and_redeems_nothing() {
    let gate = SetupGate::closed();
    assert!(!gate.is_pending());
    assert!(!gate.redeem(TOKEN));
    assert!(!gate.redeem(""));
}

#[test]
fn open_gate_is_pending() {
    assert!(SetupGate::open(TOKEN.to_owned()).is_pending());
}

#[test]
fn wrong_length_does_not_redeem_and_keeps_token() {
    let gate = SetupGate::open(TOKEN.to_owned());
    assert!(!gate.redeem(""));
    assert!(!gate.redeem(&TOKEN[..31]));
    assert!(!gate.redeem(&format!("{TOKEN}0")));
    assert!(gate.is_pending());
}

#[test]
fn same_length_different_does_not_redeem_and_keeps_token() {
    let gate = SetupGate::open(TOKEN.to_owned());
    assert!(!gate.redeem("0123456789abcdef0123456789abcdee"));
    assert!(!gate.redeem(&TOKEN.to_uppercase()));
    assert!(gate.is_pending());
}

#[test]
fn matching_token_redeems_once() {
    let gate = SetupGate::open(TOKEN.to_owned());
    assert!(gate.redeem(TOKEN));
    assert!(!gate.is_pending());
    assert!(!gate.redeem(TOKEN));
}

#[test]
fn shared_gate_redeems_once_across_threads() {
    use std::sync::Arc;
    let gate = Arc::new(SetupGate::open(TOKEN.to_owned()));
    let handles: Vec<_> = (0..8)
        .map(|_| {
            let gate = Arc::clone(&gate);
            std::thread::spawn(move || gate.redeem(TOKEN))
        })
        .collect();
    let wins = handles
        .into_iter()
        .map(|handle| handle.join().expect("thread"))
        .filter(|won| *won)
        .count();
    assert_eq!(wins, 1);
}

use super::SupportLevel;
use crate::safety::RiskLevel;

#[test]
fn 수는_1부터_3까지다() {
    assert_eq!(SupportLevel::Safe.number(), 1);
    assert_eq!(SupportLevel::Watch.number(), 2);
    assert_eq!(SupportLevel::Crisis.number(), 3);
    for number in 1..=3 {
        assert_eq!(
            SupportLevel::from_number(number).map(SupportLevel::number),
            Some(number)
        );
    }
    assert_eq!(SupportLevel::from_number(0), None);
    assert_eq!(SupportLevel::from_number(4), None);
}

#[test]
fn 위기는_3뿐이다() {
    assert!(!SupportLevel::Safe.is_crisis());
    assert!(!SupportLevel::Watch.is_crisis());
    assert!(SupportLevel::Crisis.is_crisis());
}

#[test]
fn 수준은_내려가지_않는다() {
    assert_eq!(
        SupportLevel::Crisis.raised(SupportLevel::Safe),
        SupportLevel::Crisis
    );
    assert_eq!(
        SupportLevel::Watch.raised(SupportLevel::Safe),
        SupportLevel::Watch
    );
    assert_eq!(
        SupportLevel::Safe.raised(SupportLevel::Crisis),
        SupportLevel::Crisis
    );
    assert_eq!(
        SupportLevel::Safe.raised(SupportLevel::Safe),
        SupportLevel::Safe
    );
}

#[test]
fn 위기_판정은_안전_아니면_위기다() {
    assert_eq!(SupportLevel::from(RiskLevel::Safe), SupportLevel::Safe);
    assert_eq!(SupportLevel::from(RiskLevel::Crisis), SupportLevel::Crisis);
}

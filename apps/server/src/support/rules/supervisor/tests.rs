use super::{SAMPLE_EVERY, review, should_review};
use crate::support::rules::SupportLevel;
use crate::support::{SupervisionQuality, SupervisionResponse};

#[test]
fn 게이트() {
    assert_eq!(SAMPLE_EVERY, 3);
    assert!(should_review(true, SupportLevel::Safe, 1));
    assert!(should_review(false, SupportLevel::Watch, 1));
    assert!(should_review(false, SupportLevel::Crisis, 2));
    assert!(should_review(false, SupportLevel::Safe, 0));
    assert!(should_review(false, SupportLevel::Safe, 3));
    assert!(should_review(false, SupportLevel::Safe, 6));
    assert!(!should_review(false, SupportLevel::Safe, 1));
    assert!(!should_review(false, SupportLevel::Safe, 2));
    assert!(!should_review(false, SupportLevel::Safe, 4));
}

#[test]
fn 문제가_없으면_ok() {
    assert_eq!(
        review("A made-up warm reply.", SupportLevel::Safe),
        SupervisionResponse {
            evaluated: true,
            quality: SupervisionQuality::Ok,
            flags: vec![],
            note: None,
        }
    );
}

#[test]
fn 빈_답과_높은_수준은_사람이_본다() {
    assert_eq!(
        review("   ", SupportLevel::Crisis),
        SupervisionResponse {
            evaluated: true,
            quality: SupervisionQuality::Review,
            flags: vec![
                "empty-reply".to_owned(),
                "elevated-support-level".to_owned()
            ],
            note: Some("Flagged for human review.".to_owned()),
        }
    );
    assert_eq!(
        review("A reply.", SupportLevel::Watch).flags,
        vec!["elevated-support-level".to_owned()]
    );
}

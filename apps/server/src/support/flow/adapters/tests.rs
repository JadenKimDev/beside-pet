//! 기동 파기의 상수: 지운 대화의 보관 기간과 정지 계정의 보관 기간은 같은 3개월이다(ADR-0036).

use crate::identity::SUSPENSION_HOLD_MONTHS;
use crate::support::store::TRASH_RETENTION_MONTHS;

#[test]
fn trash_retention_and_suspension_hold_are_the_same_months() {
    assert_eq!(TRASH_RETENTION_MONTHS, SUSPENSION_HOLD_MONTHS);
}

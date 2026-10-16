use super::Task;

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

#[test]
fn 과제는_0부터_5까지다() {
    for number in 0..=5 {
        assert_eq!(Task::new(number).map(Task::number), Some(number));
    }
    assert_eq!(Task::new(6), None);
    assert!(Task::try_from(9).is_err());
}

#[test]
fn 상수의_번호() {
    assert_eq!(Task::ONBOARDING.number(), 0);
    assert_eq!(Task::FIRST.number(), 1);
    assert_eq!(Task::CLOSING.number(), 5);
}

#[test]
fn 다음_과제는_하나씩이고_클로징에서_멈춘다() {
    let nexts: Vec<u8> = (0..=5).map(|n| task(n).next().number()).collect();
    assert_eq!(nexts, vec![1, 2, 3, 4, 5, 5]);
}

#[test]
fn 클로징은_5뿐이다() {
    let closing: Vec<bool> = (0..=5).map(|n| task(n).is_closing()).collect();
    assert_eq!(closing, vec![false, false, false, false, false, true]);
}

#[test]
fn 진행률은_과제_빼기_1을_4로_나누고_0과_1에서_자른다() {
    let progress: Vec<f64> = (0..=5).map(|n| task(n).progress()).collect();
    assert_eq!(progress, vec![0.0, 0.0, 0.25, 0.5, 0.75, 1.0]);
}

#[test]
fn json_에서는_수다() {
    assert_eq!(serde_json::to_value(task(3)).unwrap(), serde_json::json!(3));
    assert_eq!(
        serde_json::from_value::<Task>(serde_json::json!(2)).unwrap(),
        task(2)
    );
    assert!(serde_json::from_value::<Task>(serde_json::json!(7)).is_err());
}

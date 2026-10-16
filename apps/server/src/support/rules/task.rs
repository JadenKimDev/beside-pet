//! 애도 과제(단계)의 값: 0 온보딩, 1..=4 Worden 의 네 과제, 5 클로징. 다음 과제와 진행률 (task-1)/4 (ADR-0005).

use std::fmt;

use serde::{Deserialize, Serialize};

/// 과제 번호(0..=5). 범위 밖의 값은 만들 수 없다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
pub struct Task(u8);

/// 0..=5 밖의 과제 번호.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TaskOutOfRange(pub u8);

impl fmt::Display for TaskOutOfRange {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "task out of range: {}", self.0)
    }
}

impl std::error::Error for TaskOutOfRange {}

impl Task {
    /// 온보딩(대화 전).
    pub const ONBOARDING: Task = Task(0);
    /// 온보딩 바로 뒤의 첫 과제.
    pub const FIRST: Task = Task(1);
    /// 클로징. 여기에 닿으면 세션이 닫힌다.
    pub const CLOSING: Task = Task(5);

    pub const fn new(number: u8) -> Option<Task> {
        if number <= Task::CLOSING.0 {
            Some(Task(number))
        } else {
            None
        }
    }

    pub const fn number(self) -> u8 {
        self.0
    }

    /// 다음 과제. 클로징은 그대로다.
    pub fn next(self) -> Task {
        Task((self.0 + 1).min(Task::CLOSING.0))
    }

    pub fn is_closing(self) -> bool {
        self.0 >= Task::CLOSING.0
    }

    /// 전체 여정의 진행률(0..=1). 과제 1..=4 를 기준으로 (task-1)/4.
    pub fn progress(self) -> f64 {
        (f64::from(self.0.saturating_sub(1)) / 4.0).min(1.0)
    }
}

impl TryFrom<u8> for Task {
    type Error = TaskOutOfRange;

    fn try_from(number: u8) -> Result<Task, TaskOutOfRange> {
        Task::new(number).ok_or(TaskOutOfRange(number))
    }
}

impl From<Task> for u8 {
    fn from(task: Task) -> u8 {
        task.number()
    }
}

#[cfg(test)]
mod tests;

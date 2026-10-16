//! 지원 수준(1 안전, 2 주의, 3 위기). 위기면 고정 문구로 넘기고 닫는다. 수준은 내려가지 않는다(ADR-0004).

use crate::safety::RiskLevel;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SupportLevel {
    Safe,
    /// 정의만 있다. 판정은 지금 1 아니면 3 만 낸다(ADR-0004 "버린 것").
    Watch,
    Crisis,
}

impl SupportLevel {
    /// 1..=3
    pub fn number(self) -> u8 {
        match self {
            SupportLevel::Safe => 1,
            SupportLevel::Watch => 2,
            SupportLevel::Crisis => 3,
        }
    }

    pub fn from_number(number: u8) -> Option<SupportLevel> {
        match number {
            1 => Some(SupportLevel::Safe),
            2 => Some(SupportLevel::Watch),
            3 => Some(SupportLevel::Crisis),
            _ => None,
        }
    }

    pub fn is_crisis(self) -> bool {
        self >= SupportLevel::Crisis
    }

    /// 지금 수준과 새 판정 중 높은 쪽. 내려가지 않는다.
    pub fn raised(self, level: SupportLevel) -> SupportLevel {
        self.max(level)
    }
}

impl From<RiskLevel> for SupportLevel {
    fn from(risk: RiskLevel) -> SupportLevel {
        match risk {
            RiskLevel::Safe => SupportLevel::Safe,
            RiskLevel::Crisis => SupportLevel::Crisis,
        }
    }
}

#[cfg(test)]
mod tests;

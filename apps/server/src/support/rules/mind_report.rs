//! 마음 리포트의 모양과 열리는 조건: 닫혔고 과제 2 이상일 때만, 네 장의 순서(ADR-0008).
//!
//! 본문은 모델이 쓴 사실이라 세션에 한 번 저장한다(JSONB). 진행률은 도달 과제에서 구하므로 저장하지 않는다.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::super::response::{MindReportResponse, MindReportSectionResponse, ReportSectionKey};
use super::Task;
use crate::identity::ChatLanguage;

/// 리포트에는 마친 과제가 하나는 있어야 한다.
pub const REPORT_MIN_TASK: Task = match Task::new(2) {
    Some(task) => task,
    None => panic!("2 는 과제 번호다"),
};

/// 리포트의 장 순서.
pub const REPORT_SECTION_ORDER: [ReportSectionKey; 4] = [
    ReportSectionKey::Journey,
    ReportSectionKey::Emotions,
    ReportSectionKey::Keepsake,
    ReportSectionKey::Encouragement,
];

/// 세션이 리포트를 가질 만큼 진행됐고 마무리됐는가.
pub fn is_report_available(task: Task, closed: bool) -> bool {
    closed && task >= REPORT_MIN_TASK
}

/// 저장된 마음 리포트. 한 번 쓰면 바뀌지 않는다.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MindReport {
    /// 리포트를 쓴 시각.
    #[serde(with = "crate::shared::iso_millis")]
    pub at: DateTime<Utc>,
    pub pet_name: String,
    pub reached_task: Task,
    pub locale: ChatLanguage,
    pub sections: Vec<MindReportSectionResponse>,
}

impl MindReport {
    /// 응답 모양. 진행률은 도달 과제에서 구한다.
    pub fn to_response(&self) -> MindReportResponse {
        MindReportResponse {
            at: self.at,
            pet_name: self.pet_name.clone(),
            reached_task: self.reached_task.number(),
            progress: self.reached_task.progress(),
            locale: self.locale,
            sections: self.sections.clone(),
        }
    }
}

#[cfg(test)]
mod tests;

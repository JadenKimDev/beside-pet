//! 운영 계측: 모델 호출과 대화의 기간별 집계를 관리자에게 보인다(`/v1/admin/metrics/*`).
//! 기록은 맡지 않는다(모델 호출은 `llm` 의 싱크가, 대화는 `support` 가 적는다). 집계와 비용은 DB 의 뷰와 쿼리가 구하고,
//! 이 기능은 기간을 정해 읽어 낼 뿐이다. 저장은 `MetricsSource` 로 묻고 `app.rs` 가 Postgres 구현을 끼운다.

mod api;
mod period;
mod source;
mod store;

pub use api::{ConversationsResponse, ModelsResponse, router};
pub use period::Period;
pub use source::{
    ConversationDay, CrisisCounts, DailyUsage, MetricsSource, ModelUsage, SharedMetricsSource,
    Unimplemented,
};
pub use store::PostgresMetrics;

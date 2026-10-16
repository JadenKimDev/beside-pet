//! 여러 기능이 함께 쓰는 것: 설정, DB, 오류 본문, 검증, 시각 변환, HTTP 도우미, 로그.
//! 바깥에서는 여기서 다시 내보낸 이름(`crate::shared::X`)만 쓴다.

mod config;
mod db;
mod error;
mod http;
mod telemetry;
mod time;
mod validation;

pub use config::{Config, ConfigError, ENV_NAMES};
#[cfg(test)]
pub use config::test_database_url;
pub use db::{MIGRATOR, connect, connect_lazy};
pub use error::{ApiError, Message};
pub use http::{JsonBody, cors_layer, route_not_found};
pub use telemetry::init_tracing;
pub use time::{from_iso, iso_millis, iso_millis_opt, to_iso};
pub use validation::{Nested, Rule, Validator};

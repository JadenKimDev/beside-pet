//! 마이그레이션이 만든 스키마의 통합 테스트: 모델 호출 기록(`llm_calls`), 단가(`model_prices`), 비용과 날짜별 집계 뷰.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다). 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 지운다.

#[path = "schema/db.rs"]
mod db;

#[path = "schema/tables.rs"]
mod tables;

#[path = "schema/costs.rs"]
mod costs;

#[path = "schema/daily.rs"]
mod daily;

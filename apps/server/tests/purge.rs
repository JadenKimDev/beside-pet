//! 기동 파기(`support::purge_on_startup`, ADR-0036)의 통합 테스트: 보관 기간(3개월)이 지난 지운 리포트와 지운 세션,
//! 정지 3개월이 지난 계정의 연쇄, 기억 12개월 파기가 sandbox DB 의 테스트 스키마에서 도는 것. 값은 모두 지어낸 것이다.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).

#[allow(dead_code)] // 스키마 테스트와 같은 도우미를 쓰고, 여기서는 `name()` 을 부르지 않는다
#[path = "schema/db.rs"]
mod db;

#[path = "purge/fixtures.rs"]
mod fixtures;

#[path = "purge/trash.rs"]
mod trash;

#[path = "purge/accounts.rs"]
mod accounts;

#[path = "purge/memory.rs"]
mod memory;

//! tracing 로그의 초기화. 대화 본문, 리포트 본문, 사용자 식별 정보는 로그에 싣지 않는다.

/// info 수준으로 찍는다(환경 변수로 바꾸지 않는다: 환경은 `config.rs` 만 읽는다). 두 번 불러도 처음 것만 남는다.
pub fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();
}

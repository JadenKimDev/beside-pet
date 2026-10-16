//! 서버의 입구: 설정을 읽고 DB 에 붙어 마이그레이션한 뒤 라우터를 띄운다.

use std::process::ExitCode;
use std::sync::Arc;

use beside_pet_server::app::{AppState, router};
use beside_pet_server::shared::{Config, init_tracing};

#[tokio::main]
async fn main() -> ExitCode {
    init_tracing();
    let config = match Config::from_env() {
        Ok(config) => Arc::new(config),
        Err(error) => {
            tracing::error!("not starting: {error}");
            return ExitCode::FAILURE;
        }
    };
    let state = match AppState::connect(config.clone()).await {
        Ok(state) => state,
        Err(error) => {
            // sqlx 의 오류 문구에는 주소가 실리지 않는다(연결 설정 오류는 db.rs 가 문구를 바꾼다).
            tracing::error!("not starting: database connection or migration failed: {error}");
            return ExitCode::FAILURE;
        }
    };
    let address = config.listen_address();
    let listener = match tokio::net::TcpListener::bind(address).await {
        Ok(listener) => listener,
        Err(error) => {
            tracing::error!(
                "not starting: cannot listen on port {}: {error}",
                config.port
            );
            return ExitCode::FAILURE;
        }
    };
    tracing::info!(port = config.port, "listening");
    if let Err(error) = axum::serve(listener, router(state)).await {
        tracing::error!("server stopped: {error}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

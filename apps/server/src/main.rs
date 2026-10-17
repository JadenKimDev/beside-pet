//! 서버의 입구: 설정을 읽고 DB 에 붙어 마이그레이션한 뒤 라우터를 띄운다.

use std::future::IntoFuture;
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
    let mut listeners = Vec::new();
    for address in config.listen_addresses() {
        match tokio::net::TcpListener::bind(address).await {
            Ok(listener) => listeners.push(listener),
            // 개발의 두 루프백 중 하나(예: IPv6 가 꺼진 머신의 ::1)가 안 되면 나머지로 뜬다.
            Err(error) => tracing::warn!(%address, "cannot listen on this address: {error}"),
        }
    }
    if listeners.is_empty() {
        tracing::error!(
            "not starting: cannot listen on port {}: no address could be bound",
            config.port
        );
        return ExitCode::FAILURE;
    }
    let app = router(state);
    let mut servers = tokio::task::JoinSet::new();
    for listener in listeners {
        if let Ok(address) = listener.local_addr() {
            tracing::info!(%address, "listening");
        }
        servers.spawn(axum::serve(listener, app.clone()).into_future());
    }
    // 리스너 하나라도 멈추면 서버를 내린다(남은 리스너만으로 반쯤 뜬 상태를 두지 않는다).
    if let Some(result) = servers.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                tracing::error!("server stopped: {error}");
                return ExitCode::FAILURE;
            }
            Err(error) => {
                tracing::error!("server stopped: {error}");
                return ExitCode::FAILURE;
            }
        }
    }
    ExitCode::SUCCESS
}

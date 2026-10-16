//! 라우터와 상태(`AppState`)를 조립한다. 기능의 라우트와 trait 객체는 여기서 끼운다.

use std::fmt;
use std::sync::Arc;

use axum::extract::FromRef;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::identity::{IdentityState, SharedAccountService, SharedAuthenticator};
use crate::llm::SharedTextModel;
use crate::shared::{Config, connect, connect_lazy, cors_layer, route_not_found};
use crate::support::SharedSupportService;
use crate::{identity, llm, safety, support};

/// 기능이 바깥에 묻는 trait 의 구현들. 구현이 생기면 `Services::unimplemented` 의 칸 하나를 바꾼다.
#[derive(Clone)]
pub struct Services {
    pub accounts: SharedAccountService,
    pub authenticator: SharedAuthenticator,
    pub support: SharedSupportService,
    /// 대화 기능(`support::SupportFlow`)이 발화, 위기 판정(`safety::assess_risk`), 리포트에 쓴다.
    pub text_model: SharedTextModel,
}

impl Services {
    /// 모든 trait 가 아직 구현이 없다(`501`, 인증은 늘 `None`).
    pub fn unimplemented() -> Services {
        Services {
            accounts: Arc::new(identity::Unimplemented),
            authenticator: Arc::new(identity::Unimplemented),
            support: Arc::new(support::Unimplemented),
            text_model: Arc::new(llm::Unimplemented),
        }
    }

    /// 설정만으로 만드는 조립: 모델은 설정의 기본 모델로 고르는 라우터(사용량은 메모리 싱크), 나머지는 아직 `unimplemented`.
    /// DB 가 필요한 구현(계정, 대화)은 `AppState::connect` 가 끼운다.
    pub fn for_config(config: &Config) -> Services {
        let settings = llm::ModelSettings::from_config(config);
        tracing::info!(
            provider = settings.default_model.provider.as_str(),
            model = %settings.default_model.model,
            "default model"
        );
        let usage: llm::SharedUsageSink = Arc::new(llm::InMemoryUsageSink::default());
        Services {
            text_model: Arc::new(llm::ModelRouter::from_settings(&settings, usage)),
            ..Services::unimplemented()
        }
    }
}

/// 핸들러가 받는 상태. 복제가 싸야 하므로 칸은 `Arc` 나 풀(안이 `Arc`)로 둔다.
/// 기능의 라우터는 `FromRef` 로 필요한 칸만 꺼낸다.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: PgPool,
    pub services: Services,
}

/// 서버를 띄우지 못한 이유. 문구에 설정 값을 싣지 않는다.
#[derive(Debug)]
pub enum ConnectError {
    Database(sqlx::Error),
    Identity(identity::StartError),
}

impl fmt::Display for ConnectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConnectError::Database(error) => error.fmt(f),
            ConnectError::Identity(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for ConnectError {}

impl AppState {
    /// DB 에 붙고 마이그레이션까지 마친 상태. 서버가 쓰는 trait 구현을 여기서 끼운다.
    pub async fn connect(config: Arc<Config>) -> Result<AppState, ConnectError> {
        let db = connect(&config).await.map_err(ConnectError::Database)?;
        let identity = Arc::new(
            identity::IdentityService::start(
                db.clone(),
                &config.jwt_secret,
                config.jwt_ttl.as_deref(),
            )
            .await
            .map_err(ConnectError::Identity)?,
        );
        let base = Services::for_config(&config);
        let support =
            support::SupportFlow::live(db.clone(), base.text_model.clone(), identity.clone());
        Ok(AppState {
            services: Services {
                accounts: identity.clone(),
                authenticator: identity,
                support,
                ..base
            },
            config,
            db,
        })
    }

    /// DB 에 붙지 않은 상태(풀은 처음 쓸 때 붙는다). DB 를 쓰지 않는 라우터 테스트가 더블을 끼워 쓴다.
    pub fn lazy(config: Arc<Config>, services: Services) -> Result<AppState, sqlx::Error> {
        let db = connect_lazy(&config)?;
        Ok(AppState {
            config,
            db,
            services,
        })
    }
}

impl FromRef<AppState> for IdentityState {
    fn from_ref(state: &AppState) -> IdentityState {
        IdentityState {
            accounts: state.services.accounts.clone(),
            authenticator: state.services.authenticator.clone(),
            secure_cookies: state.config.is_production(),
        }
    }
}

impl FromRef<AppState> for SharedAuthenticator {
    fn from_ref(state: &AppState) -> SharedAuthenticator {
        state.services.authenticator.clone()
    }
}

impl FromRef<AppState> for SharedSupportService {
    fn from_ref(state: &AppState) -> SharedSupportService {
        state.services.support.clone()
    }
}

/// 모든 경로는 `/v1` 아래다. 없는 경로와 메서드가 맞지 않는 경로는 Nest(Express)와 같이 `404 Cannot <METHOD> <path>` 다.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health))
        .merge(safety::router())
        .merge(identity::router())
        .merge(support::router())
        .fallback(route_not_found)
        .method_not_allowed_fallback(route_not_found)
        .layer(cors_layer())
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

#[cfg(test)]
mod tests;

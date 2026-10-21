//! 라우터와 상태(`AppState`)를 조립한다. 기능의 라우트와 trait 객체는 여기서 끼운다.

use std::fmt;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::FromRef;
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::identity::{
    IdentityState, SharedAccountService, SharedAuthenticator, SharedSessionPresence,
};
use crate::llm::SharedTextModel;
use crate::metrics::SharedMetricsSource;
use crate::shared::{
    Config, JudgeEnv, ReplyJudgeKind, connect, connect_lazy, cors_layer, route_not_found,
};
use crate::support::SharedSupportService;
use crate::{identity, llm, metrics, safety, support};

/// 기능이 바깥에 묻는 trait 의 구현들. 구현이 생기면 `Services::unimplemented` 의 칸 하나를 바꾼다.
#[derive(Clone)]
pub struct Services {
    pub accounts: SharedAccountService,
    pub authenticator: SharedAuthenticator,
    pub support: SharedSupportService,
    /// `/v1/auth/me` 의 `hasProfile`: identity 가 묻고 대화 기능(`support::session_presence`)이 답한다.
    pub session_presence: SharedSessionPresence,
    /// 대화 기능(`support::SupportFlow`)이 발화, 위기 판정(`safety::assess_risk_verdict`), 리포트에 쓴다.
    pub text_model: SharedTextModel,
    /// 계측 API 가 기간의 집계를 읽는 저장.
    pub metrics: SharedMetricsSource,
}

impl Services {
    /// 모든 trait 가 아직 구현이 없다(`501`, 인증은 늘 `None`).
    pub fn unimplemented() -> Services {
        Services {
            accounts: Arc::new(identity::Unimplemented),
            authenticator: Arc::new(identity::Unimplemented),
            support: Arc::new(support::Unimplemented),
            session_presence: Arc::new(identity::Unimplemented),
            text_model: Arc::new(llm::Unimplemented),
            metrics: Arc::new(metrics::Unimplemented),
        }
    }

    /// 설정만으로 만드는 조립: 모델은 설정의 기본 모델로 고르는 라우터(사용량은 메모리 싱크), 나머지는 아직 `unimplemented`.
    /// DB 가 필요한 구현(계정, 대화, 호출 기록, 계측)은 `AppState::connect` 가 끼운다.
    pub fn for_config(config: &Config) -> Services {
        Services::with_usage(config, Arc::new(llm::InMemoryUsageSink::default()))
    }

    /// `for_config` 와 같되 모델 호출 기록을 `usage` 에 넘긴다.
    pub fn with_usage(config: &Config, usage: llm::SharedUsageSink) -> Services {
        let settings = llm::ModelSettings::from_config(config);
        tracing::info!(
            provider = settings.default_model.provider.as_str(),
            model = %settings.default_model.model,
            "default model"
        );
        Services {
            // 모델 호출의 시간 제한(호출 120초, 스트림 조각 사이 60초)은 라우터가 두른다(ADR-0018).
            text_model: Arc::new(
                llm::ModelRouter::from_settings(&settings, usage)
                    .with_limits(llm::CallLimits::default()),
            ),
            ..Services::unimplemented()
        }
    }
}

/// systemone 판정 한 번의 제한(ADR-0031).
const SYSTEMONE_TIMEOUT: Duration = Duration::from_secs(1);

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
        close_unfinished_turns(db.clone()).await;
        let usage: llm::SharedUsageSink = Arc::new(llm::PostgresUsageSink::spawn(db.clone()));
        let base = Services::with_usage(&config, usage);
        let judge = reply_judge(&config.judge, &base.text_model);
        let support = support::SupportFlow::live(
            db.clone(),
            base.text_model.clone(),
            identity.clone(),
            judge,
            config.judge.candidates,
            config.judge.threshold,
        );
        Ok(AppState {
            services: Services {
                accounts: identity.clone(),
                authenticator: identity,
                support,
                session_presence: support::session_presence(db.clone()),
                metrics: metrics::PostgresMetrics::shared(db.clone()),
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

/// `REPLY_JUDGE` 가 고른 답 판정기(ADR-0031). `systemone` 인데 `SYSTEMONE_URL` 이 없으면 경고 한 줄을 남기고 끈다.
/// `haiku` 는 발화와 같은 모델 라우터로 부른다(호출은 `llm_calls` 에 `judge` 역할로 남는다).
fn reply_judge(judge: &JudgeEnv, model: &SharedTextModel) -> support::SharedReplyJudge {
    match (judge.kind, judge.systemone_url.as_deref()) {
        (ReplyJudgeKind::Off, _) => Arc::new(support::UnimplementedJudge),
        (ReplyJudgeKind::SystemOne, Some(url)) => Arc::new(support::SystemOneReplyJudge(
            llm::SystemOneJudge::new(url.to_owned(), SYSTEMONE_TIMEOUT),
        )),
        (ReplyJudgeKind::SystemOne, None) => {
            tracing::warn!(
                "REPLY_JUDGE is systemone but SYSTEMONE_URL is not set; replies are not judged"
            );
            Arc::new(support::UnimplementedJudge)
        }
        (ReplyJudgeKind::Haiku, _) => Arc::new(support::HaikuReplyJudge(llm::HaikuJudge::new(
            model.clone(),
        ))),
    }
}

/// 앞 프로세스가 끝내지 못한 `pending` 턴을 `failed`(`restart`)로 닫는다(ADR-0028). 수만 로그에 남긴다.
/// 실패해도 기동은 잇는다(남은 턴은 다음 기동이 닫는다). 원인은 저장이 종류만 로그에 남긴다.
async fn close_unfinished_turns(db: PgPool) {
    match support::fail_pending_turns(db, Utc::now()).await {
        Ok(closed) => tracing::info!(closed, "closed turns left pending by a restart"),
        Err(_) => tracing::warn!("could not close turns left pending by a restart"),
    }
}

impl FromRef<AppState> for IdentityState {
    fn from_ref(state: &AppState) -> IdentityState {
        IdentityState {
            accounts: state.services.accounts.clone(),
            authenticator: state.services.authenticator.clone(),
            sessions: state.services.session_presence.clone(),
            secure_cookies: state.config.secure_cookies(),
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

impl FromRef<AppState> for SharedMetricsSource {
    fn from_ref(state: &AppState) -> SharedMetricsSource {
        state.services.metrics.clone()
    }
}

/// 모든 경로는 `/v1` 아래다. 없는 경로와 메서드가 맞지 않는 경로는 Nest(Express)와 같이 `404 Cannot <METHOD> <path>` 다.
pub fn router(state: AppState) -> Router {
    let cors = cors_layer(state.config.allowed_origins.as_deref());
    Router::new()
        .route("/v1/health", get(health))
        .merge(safety::router())
        .merge(identity::router())
        .merge(support::router())
        .merge(metrics::router())
        .fallback(route_not_found)
        .method_not_allowed_fallback(route_not_found)
        .layer(cors)
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

#[cfg(test)]
mod tests;

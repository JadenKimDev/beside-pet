//! 환경 변수를 읽는 유일한 곳. 읽는 이름은 모두 `apps/server/.env.example` 에 있다.

use std::fmt;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};

/// 이 서버가 읽는 환경 변수의 이름. TS API(`apps/api`)와 같은 이름이다.
/// `JWT_*` 는 뒤의 계정 PRD 가 읽는다. 지금은 이름만 둔다.
pub const ENV_NAMES: [&str; 13] = [
    "PORT",
    "DATABASE_URL",
    "DATABASE_SSL",
    "JWT_SECRET",
    "JWT_TTL",
    "ANTHROPIC_API_KEY",
    "CLAUDE_MODEL",
    "LLM_PROVIDER",
    "LLM_MODEL",
    "ANTHROPIC_BASE_URL",
    "OLLAMA_BASE_URL",
    "OLLAMA_THINK",
    "NODE_ENV",
];

const DEFAULT_PORT: u16 = 3000;

/// `LLM_PROVIDER` 가 받는 값.
const KNOWN_PROVIDERS: [&str; 2] = ["anthropic", "ollama"];

/// 기동에 필요한 설정. 값은 로그에 싣지 않는다.
#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub database_ssl: bool,
    pub node_env: Option<String>,
    pub model: ModelEnv,
}

/// 모델 쪽 환경 변수의 값(앞뒤 공백을 걷고, 빈 값은 없는 것으로 본다). 기본값과 해석은 `llm` 의 설정이 맡는다.
/// `provider` 는 `anthropic` 또는 `ollama` 만 들어온다(`from_lookup` 이 검사한다).
#[derive(Clone)]
pub struct ModelEnv {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub claude_model: Option<String>,
    pub anthropic_api_key: Option<String>,
    pub anthropic_base_url: Option<String>,
    pub ollama_base_url: Option<String>,
    pub ollama_think: bool,
}

/// 설정을 만들지 못한 이유. 문구에는 이름만 싣고 값은 싣지 않는다.
#[derive(Debug)]
pub struct ConfigError(String);

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ConfigError {}

impl fmt::Debug for Config {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Config")
            .field("port", &self.port)
            .field("database_url", &"<hidden>")
            .field("database_ssl", &self.database_ssl)
            .field("node_env", &self.node_env)
            .field("model", &self.model)
            .finish()
    }
}

impl fmt::Debug for ModelEnv {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ModelEnv")
            .field("provider", &self.provider)
            .field("model", &self.model)
            .field("claude_model", &self.claude_model)
            .field(
                "anthropic_api_key",
                &self.anthropic_api_key.as_ref().map(|_| "<hidden>"),
            )
            .field("anthropic_base_url", &self.anthropic_base_url)
            .field("ollama_base_url", &self.ollama_base_url)
            .field("ollama_think", &self.ollama_think)
            .finish()
    }
}

impl Config {
    /// `NODE_ENV` 가 고른 env 파일을 먼저 올린 뒤(이미 있는 값은 덮지 않는다) 프로세스 환경에서 읽는다.
    /// 기동 조건(기본 공급자의 설정)까지 본다.
    pub fn from_env() -> Result<Config, ConfigError> {
        load_env_file();
        let config = Config::from_lookup(|name| std::env::var(name).ok())?;
        config.require_default_model()?;
        Ok(config)
    }

    /// 이름으로 값을 찾는 함수에서 설정을 만든다. 테스트가 환경을 건드리지 않고 쓰는 입구다.
    /// 값의 형식만 보고 기본 공급자의 설정은 요구하지 않는다(모델을 쓰지 않는 라우터 테스트가 쓴다).
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Config, ConfigError> {
        let database_url = trimmed(lookup("DATABASE_URL")).ok_or_else(|| {
            ConfigError(
                "DATABASE_URL is not set — the server needs PostgreSQL (local: pnpm db:up, \
                     then set DATABASE_URL in apps/server/.env.development or the environment)"
                    .to_owned(),
            )
        })?;
        let port = match trimmed(lookup("PORT")) {
            None => DEFAULT_PORT,
            Some(raw) => raw
                .parse::<u16>()
                .map_err(|_| ConfigError("PORT must be a port number (1-65535)".to_owned()))?,
        };
        let database_ssl = lookup("DATABASE_SSL").is_some_and(|v| v == "true");
        let node_env = lookup("NODE_ENV").filter(|v| !v.is_empty());
        let model = ModelEnv {
            provider: trimmed(lookup("LLM_PROVIDER")),
            model: trimmed(lookup("LLM_MODEL")),
            claude_model: trimmed(lookup("CLAUDE_MODEL")),
            anthropic_api_key: trimmed(lookup("ANTHROPIC_API_KEY")),
            anthropic_base_url: trimmed(lookup("ANTHROPIC_BASE_URL")),
            ollama_base_url: trimmed(lookup("OLLAMA_BASE_URL")),
            ollama_think: lookup("OLLAMA_THINK").is_some_and(|v| v == "true"),
        };
        if let Some(provider) = &model.provider
            && !KNOWN_PROVIDERS.contains(&provider.as_str())
        {
            return Err(ConfigError(
                "LLM_PROVIDER must be anthropic or ollama".to_owned(),
            ));
        }
        Ok(Config {
            port,
            database_url,
            database_ssl,
            node_env,
            model,
        })
    }

    /// 기동 조건: 기본 공급자(`LLM_PROVIDER`, 없으면 anthropic)의 설정이 있는가. 다른 공급자의 설정은 요구하지 않는다.
    pub fn require_default_model(&self) -> Result<(), ConfigError> {
        match self.model.provider.as_deref() {
            Some("ollama") if self.model.model.is_none() => Err(ConfigError(
                "LLM_MODEL is not set — LLM_PROVIDER=ollama needs the model name \
                 (an installed Ollama model; CLAUDE_MODEL is not used for ollama)"
                    .to_owned(),
            )),
            Some("ollama") => Ok(()),
            _ if self.model.anthropic_api_key.is_none() => Err(ConfigError(
                "ANTHROPIC_API_KEY is not set — the default model provider is anthropic \
                 (set the key, or LLM_PROVIDER=ollama with LLM_MODEL)"
                    .to_owned(),
            )),
            _ => Ok(()),
        }
    }

    /// 듣는 주소. 개발에서는 루프백(127.0.0.1)에만 열고, `NODE_ENV=production`(컨테이너)이면 모든 주소에 연다.
    pub fn listen_address(&self) -> SocketAddr {
        let ip = if self.is_production() {
            Ipv4Addr::UNSPECIFIED
        } else {
            Ipv4Addr::LOCALHOST
        };
        SocketAddr::from((ip, self.port))
    }

    /// `NODE_ENV=production` 이면 참. 쿠키에 Secure 를 붙이는 기준이다.
    pub fn is_production(&self) -> bool {
        self.node_env.as_deref() == Some("production")
    }
}

/// 앞뒤 공백을 걷고, 빈 값은 없는 것으로 본다.
fn trimmed(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

/// `NODE_ENV` 에 따라 읽을 env 파일의 이름(TS API 와 같다).
pub fn env_file_name(node_env: Option<&str>) -> &'static str {
    if node_env == Some("development") {
        ".env.development"
    } else {
        ".env"
    }
}

/// env 파일을 서버를 띄운 디렉터리에서 먼저 찾고, 없으면 이 크레이트의 디렉터리에서 찾는다.
fn load_env_file() {
    let name = env_file_name(std::env::var("NODE_ENV").ok().as_deref());
    let candidates = [
        PathBuf::from(name),
        Path::new(env!("CARGO_MANIFEST_DIR")).join(name),
    ];
    if let Some(path) = candidates.iter().find(|p| p.is_file())
        && let Err(error) = dotenvy::from_path(path)
    {
        // dotenvy 의 오류 문구에는 그 줄(값)이 실리므로 종류만 적는다.
        tracing::warn!(file = %path.display(), kind = error_kind(&error), "env file could not be read");
    }
}

fn error_kind(error: &dotenvy::Error) -> &'static str {
    match error {
        dotenvy::Error::LineParse(..) => "line parse",
        dotenvy::Error::Io(..) => "io",
        dotenvy::Error::EnvVar(..) => "env var",
        _ => "other",
    }
}

/// DB 를 쓰는 테스트가 붙을 주소. 없으면 이유를 적고 실패한다(조용히 건너뛰지 않는다).
#[cfg(test)]
pub fn test_database_url() -> String {
    load_env_file();
    std::env::var("DATABASE_URL")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .expect(
            "DATABASE_URL 이 없다: DB 테스트는 로컬 Postgres 가 필요하다. pnpm db:up 으로 띄우고 \
             DATABASE_URL 을 환경이나 apps/server/.env(.development) 에 둔다",
        )
}

#[cfg(test)]
mod tests;

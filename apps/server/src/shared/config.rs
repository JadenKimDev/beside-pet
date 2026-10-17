//! 환경 변수를 읽는 유일한 곳. 읽는 이름은 모두 `apps/server/.env.example` 에 있다.

use std::fmt;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::{Path, PathBuf};

/// 이 서버가 읽는 환경 변수의 이름. TS API(`apps/api`)와 같은 이름이다.
/// 모델 쪽 이름의 해석은 `llm` 이, `JWT_*` 는 identity 가 맡는다.
pub const ENV_NAMES: [&str; 14] = [
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
    "COOKIE_SECURE",
];

const DEFAULT_PORT: u16 = 3000;
/// `JWT_SECRET` 이 없을 때 개발에서 쓰는 값(TS API 와 같다). production 에서는 쓰지 않고 기동을 막는다.
const DEV_JWT_SECRET: &str = "dev-insecure-secret-change-me";

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
    /// 로그인 토큰의 서명 비밀 값.
    pub jwt_secret: String,
    /// 로그인 토큰의 수명 글(`7d`, `12h`, 단위 없는 숫자는 초). 없거나 비면 `None` 이고 기본값(`7d`)과
    /// 글의 해석은 identity 의 몫이다. 읽지 못하는 글이면 기동 때 identity 가 막는다.
    pub jwt_ttl: Option<String>,
    /// `COOKIE_SECURE` 의 값. 없으면 `None` 이고 `NODE_ENV` 가 정한다(`secure_cookies`).
    pub cookie_secure: Option<bool>,
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
            .field("jwt_secret", &"<hidden>")
            .field("jwt_ttl", &self.jwt_ttl)
            .field("cookie_secure", &self.cookie_secure)
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
        let production = is_production(node_env.as_deref());
        let jwt_secret = match lookup("JWT_SECRET").filter(|v| !v.trim().is_empty()) {
            Some(secret) => secret,
            None if production => {
                return Err(ConfigError(
                    "JWT_SECRET is not set — required when NODE_ENV=production".to_owned(),
                ));
            }
            None => DEV_JWT_SECRET.to_owned(),
        };
        let jwt_ttl = lookup("JWT_TTL")
            .map(|v| v.trim().to_owned())
            .filter(|v| !v.is_empty());
        let cookie_secure = match trimmed(lookup("COOKIE_SECURE")) {
            None => None,
            Some(raw) if raw.eq_ignore_ascii_case("true") => Some(true),
            Some(raw) if raw.eq_ignore_ascii_case("false") => Some(false),
            Some(_) => {
                return Err(ConfigError(
                    "COOKIE_SECURE must be true or false".to_owned(),
                ));
            }
        };
        Ok(Config {
            port,
            database_url,
            database_ssl,
            node_env,
            model,
            jwt_secret,
            jwt_ttl,
            cookie_secure,
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

    /// 듣는 주소들. 개발에서는 두 루프백(127.0.0.1, ::1)에만 연다. `localhost` 가 어느 쪽으로 먼저 풀려도 붙게
    /// 하려는 것이다. `NODE_ENV=production`(컨테이너)이면 모든 주소(0.0.0.0) 하나에 연다.
    pub fn listen_addresses(&self) -> Vec<SocketAddr> {
        if self.is_production() {
            vec![SocketAddr::from((Ipv4Addr::UNSPECIFIED, self.port))]
        } else {
            vec![
                SocketAddr::from((Ipv4Addr::LOCALHOST, self.port)),
                SocketAddr::from((Ipv6Addr::LOCALHOST, self.port)),
            ]
        }
    }

    /// `NODE_ENV=production` 이면 참.
    pub fn is_production(&self) -> bool {
        is_production(self.node_env.as_deref())
    }

    /// 로그인 쿠키에 Secure 를 붙이는가. `COOKIE_SECURE` 가 있으면 그 값, 없으면 production 일 때 참이다.
    /// http 루프백의 컨테이너(`compose --profile full`)는 `COOKIE_SECURE=false` 로 로그인을 유지한다.
    pub fn secure_cookies(&self) -> bool {
        self.cookie_secure.unwrap_or_else(|| self.is_production())
    }
}

/// 앞뒤 공백을 걷고, 빈 값은 없는 것으로 본다.
fn trimmed(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

fn is_production(node_env: Option<&str>) -> bool {
    node_env == Some("production")
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

/// 테스트가 `DATABASE_URL` 을 찾을 env 파일들(앞의 것이 먼저). 테스트는 `NODE_ENV` 없이 돌기 쉬우므로 서버
/// 기동의 규칙(`env_file_name`)을 따르지 않고 `.env.development` 다음 `.env` 를 이 크레이트의 디렉터리에서 찾는다.
#[cfg(test)]
fn test_env_files(crate_dir: &Path) -> [PathBuf; 2] {
    [crate_dir.join(".env.development"), crate_dir.join(".env")]
}

/// DB 를 쓰는 테스트가 붙을 주소. 환경에 없으면 `test_env_files` 의 순서로 찾는다. 그래도 없으면 이유를 적고
/// 실패한다(조용히 건너뛰지 않는다). 파일은 환경에 올리지 않고 `DATABASE_URL` 하나만 읽는다.
#[cfg(test)]
pub fn test_database_url() -> String {
    let from_env = std::env::var("DATABASE_URL")
        .ok()
        .filter(|v| !v.trim().is_empty());
    from_env
        .or_else(|| {
            test_env_files(Path::new(env!("CARGO_MANIFEST_DIR")))
                .iter()
                .filter_map(|path| dotenvy::from_path_iter(path).ok())
                .find_map(|entries| {
                    entries
                        .filter_map(Result::ok)
                        .find(|(name, value)| name == "DATABASE_URL" && !value.trim().is_empty())
                        .map(|(_, value)| value)
                })
        })
        .expect(
            "DATABASE_URL 이 없다: DB 테스트는 로컬 Postgres 가 필요하다. pnpm db:up 으로 띄우고 \
             DATABASE_URL 을 환경이나 apps/server/.env.development(또는 .env) 에 둔다",
        )
}

#[cfg(test)]
mod tests;

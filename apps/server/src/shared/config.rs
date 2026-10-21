//! 환경 변수를 읽는 유일한 곳. 읽는 이름은 모두 `apps/server/.env.example` 에 있다.

use std::fmt;
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr};
use std::path::{Path, PathBuf};

/// 이 서버가 읽는 환경 변수의 이름. TS API(`apps/api`)와 같은 이름이고, 환경을 고르는 `APP_ENV` 만 예외다
/// (TS API 의 `NODE_ENV` 는 더 읽지 않는다). 모델 쪽 이름의 해석은 `llm` 이, `JWT_*` 는 identity 가 맡는다.
pub const ENV_NAMES: [&str; 15] = [
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
    "APP_ENV",
    "COOKIE_SECURE",
    "ALLOWED_ORIGINS",
];

const DEFAULT_PORT: u16 = 3000;
/// `JWT_SECRET` 이 없을 때 sandbox 에서 쓰는 값(TS API 와 같다). production 에서는 쓰지 않고 기동을 막는다.
const DEV_JWT_SECRET: &str = "dev-insecure-secret-change-me";

/// `LLM_PROVIDER` 가 받는 값.
const KNOWN_PROVIDERS: [&str; 2] = ["anthropic", "ollama"];

/// 서버가 도는 환경. `APP_ENV` 가 고르고, 없거나 모르는 값이면 기동하지 않는다.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppEnv {
    /// 실제로 쓰는 환경. `JWT_SECRET` 과 `ALLOWED_ORIGINS` 가 필수이고 모든 주소에 연다.
    Production,
    /// 개발, 테스트, 실측 환경. 두 루프백에만 연다.
    Sandbox,
}

impl AppEnv {
    /// `APP_ENV` 의 값(앞뒤 공백은 걷는다)을 읽는다. 문구에는 이름만 싣는다.
    fn parse(raw: Option<String>) -> Result<AppEnv, ConfigError> {
        match trimmed(raw).as_deref() {
            Some("production") => Ok(AppEnv::Production),
            Some("sandbox") => Ok(AppEnv::Sandbox),
            Some(_) => Err(ConfigError(
                "APP_ENV must be production or sandbox".to_owned(),
            )),
            None => Err(ConfigError(
                "APP_ENV is not set — set APP_ENV=production or APP_ENV=sandbox \
                 (NODE_ENV is not read)"
                    .to_owned(),
            )),
        }
    }

    /// 이 환경에서 읽을 env 파일의 이름.
    pub fn env_file_name(self) -> &'static str {
        match self {
            AppEnv::Production => ".env.production",
            AppEnv::Sandbox => ".env.sandbox",
        }
    }
}

/// 기동에 필요한 설정. 값은 로그에 싣지 않는다.
#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub database_ssl: bool,
    pub app_env: AppEnv,
    pub model: ModelEnv,
    /// 로그인 토큰의 서명 비밀 값.
    pub jwt_secret: String,
    /// 로그인 토큰의 수명 글(`7d`, `12h`, 단위 없는 숫자는 초). 없거나 비면 `None` 이고 기본값(`7d`)과
    /// 글의 해석은 identity 의 몫이다. 읽지 못하는 글이면 기동 때 identity 가 막는다.
    pub jwt_ttl: Option<String>,
    /// `COOKIE_SECURE` 의 값. 없으면 `None` 이고 `APP_ENV` 가 정한다(`secure_cookies`).
    pub cookie_secure: Option<bool>,
    /// 자격증명(쿠키)을 실은 브라우저 요청을 허용하는 출처들(`ALLOWED_ORIGINS`). production 에서는 필수이고 비지 않는다.
    /// sandbox 에서 없으면 `None` 이고, CORS 는 요청의 출처를 그대로 돌려준다(개발 편의).
    pub allowed_origins: Option<Vec<String>>,
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
            .field("app_env", &self.app_env)
            .field("model", &self.model)
            .field("jwt_secret", &"<hidden>")
            .field("jwt_ttl", &self.jwt_ttl)
            .field("cookie_secure", &self.cookie_secure)
            .field("allowed_origins", &self.allowed_origins)
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
    /// `APP_ENV`(프로세스 환경)가 고른 env 파일을 먼저 올린 뒤(이미 있는 값은 덮지 않는다) 프로세스 환경에서 읽는다.
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
                     then set DATABASE_URL in apps/server/.env.sandbox or the environment)"
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
        let app_env = AppEnv::parse(lookup("APP_ENV"))?;
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
        let production = app_env == AppEnv::Production;
        let jwt_secret = match lookup("JWT_SECRET").filter(|v| !v.trim().is_empty()) {
            Some(secret) => secret,
            None if production => {
                return Err(ConfigError(
                    "JWT_SECRET is not set — required when APP_ENV=production".to_owned(),
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
        let allowed_origins = match parse_origins(lookup("ALLOWED_ORIGINS"))? {
            None if production => {
                return Err(ConfigError(
                    "ALLOWED_ORIGINS is not set — required when APP_ENV=production \
                     (comma-separated origins, e.g. https://<distribution id>.cloudfront.net)"
                        .to_owned(),
                ));
            }
            origins => origins,
        };
        Ok(Config {
            port,
            database_url,
            database_ssl,
            app_env,
            model,
            jwt_secret,
            jwt_ttl,
            cookie_secure,
            allowed_origins,
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

    /// 듣는 주소들. sandbox 에서는 두 루프백(127.0.0.1, ::1)에만 연다. `localhost` 가 어느 쪽으로 먼저 풀려도 붙게
    /// 하려는 것이다. `APP_ENV=production`(컨테이너)이면 모든 주소(0.0.0.0) 하나에 연다.
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

    /// `APP_ENV=production` 이면 참.
    pub fn is_production(&self) -> bool {
        self.app_env == AppEnv::Production
    }

    /// 로그인 쿠키에 Secure 를 붙이는가. `COOKIE_SECURE` 가 있으면 그 값, 없으면 `APP_ENV=production` 일 때 참이다.
    /// http 루프백의 컨테이너(`compose --profile full`)는 `COOKIE_SECURE=false` 로 로그인을 유지한다.
    pub fn secure_cookies(&self) -> bool {
        self.cookie_secure.unwrap_or_else(|| self.is_production())
    }
}

/// `ALLOWED_ORIGINS` 를 쉼표로 나눈다. 칸마다 앞뒤 공백과 끝의 `/` 를 걷고 빈 칸은 버린다(브라우저의 `Origin` 에는
/// 끝 `/` 가 없다). 남는 칸이 없으면 `None`. 헤더 값으로 쓸 수 없는 칸이 있으면 이름만 적고 실패한다.
fn parse_origins(raw: Option<String>) -> Result<Option<Vec<String>>, ConfigError> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let origins: Vec<String> = raw
        .split(',')
        .map(|v| v.trim().trim_end_matches('/').to_owned())
        .filter(|v| !v.is_empty())
        .collect();
    if origins
        .iter()
        .any(|v| axum::http::HeaderValue::from_str(v).is_err())
    {
        return Err(ConfigError(
            "ALLOWED_ORIGINS must be comma-separated origins (e.g. https://app.example)"
                .to_owned(),
        ));
    }
    Ok((!origins.is_empty()).then_some(origins))
}

/// 앞뒤 공백을 걷고, 빈 값은 없는 것으로 본다.
fn trimmed(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_owned()).filter(|v| !v.is_empty())
}

/// `APP_ENV` 가 고른 env 파일을 서버를 띄운 디렉터리에서 먼저 찾고, 없으면 이 크레이트의 디렉터리에서 찾는다.
/// 파일 이름을 `APP_ENV` 가 정하므로 `APP_ENV` 는 프로세스 환경에서만 읽는다(파일 안의 `APP_ENV` 는 덮지 않는다).
/// `APP_ENV` 가 없거나 모르는 값이면 파일을 올리지 않고, `from_lookup` 이 이름을 적고 기동을 막는다.
/// 파일이 없으면 프로세스 환경만 쓴다(컨테이너는 값을 환경으로 받는다).
fn load_env_file() {
    let Ok(app_env) = AppEnv::parse(std::env::var("APP_ENV").ok()) else {
        return;
    };
    let name = app_env.env_file_name();
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

/// 테스트가 `DATABASE_URL` 을 찾을 env 파일들(앞의 것이 먼저). 테스트는 `APP_ENV` 없이 돌기 쉽고 sandbox DB 에서만
/// 돌므로, 서버 기동의 규칙을 따르지 않고 이 크레이트의 디렉터리의 `.env.sandbox` 만 찾는다.
#[cfg(test)]
fn test_env_files(crate_dir: &Path) -> [PathBuf; 1] {
    [crate_dir.join(".env.sandbox")]
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
             DATABASE_URL 을 환경이나 apps/server/.env.sandbox 에 둔다",
        )
}

#[cfg(test)]
mod tests;

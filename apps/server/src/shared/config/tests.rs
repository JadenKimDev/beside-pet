use std::collections::HashMap;

use super::{Config, ENV_NAMES, env_file_name, test_env_files};

fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: HashMap<String, String> = pairs
        .iter()
        .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
        .collect();
    move |name| map.get(name).cloned()
}

#[test]
fn database_url_가_없으면_이유를_적고_실패한다() {
    let err = Config::from_lookup(lookup(&[("PORT", "3000")])).unwrap_err();
    assert!(err.to_string().contains("DATABASE_URL"), "{err}");
}

#[test]
fn 빈_database_url_도_없는_것으로_본다() {
    let err = Config::from_lookup(lookup(&[("DATABASE_URL", "  ")])).unwrap_err();
    assert!(err.to_string().contains("DATABASE_URL"), "{err}");
}

#[test]
fn 기본값은_3000_포트와_tls_없음이다() {
    let config = Config::from_lookup(lookup(&[("DATABASE_URL", "postgres://u:p@h/db")])).unwrap();
    assert_eq!(config.port, 3000);
    assert!(!config.database_ssl);
    assert_eq!(config.database_url, "postgres://u:p@h/db");
    assert!(!config.is_production());
}

#[test]
fn 값을_읽는다() {
    let config = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("PORT", "4100"),
        ("DATABASE_SSL", "true"),
        ("NODE_ENV", "production"),
        ("JWT_SECRET", "fixture-secret"),
    ]))
    .unwrap();
    assert_eq!(config.port, 4100);
    assert!(config.database_ssl);
    assert!(config.is_production());
}

#[test]
fn 개발에서는_두_루프백에_연다() {
    let dev = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("PORT", "4100"),
    ]))
    .unwrap();
    let addresses: Vec<String> = dev
        .listen_addresses()
        .iter()
        .map(ToString::to_string)
        .collect();
    assert_eq!(addresses, ["127.0.0.1:4100", "[::1]:4100"]);
}

#[test]
fn production_에서는_모든_주소_하나에_연다() {
    let prod = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("NODE_ENV", "production"),
        ("JWT_SECRET", "fixture-secret"),
    ]))
    .unwrap();
    let addresses: Vec<String> = prod
        .listen_addresses()
        .iter()
        .map(ToString::to_string)
        .collect();
    assert_eq!(addresses, ["0.0.0.0:3000"]);
}

#[test]
fn database_ssl_은_정확히_true_일_때만_켠다() {
    for value in ["TRUE", "1", "yes", "false", ""] {
        let config = Config::from_lookup(lookup(&[
            ("DATABASE_URL", "postgres://u:p@h/db"),
            ("DATABASE_SSL", value),
        ]))
        .unwrap();
        assert!(!config.database_ssl, "{value}");
    }
}

#[test]
fn 포트가_숫자가_아니면_실패한다() {
    let err = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("PORT", "abc"),
    ]))
    .unwrap_err();
    assert!(err.to_string().contains("PORT"), "{err}");
}

#[test]
fn 오류_문구에_값을_싣지_않는다() {
    let err = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:secret@h/db"),
        ("PORT", "secret-port"),
    ]))
    .unwrap_err();
    assert!(!err.to_string().contains("secret"), "{err}");
}

#[test]
fn node_env_가_env_파일을_고른다() {
    assert_eq!(env_file_name(Some("development")), ".env.development");
    assert_eq!(env_file_name(Some("production")), ".env");
    assert_eq!(env_file_name(None), ".env");
}

#[test]
fn 테스트는_node_env_없이도_env_development_를_먼저_읽고_그다음_env_를_읽는다() {
    let dir = std::path::Path::new("/crate");
    assert_eq!(
        test_env_files(dir),
        [dir.join(".env.development"), dir.join(".env")]
    );
}

#[test]
fn 읽는_이름은_모두_env_example_에_있다() {
    let example = include_str!("../../../.env.example");
    let declared: Vec<&str> = example
        .lines()
        .map(str::trim)
        .filter(|line| !line.starts_with('#'))
        .filter_map(|line| line.split_once('=').map(|(name, _)| name.trim()))
        .collect();
    for name in ENV_NAMES {
        assert!(
            declared.contains(&name),
            "{name} 이 apps/server/.env.example 에 없다"
        );
    }
}

#[test]
fn config_rs_가_읽는_이름은_모두_env_names_에_있다() {
    let source = include_str!("../config.rs");
    let pattern = regex::Regex::new(r#"lookup\("([A-Z_]+)"\)|var\("([A-Z_]+)"\)"#).unwrap();
    let mut seen = 0;
    for caps in pattern.captures_iter(source) {
        let name = caps.get(1).or_else(|| caps.get(2)).unwrap().as_str();
        assert!(
            ENV_NAMES.contains(&name),
            "config.rs 가 {name} 을 읽지만 ENV_NAMES 에 없다"
        );
        seen += 1;
    }
    assert!(seen >= 4, "config.rs 에서 읽는 이름을 찾지 못했다");
}

#[test]
fn 환경_변수는_config_rs_만_읽는다() {
    let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut offenders = Vec::new();
    visit(&src, &mut |path, text| {
        let rel = path
            .strip_prefix(&src)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if rel == "shared/config.rs" || rel.starts_with("shared/config/") {
            return;
        }
        for needle in ["env::var", "env::vars", "dotenvy", "var_os("] {
            if text.contains(needle) {
                offenders.push(format!("{rel}: {needle}"));
            }
        }
    });
    assert!(
        offenders.is_empty(),
        "환경 변수는 shared/config.rs 만 읽는다: {offenders:?}"
    );
}

fn visit(dir: &std::path::Path, f: &mut dyn FnMut(&std::path::Path, &str)) {
    for entry in std::fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            visit(&path, f);
        } else if path.extension().is_some_and(|ext| ext == "rs") {
            let text = std::fs::read_to_string(&path).unwrap();
            f(&path, &text);
        }
    }
}

const DB: (&str, &str) = ("DATABASE_URL", "postgres://u:p@h/db");

#[test]
fn 모델_값을_읽어_다듬는다() {
    let config = Config::from_lookup(lookup(&[
        DB,
        ("LLM_PROVIDER", " ollama "),
        ("LLM_MODEL", "gemma4"),
        ("CLAUDE_MODEL", "  "),
        ("ANTHROPIC_API_KEY", "sk-test-fake"),
        ("ANTHROPIC_BASE_URL", "http://127.0.0.1:9"),
        ("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
        ("OLLAMA_THINK", "true"),
    ]))
    .unwrap();
    assert_eq!(config.model.provider.as_deref(), Some("ollama"));
    assert_eq!(config.model.model.as_deref(), Some("gemma4"));
    assert_eq!(config.model.claude_model, None);
    assert_eq!(
        config.model.anthropic_api_key.as_deref(),
        Some("sk-test-fake")
    );
    assert_eq!(
        config.model.anthropic_base_url.as_deref(),
        Some("http://127.0.0.1:9")
    );
    assert_eq!(
        config.model.ollama_base_url.as_deref(),
        Some("http://127.0.0.1:11434")
    );
    assert!(config.model.ollama_think);
}

#[test]
fn ollama_think_은_정확히_true_일_때만_켠다() {
    for value in ["TRUE", "1", "yes", "false", ""] {
        let config = Config::from_lookup(lookup(&[DB, ("OLLAMA_THINK", value)])).unwrap();
        assert!(!config.model.ollama_think, "{value}");
    }
}

#[test]
fn 모르는_llm_provider_는_이름만_적고_실패한다() {
    let err = Config::from_lookup(lookup(&[DB, ("LLM_PROVIDER", "secret-vendor")])).unwrap_err();
    assert!(err.to_string().contains("LLM_PROVIDER"), "{err}");
    assert!(!err.to_string().contains("secret"), "{err}");
}

#[test]
fn 기본_공급자가_anthropic_이면_키가_있어야_기동한다() {
    for pairs in [
        vec![DB],
        vec![DB, ("LLM_PROVIDER", "anthropic")],
        vec![DB, ("ANTHROPIC_API_KEY", "  ")],
    ] {
        let config = Config::from_lookup(lookup(&pairs)).unwrap();
        let err = config.require_default_model().unwrap_err();
        assert!(err.to_string().contains("ANTHROPIC_API_KEY"), "{err}");
    }
    let config = Config::from_lookup(lookup(&[DB, ("ANTHROPIC_API_KEY", "sk-test-fake")])).unwrap();
    assert!(config.require_default_model().is_ok());
}

#[test]
fn 기본_공급자가_ollama_면_llm_model_만_있으면_기동한다() {
    let missing = [
        vec![DB, ("LLM_PROVIDER", "ollama")],
        vec![
            DB,
            ("LLM_PROVIDER", "ollama"),
            ("CLAUDE_MODEL", "claude-haiku-4-5"),
        ],
    ];
    for pairs in missing {
        let config = Config::from_lookup(lookup(&pairs)).unwrap();
        let err = config.require_default_model().unwrap_err();
        assert!(err.to_string().contains("LLM_MODEL"), "{err}");
    }
    let config = Config::from_lookup(lookup(&[
        DB,
        ("LLM_PROVIDER", "ollama"),
        ("LLM_MODEL", "gemma4"),
    ]))
    .unwrap();
    assert!(config.require_default_model().is_ok());
}

#[test]
fn debug_에_키를_싣지_않는다() {
    let config = Config::from_lookup(lookup(&[DB, ("ANTHROPIC_API_KEY", "sk-test-fake")])).unwrap();
    let debug = format!("{config:?}");
    assert!(!debug.contains("sk-test-fake"), "{debug}");
    assert!(debug.contains("<hidden>"), "{debug}");
}

#[test]
fn jwt_설정이_없으면_개발용_비밀_값과_빈_수명이다() {
    let config = Config::from_lookup(lookup(&[("DATABASE_URL", "postgres://u:p@h/db")])).unwrap();
    assert_eq!(config.jwt_secret, "dev-insecure-secret-change-me");
    assert_eq!(config.jwt_ttl, None);
    let blank = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("JWT_SECRET", " "),
        ("JWT_TTL", ""),
    ]))
    .unwrap();
    assert_eq!(blank.jwt_secret, "dev-insecure-secret-change-me");
    assert_eq!(blank.jwt_ttl, None);
}

#[test]
fn jwt_설정을_읽는다() {
    let config = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("JWT_SECRET", "fixture-secret"),
        ("JWT_TTL", "12h"),
        ("NODE_ENV", "production"),
    ]))
    .unwrap();
    assert_eq!(config.jwt_secret, "fixture-secret");
    assert_eq!(config.jwt_ttl.as_deref(), Some("12h"));
}

#[test]
fn production_에서_jwt_secret_이_없으면_기동하지_않는다() {
    for secret in [None, Some(""), Some("  ")] {
        let mut pairs = vec![
            ("DATABASE_URL", "postgres://u:p@h/db"),
            ("NODE_ENV", "production"),
        ];
        if let Some(secret) = secret {
            pairs.push(("JWT_SECRET", secret));
        }
        let err = Config::from_lookup(lookup(&pairs)).unwrap_err();
        assert!(err.to_string().contains("JWT_SECRET"), "{err}");
        assert!(!err.to_string().contains("dev-insecure"), "{err}");
    }
}

#[test]
fn debug_에_jwt_secret_을_싣지_않는다() {
    let config = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("JWT_SECRET", "fixture-secret"),
    ]))
    .unwrap();
    let shown = format!("{config:?}");
    assert!(!shown.contains("fixture-secret"), "{shown}");
    assert!(shown.contains("<hidden>"), "{shown}");
}

fn prod_with(extra: &[(&str, &str)]) -> Result<Config, super::ConfigError> {
    let mut pairs = vec![
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("NODE_ENV", "production"),
        ("JWT_SECRET", "fixture-secret"),
    ];
    pairs.extend_from_slice(extra);
    Config::from_lookup(lookup(&pairs))
}

#[test]
fn cookie_secure_가_없으면_production_에서만_secure_쿠키다() {
    assert!(prod_with(&[]).unwrap().secure_cookies());
    let dev = Config::from_lookup(lookup(&[("DATABASE_URL", "postgres://u:p@h/db")])).unwrap();
    assert!(!dev.secure_cookies());
}

#[test]
fn cookie_secure_가_production_의_기본을_덮는다() {
    assert!(
        !prod_with(&[("COOKIE_SECURE", "false")])
            .unwrap()
            .secure_cookies()
    );
    assert!(
        !prod_with(&[("COOKIE_SECURE", " FALSE ")])
            .unwrap()
            .secure_cookies()
    );
    let dev = Config::from_lookup(lookup(&[
        ("DATABASE_URL", "postgres://u:p@h/db"),
        ("COOKIE_SECURE", "True"),
    ]))
    .unwrap();
    assert!(dev.secure_cookies());
}

#[test]
fn cookie_secure_가_true_false_가_아니면_이름만_적고_실패한다() {
    let err = prod_with(&[("COOKIE_SECURE", "yes-fixture")]).unwrap_err();
    let text = err.to_string();
    assert!(text.contains("COOKIE_SECURE"), "{text}");
    assert!(!text.contains("yes-fixture"), "{text}");
}

//! 계측 저장 SQL 의 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 지운다. 값은 모두 지어낸 것이다.

use std::str::FromStr;

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool, Row};

use super::PostgresMetrics;
use crate::metrics::{
    ConversationDay, CrisisCounts, DailyUsage, ModelUsage, Period, ReplyLabelCounts,
};
use crate::shared::{MIGRATOR, test_database_url};

/// 테스트 하나의 스키마. `pool` 은 그 스키마만 본다.
struct MetricsSchema {
    root: PgPool,
    schema: String,
    pool: PgPool,
}

impl MetricsSchema {
    async fn open() -> MetricsSchema {
        let options = PgConnectOptions::from_str(&test_database_url())
            .expect("DATABASE_URL 이 postgres 주소가 아니다")
            .ssl_mode(PgSslMode::Disable);
        let root = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await
            .expect("DATABASE_URL 의 DB 에 붙지 못했다. pnpm db:up 으로 띄웠는지 본다");
        static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let schema = format!(
            "metrics_test_{}_{}_{}",
            std::process::id(),
            Utc::now().timestamp_micros(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        root.execute(AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
            .await
            .unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect_with(options.options([("search_path", schema.as_str())]))
            .await
            .unwrap();
        MIGRATOR.run(&pool).await.unwrap();
        MetricsSchema { root, schema, pool }
    }

    /// 테스트 안의 고정 SQL 만 돌린다.
    async fn exec(&self, sql: &str) {
        self.pool
            .execute(AssertSqlSafe(sql.to_owned()))
            .await
            .unwrap_or_else(|e| panic!("{e}: {sql}"));
    }

    async fn close(self) {
        self.pool.close().await;
        self.root
            .execute(AssertSqlSafe(format!(
                "DROP SCHEMA \"{}\" CASCADE",
                self.schema
            )))
            .await
            .unwrap();
    }
}

/// 지어낸 호출 하나. 출력 토큰이 없으면 실패한 호출이다.
struct Call {
    at: &'static str,
    provider: &'static str,
    model: &'static str,
    purpose: &'static str,
    version: &'static str,
    duration_ms: i32,
    first_token_ms: Option<i32>,
    input_tokens: i32,
    output_tokens: Option<i32>,
}

const HAIKU: Call = Call {
    at: "2026-10-18T09:00:00Z",
    provider: "anthropic",
    model: "claude-haiku-5-5",
    purpose: "reply",
    version: "0.1.0",
    duration_ms: 100,
    first_token_ms: Some(40),
    input_tokens: 1000,
    output_tokens: Some(100),
};

impl Call {
    fn insert(&self, id: usize) -> String {
        let n = |v: Option<i32>| v.map_or("NULL".to_owned(), |v| v.to_string());
        let (outcome, kind) = match self.output_tokens {
            Some(_) => ("ok", "NULL"),
            None => ("error", "'provider'"),
        };
        format!(
            "INSERT INTO llm_calls (id, at, provider, model, purpose, prompt_version, session_id, \
             input_tokens, output_tokens, duration_ms, first_token_ms, outcome, error_kind) VALUES \
             ('call-{id}', '{}', '{}', '{}', '{}', '{}', 'sess-fake-1', {}, {}, {}, {}, '{outcome}', {kind})",
            self.at,
            self.provider,
            self.model,
            self.purpose,
            self.version,
            self.input_tokens,
            n(self.output_tokens),
            self.duration_ms,
            n(self.first_token_ms),
        )
    }
}

fn calls() -> Vec<Call> {
    vec![
        // 기간 밖(앞뒤로 1초).
        Call {
            at: "2026-10-17T23:59:59Z",
            ..HAIKU
        },
        Call {
            at: "2026-10-20T00:00:01Z",
            ..HAIKU
        },
        // reply 0.1.0: 시간 100, 200, 300, 400 과 첫 글자 40, 60, (없음), 80.
        HAIKU,
        Call {
            at: "2026-10-18T10:00:00Z",
            duration_ms: 200,
            first_token_ms: Some(60),
            input_tokens: 2000,
            output_tokens: Some(200),
            ..HAIKU
        },
        Call {
            at: "2026-10-19T09:00:00Z",
            duration_ms: 300,
            first_token_ms: None,
            input_tokens: 500,
            output_tokens: None,
            ..HAIKU
        },
        Call {
            at: "2026-10-19T10:00:00Z",
            duration_ms: 400,
            first_token_ms: Some(80),
            input_tokens: 1500,
            output_tokens: Some(300),
            ..HAIKU
        },
        // 위기 판정: 스트리밍이 아니다.
        Call {
            at: "2026-10-18T11:00:00Z",
            purpose: "crisis",
            duration_ms: 50,
            first_token_ms: None,
            input_tokens: 300,
            output_tokens: Some(2),
            ..HAIKU
        },
        // 같은 역할의 다른 프롬프트 버전.
        Call {
            at: "2026-10-19T11:00:00Z",
            version: "0.2.0",
            duration_ms: 900,
            first_token_ms: Some(100),
            input_tokens: 10,
            output_tokens: Some(20),
            ..HAIKU
        },
        // 단가가 없는 공급자.
        Call {
            at: "2026-10-19T12:00:00Z",
            provider: "ollama",
            model: "gemma4",
            duration_ms: 700,
            first_token_ms: Some(90),
            input_tokens: 700,
            output_tokens: Some(70),
            ..HAIKU
        },
    ]
}

fn at(text: &str) -> DateTime<Utc> {
    text.parse().unwrap()
}

fn day(text: &str) -> NaiveDate {
    NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
}

fn period() -> Period {
    Period {
        from: at("2026-10-18T00:00:00Z"),
        to: at("2026-10-19T23:59:59Z"),
    }
}

/// claude-haiku-5-5 의 단가(USD/MTok): 입력 0.10, 출력 0.50.
fn haiku_cost(input: i64, output: i64) -> f64 {
    (input as f64 * 0.10 + output as f64 * 0.50) / 1e6
}

fn assert_close(got: f64, want: f64, what: &str) {
    assert!((got - want).abs() < 1e-12, "{what}: got {got}, want {want}");
}

async fn seeded() -> MetricsSchema {
    let schema = MetricsSchema::open().await;
    for (id, call) in calls().iter().enumerate() {
        schema.exec(&call.insert(id)).await;
    }
    schema
}

#[tokio::test]
async fn 모델별_묶음은_호출_수_토큰_시간_백분위_비용을_센다() {
    let schema = seeded().await;
    let store = PostgresMetrics::shared(schema.pool.clone());
    let got = store.models(period()).await.unwrap();

    let row = |purpose: &str, version: &str| ModelUsage {
        provider: "anthropic".to_owned(),
        model: "claude-haiku-5-5".to_owned(),
        purpose: purpose.to_owned(),
        prompt_version: version.to_owned(),
        calls: 0,
        errors: 0,
        input_tokens: 0,
        output_tokens: 0,
        p50_ms: 0.0,
        p95_ms: 0.0,
        first_token_p50_ms: None,
        cost_usd: 0.0,
    };
    let want = vec![
        ModelUsage {
            calls: 1,
            input_tokens: 300,
            output_tokens: 2,
            p50_ms: 50.0,
            p95_ms: 50.0,
            cost_usd: haiku_cost(300, 2),
            ..row("crisis", "0.1.0")
        },
        ModelUsage {
            calls: 4,
            errors: 1,
            input_tokens: 5000,
            output_tokens: 600,
            p50_ms: 250.0,
            // 연속 백분위: 300 + 0.85 × (400 - 300).
            p95_ms: 385.0,
            first_token_p50_ms: Some(60.0),
            cost_usd: haiku_cost(5000, 600),
            ..row("reply", "0.1.0")
        },
        ModelUsage {
            calls: 1,
            input_tokens: 10,
            output_tokens: 20,
            p50_ms: 900.0,
            p95_ms: 900.0,
            first_token_p50_ms: Some(100.0),
            cost_usd: haiku_cost(10, 20),
            ..row("reply", "0.2.0")
        },
        ModelUsage {
            provider: "ollama".to_owned(),
            model: "gemma4".to_owned(),
            calls: 1,
            input_tokens: 700,
            output_tokens: 70,
            p50_ms: 700.0,
            p95_ms: 700.0,
            first_token_p50_ms: Some(90.0),
            cost_usd: 0.0,
            ..row("reply", "0.1.0")
        },
    ];
    assert_eq!(got.len(), want.len(), "{got:?}");
    for (got, want) in got.iter().zip(&want) {
        assert_close(got.cost_usd, want.cost_usd, &want.purpose);
        assert_eq!(
            got,
            &ModelUsage {
                cost_usd: got.cost_usd,
                ..want.clone()
            }
        );
    }

    // 호출 수와 토큰 합은 llm_calls 를 직접 센 값과 같다.
    let direct = sqlx::query(
        "SELECT count(*), COALESCE(sum(input_tokens), 0)::bigint, COALESCE(sum(output_tokens), 0)::bigint \
         FROM llm_calls WHERE at >= $1 AND at <= $2",
    )
    .bind(period().from)
    .bind(period().to)
    .fetch_one(&schema.pool)
    .await
    .unwrap();
    let total = |f: fn(&ModelUsage) -> i64| got.iter().map(f).sum::<i64>();
    assert_eq!(total(|m| m.calls), direct.get::<i64, _>(0));
    assert_eq!(total(|m| m.input_tokens), direct.get::<i64, _>(1));
    assert_eq!(total(|m| m.output_tokens), direct.get::<i64, _>(2));
    schema.close().await;
}

#[tokio::test]
async fn 기간에_호출이_없으면_빈_목록이다() {
    let schema = seeded().await;
    let store = PostgresMetrics::shared(schema.pool.clone());
    let empty = Period {
        from: at("2026-09-01T00:00:00Z"),
        to: at("2026-09-02T00:00:00Z"),
    };
    assert!(store.models(empty).await.unwrap().is_empty());
    assert!(store.model_days(empty).await.unwrap().is_empty());
    assert!(store.conversation_days(empty).await.unwrap().is_empty());
    schema.close().await;
}

#[tokio::test]
async fn 날짜별_모델_집계는_기간이_걸친_날짜만_낸다() {
    let schema = seeded().await;
    let store = PostgresMetrics::shared(schema.pool.clone());
    let got = store.model_days(period()).await.unwrap();
    let haiku = |date: &str, calls, errors, input, output| DailyUsage {
        date: day(date),
        provider: "anthropic".to_owned(),
        model: "claude-haiku-5-5".to_owned(),
        calls,
        errors,
        input_tokens: input,
        output_tokens: output,
        cost_usd: haiku_cost(input, output),
    };
    let want = vec![
        haiku("2026-10-18", 3, 0, 3300, 302),
        haiku("2026-10-19", 3, 1, 2010, 320),
        DailyUsage {
            provider: "ollama".to_owned(),
            model: "gemma4".to_owned(),
            input_tokens: 700,
            output_tokens: 70,
            calls: 1,
            errors: 0,
            cost_usd: 0.0,
            ..haiku("2026-10-19", 0, 0, 0, 0)
        },
    ];
    assert_eq!(got.len(), want.len(), "{got:?}");
    for (got, want) in got.iter().zip(&want) {
        assert_close(got.cost_usd, want.cost_usd, &want.model);
        assert_eq!(
            got,
            &DailyUsage {
                cost_usd: got.cost_usd,
                ..want.clone()
            }
        );
    }
    schema.close().await;
}

#[tokio::test]
async fn 날짜별_대화는_시작한_대화와_사용자_턴과_위기를_센다() {
    let schema = MetricsSchema::open().await;
    let session = |id: &str, at: &str| {
        format!(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile, created_at, updated_at) \
             VALUES ('{id}', 'acc-fake-1', 1, 0, 1, false, '{{}}', '{at}', '{at}')"
        )
    };
    let message = |sid: &str, seq: i32, role: &str, at: &str| {
        format!(
            "INSERT INTO messages (session_id, seq, role, text, task, at) \
             VALUES ('{sid}', {seq}, '{role}', 'placeholder', 1, '{at}')"
        )
    };
    let analysis = |sid: &str, seq: i32, level: i32, by: &str, at: &str| {
        format!(
            "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
             from_task, to_task, advanced, retry_count, knowledge) \
             VALUES ('{sid}', {seq}, '{at}', 1, 'task', {level}, '{by}', 1, 1, false, 0, '[]')"
        )
    };
    for sql in [
        session("sess-fake-a", "2026-10-17T09:00:00Z"),
        session("sess-fake-b", "2026-10-18T09:00:00Z"),
        session("sess-fake-c", "2026-10-18T10:00:00Z"),
        message("sess-fake-a", 0, "user", "2026-10-17T09:01:00Z"),
        message("sess-fake-a", 1, "user", "2026-10-18T08:00:00Z"),
        message("sess-fake-b", 0, "assistant", "2026-10-18T09:00:01Z"),
        message("sess-fake-b", 1, "user", "2026-10-18T09:01:00Z"),
        message("sess-fake-b", 2, "user", "2026-10-19T09:01:00Z"),
        message("sess-fake-c", 0, "user", "2026-10-20T09:01:00Z"),
        analysis("sess-fake-a", 1, 3, "keyword", "2026-10-18T08:00:00Z"),
        analysis("sess-fake-c", 1, 3, "model", "2026-10-18T10:01:00Z"),
        analysis("sess-fake-b", 1, 1, "none", "2026-10-18T09:01:00Z"),
        analysis("sess-fake-b", 2, 3, "model", "2026-10-19T09:01:00Z"),
        analysis("sess-fake-c", 0, 3, "keyword", "2026-10-20T09:01:00Z"),
    ] {
        schema.exec(&sql).await;
    }
    let store = PostgresMetrics::shared(schema.pool.clone());
    let got = store.conversation_days(period()).await.unwrap();
    let crisis = |keyword, model| CrisisCounts { keyword, model };
    assert_eq!(
        got,
        vec![
            ConversationDay {
                date: day("2026-10-18"),
                sessions: 2,
                turns: 2,
                crisis: crisis(1, 1),
                reply_labels: ReplyLabelCounts::default(),
            },
            ConversationDay {
                date: day("2026-10-19"),
                sessions: 0,
                turns: 1,
                crisis: crisis(0, 1),
                reply_labels: ReplyLabelCounts::default(),
            },
        ]
    );
    schema.close().await;
}

#[tokio::test]
async fn 날짜별_대화는_답의_라벨을_날짜로_센다() {
    let schema = MetricsSchema::open().await;
    let message = |seq: i32, at: &str| {
        format!(
            "INSERT INTO messages (session_id, seq, role, text, task, at) \
             VALUES ('sess-fake-l', {seq}, 'user', 'placeholder', 1, '{at}')"
        )
    };
    let judged = |seq: i32, label: &str, at: &str| {
        let label = if label == "NULL" {
            "NULL".to_owned()
        } else {
            format!("'{label}'")
        };
        format!(
            "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
             from_task, to_task, advanced, retry_count, knowledge, reply_label, reply_label_probability, reply_judge) \
             VALUES ('sess-fake-l', {seq}, '{at}', 1, 'task', 1, 'none', 1, 1, false, 0, '[]', {label}, 0.9, 'fake')"
        )
    };
    for sql in [
        "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, grief_profile, created_at, updated_at) \
         VALUES ('sess-fake-l', 'acc-fake-1', 1, 0, 1, false, '{}', '2026-10-18T09:00:00Z', '2026-10-18T09:00:00Z')"
            .to_owned(),
        message(0, "2026-10-18T09:01:00Z"),
        message(1, "2026-10-18T09:02:00Z"),
        message(2, "2026-10-18T09:03:00Z"),
        message(3, "2026-10-18T09:04:00Z"),
        // 기간 밖의 판정은 세지 않는다.
        judged(9, "question", "2026-10-17T23:59:00Z"),
        judged(0, "generic_comfort", "2026-10-18T09:01:00Z"),
        judged(1, "generic_comfort", "2026-10-18T09:02:00Z"),
        judged(2, "question", "2026-10-18T09:03:00Z"),
        // 판정이 없던 턴(NULL)은 세지 않는다.
        judged(3, "NULL", "2026-10-18T09:04:00Z"),
        // 사용자 턴이 없는 날의 판정도 그 날짜의 행으로 낸다.
        judged(4, "specific_reflection", "2026-10-19T00:00:10Z"),
    ] {
        schema.exec(&sql).await;
    }
    let store = PostgresMetrics::shared(schema.pool.clone());
    let got = store.conversation_days(period()).await.unwrap();
    assert_eq!(
        got,
        vec![
            ConversationDay {
                date: day("2026-10-18"),
                sessions: 1,
                turns: 4,
                crisis: CrisisCounts {
                    keyword: 0,
                    model: 0
                },
                reply_labels: ReplyLabelCounts {
                    generic_comfort: 2,
                    specific_reflection: 0,
                    question: 1,
                },
            },
            ConversationDay {
                date: day("2026-10-19"),
                sessions: 0,
                turns: 0,
                crisis: CrisisCounts {
                    keyword: 0,
                    model: 0
                },
                reply_labels: ReplyLabelCounts {
                    generic_comfort: 0,
                    specific_reflection: 1,
                    question: 0,
                },
            },
        ]
    );
    schema.close().await;
}

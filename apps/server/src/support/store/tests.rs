//! 대화 저장 SQL 의 테스트. DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다).
//! 테스트마다 새 스키마에 마이그레이션을 돌리고 끝나면 지운다. 값은 모두 지어낸 것이다.

mod latest;
mod memory;
mod reply_judgement;
mod trace;
mod trash;
mod turn_states;

use std::str::FromStr;

use chrono::{DateTime, Duration, TimeZone, Utc};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use sqlx::{AssertSqlSafe, Executor, PgPool};

use super::super::request::{DailyStateRequest, GriefPath, LossType, SleepState, TogetherRange};
use super::super::response::{
    KnowledgeRefResponse, MessageRole, MindReportSectionResponse, ReplyPhase, ReportSectionKey,
    RiskDetector, SupervisionQuality, SupervisionResponse,
};
use super::super::rules::{
    GriefProfile, MindReport, RiskAssessment, SupportLevel, Task, TaskTransition, TurnAnalysis,
};
use super::super::session::{
    Message, MessageActivity, SessionSnapshot, Turn, TurnErrorKind, TurnStatus,
};
use super::{SessionStore, StoreError};
use crate::identity::{AccountActivity, ChatLanguage};
use crate::shared::{MIGRATOR, test_database_url};

/// 테스트 하나의 스키마. `pool` 은 그 스키마만 본다.
struct SessionsSchema {
    root: PgPool,
    schema: String,
    pool: PgPool,
}

impl SessionsSchema {
    async fn open() -> SessionsSchema {
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
            "sessions_test_{}_{}_{}",
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
        SessionsSchema { root, schema, pool }
    }

    fn store(&self) -> SessionStore {
        SessionStore::new(self.pool.clone())
    }

    /// 그 세션의 행 수: (sessions, messages, turn_analyses, turns).
    async fn rows_of(&self, id: &str) -> (i64, i64, i64, i64) {
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM sessions WHERE id = $1), \
                    (SELECT count(*) FROM messages WHERE session_id = $1), \
                    (SELECT count(*) FROM turn_analyses WHERE session_id = $1), \
                    (SELECT count(*) FROM turns WHERE session_id = $1)",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .unwrap()
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

fn minute(n: i64) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap() + Duration::minutes(n)
}

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("Dotori".to_owned()),
        together_range: Some(TogetherRange::FourToSeven),
        loss_type: Some(LossType::Illness),
        situation: None,
        weeks_since_loss: Some(3.0),
        daily_state: Some(DailyStateRequest {
            sleep: Some(SleepState::Disturbed),
            eating: None,
        }),
        preferred_language: Some(ChatLanguage::Ko),
    }
}

fn message(role: MessageRole, text: &str, number: u8, at: i64) -> Message {
    Message {
        role,
        text: text.to_owned(),
        task: task(number),
        at: minute(at),
        turn_id: None,
    }
}

/// 턴 id 는 전역 PK 라 세션 id 를 붙여 짓는다.
fn turn_id(session: &str, n: u8) -> String {
    format!("{session}-turn-{n}")
}

fn done_turn(session: &str, n: u8, started: i64, finished: i64) -> Turn {
    Turn {
        id: turn_id(session, n),
        status: TurnStatus::Done,
        started_at: minute(started),
        finished_at: Some(minute(finished)),
        error_kind: None,
    }
}

fn pending_turn(session: &str, n: u8, started: i64) -> Turn {
    Turn {
        id: turn_id(session, n),
        status: TurnStatus::Pending,
        started_at: minute(started),
        finished_at: None,
        error_kind: None,
    }
}

fn in_turn(message: Message, session: &str, n: u8) -> Message {
    Message {
        turn_id: Some(turn_id(session, n)),
        ..message
    }
}

fn analysis(at: i64, from: u8, to: u8, supervised: bool) -> TurnAnalysis {
    TurnAnalysis {
        at: minute(at),
        task: task(to),
        phase: if from == to {
            ReplyPhase::Deepen
        } else {
            ReplyPhase::Task
        },
        risk: RiskAssessment {
            level: SupportLevel::Safe,
            detected_by: RiskDetector::None,
        },
        transition: TaskTransition {
            from: task(from),
            to: task(to),
            advanced: from != to,
            retry_count: 0,
        },
        knowledge: if supervised {
            vec![KnowledgeRefResponse {
                source: "fictional-guide.md".to_owned(),
                tags: vec!["memory".to_owned(), "guilt".to_owned()],
            }]
        } else {
            Vec::new()
        },
        supervision: supervised.then(|| SupervisionResponse {
            evaluated: true,
            quality: SupervisionQuality::Review,
            flags: vec!["tooLong".to_owned()],
            note: Some("made-up note".to_owned()),
        }),
        reply: None,
        trace: None,
    }
}

/// 전사 셋, 분석 둘, 끝난 턴 둘(첫 인사 턴, 사용자 턴)의 열린 세션.
fn snapshot(id: &str, owner: &str, started: i64) -> SessionSnapshot {
    SessionSnapshot {
        id: id.to_owned(),
        owner_id: owner.to_owned(),
        started_at: minute(started),
        grief_profile: profile(),
        task: task(2),
        retry_count: 1,
        support_level: SupportLevel::Safe,
        closed: false,
        history: vec![
            in_turn(
                message(MessageRole::Assistant, "made-up greeting", 1, started),
                id,
                0,
            ),
            in_turn(
                message(MessageRole::User, "made-up answer", 1, started + 1),
                id,
                1,
            ),
            in_turn(
                message(MessageRole::Assistant, "made-up reply", 2, started + 2),
                id,
                1,
            ),
        ],
        analyses: vec![
            analysis(started + 1, 1, 2, true),
            analysis(started + 2, 2, 2, false),
        ],
        turns: vec![
            done_turn(id, 0, started, started),
            done_turn(id, 1, started + 1, started + 2),
        ],
        report: None,
    }
}

fn report(at: i64) -> MindReport {
    MindReport {
        at: minute(at),
        pet_name: "Dotori".to_owned(),
        reached_task: task(3),
        locale: ChatLanguage::Ko,
        sections: vec![
            MindReportSectionResponse {
                key: ReportSectionKey::Journey,
                body: "made-up journey".to_owned(),
                tags: None,
            },
            MindReportSectionResponse {
                key: ReportSectionKey::Encouragement,
                body: "made-up encouragement".to_owned(),
                tags: None,
            },
        ],
    }
}

/// 닫히고 리포트가 붙은, 모델이 잡은 위기 판정이 있는 세션.
fn closed_with_report(id: &str, owner: &str, started: i64) -> SessionSnapshot {
    let mut snap = snapshot(id, owner, started);
    snap.task = task(3);
    snap.closed = true;
    snap.support_level = SupportLevel::Crisis;
    snap.analyses.push(TurnAnalysis {
        phase: ReplyPhase::Closing,
        risk: RiskAssessment {
            level: SupportLevel::Crisis,
            detected_by: RiskDetector::Model,
        },
        ..analysis(started + 3, 3, 3, false)
    });
    snap.report = Some(report(started + 4));
    // 답이 실패한 사용자 턴: 사용자 말은 남고 답은 없다.
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up unanswered", 3, started + 3),
        id,
        2,
    ));
    snap.turns.push(Turn {
        id: turn_id(id, 2),
        status: TurnStatus::Failed,
        started_at: minute(started + 3),
        finished_at: Some(minute(started + 4)),
        error_kind: Some(TurnErrorKind::Provider),
    });
    snap
}

#[tokio::test]
async fn 저장한_세션을_그대로_되살린다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let open = snapshot("s-open", "owner-a", 0);
    let closed = closed_with_report("s-closed", "owner-a", 10);
    store.save(&open).await.unwrap();
    store.save(&closed).await.unwrap();

    assert_eq!(store.find("s-open").await.unwrap(), Some(open));
    assert_eq!(store.find("s-closed").await.unwrap(), Some(closed));
    assert_eq!(store.find("s-nobody").await.unwrap(), None);
    db.close().await;
}

#[tokio::test]
async fn 감지_주체는_그대로_적히고_읽힌다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-detectors", "owner-a", 0);
    snap.analyses = [
        (SupportLevel::Crisis, RiskDetector::Keyword),
        (SupportLevel::Crisis, RiskDetector::Model),
        (SupportLevel::Safe, RiskDetector::None),
    ]
    .into_iter()
    .enumerate()
    .map(|(n, (level, detected_by))| TurnAnalysis {
        risk: RiskAssessment { level, detected_by },
        ..analysis(i64::try_from(n).unwrap() + 1, 2, 2, false)
    })
    .collect();
    store.save(&snap).await.unwrap();

    let written: Vec<(String,)> = sqlx::query_as(
        "SELECT risk_detected_by FROM turn_analyses WHERE session_id = $1 ORDER BY seq",
    )
    .bind("s-detectors")
    .fetch_all(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        written,
        vec![
            ("keyword".to_owned(),),
            ("model".to_owned(),),
            ("none".to_owned(),)
        ]
    );
    assert_eq!(store.find("s-detectors").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 빈_세션도_되살린다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut empty = snapshot("s-empty", "owner-a", 0);
    empty.task = Task::ONBOARDING;
    empty.history.clear();
    empty.analyses.clear();
    empty.turns.clear();
    store.save(&empty).await.unwrap();

    assert_eq!(store.find("s-empty").await.unwrap(), Some(empty));
    assert_eq!(db.rows_of("s-empty").await, (1, 0, 0, 0));
    db.close().await;
}

#[tokio::test]
async fn 두_번_저장해도_같다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let snap = closed_with_report("s-1", "owner-a", 0);
    store.save(&snap).await.unwrap();
    store.save(&snap).await.unwrap();

    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 4, 3, 3));
    db.close().await;
}

#[tokio::test]
async fn 이어_저장하면_바뀐_상태와_새_행이_더해진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    store.save(&snap).await.unwrap();

    snap.history.push(in_turn(
        message(MessageRole::User, "made-up follow-up", 2, 5),
        "s-1",
        2,
    ));
    snap.turns.push(done_turn("s-1", 2, 5, 6));
    snap.analyses.push(analysis(5, 2, 3, true));
    snap.task = task(3);
    snap.retry_count = 0;
    snap.closed = true;
    snap.report = Some(report(6));
    store.save(&snap).await.unwrap();

    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 4, 3, 3));
    db.close().await;
}

#[tokio::test]
async fn 줄어든_전사로_저장하면_꼬리_메시지가_사라진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    snap.history
        .push(message(MessageRole::User, "made-up fourth", 2, 3));
    snap.history
        .push(message(MessageRole::Assistant, "made-up fifth", 2, 4));
    store.save(&snap).await.unwrap();
    assert_eq!(db.rows_of("s-1").await, (1, 5, 2, 2));

    snap.history.truncate(3);
    store.save(&snap).await.unwrap();
    assert_eq!(db.rows_of("s-1").await, (1, 3, 2, 2));
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap.clone()));

    snap.history.clear();
    store.save(&snap).await.unwrap();
    assert_eq!(db.rows_of("s-1").await, (1, 0, 2, 2));
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 다른_소유자의_같은_id_로는_쓰지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mine = snapshot("s-1", "owner-a", 0);
    store.save(&mine).await.unwrap();

    let mut theirs = closed_with_report("s-1", "owner-b", 30);
    theirs
        .history
        .push(message(MessageRole::User, "made-up intrusion", 3, 31));
    assert!(matches!(
        store.save(&theirs).await,
        Err(StoreError::OwnerMismatch)
    ));
    assert_eq!(store.find("s-1").await.unwrap(), Some(mine));
    assert_eq!(db.rows_of("s-1").await, (1, 3, 2, 2));
    db.close().await;
}

#[tokio::test]
async fn 소유자별_목록은_최신순이고_상한까지다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    // 시작 순서와 저장 순서를 섞는다.
    let starts: Vec<i64> = (0..22).map(|n| (n * 7) % 22).collect();
    for start in &starts {
        store
            .save(&snapshot(&format!("a-{start:02}"), "owner-a", *start * 10))
            .await
            .unwrap();
    }
    let other = closed_with_report("b-1", "owner-b", 500);
    store.save(&other).await.unwrap();

    let listed = store.find_by_owner("owner-a", 20).await.unwrap();
    let ids: Vec<String> = listed.iter().map(|snap| snap.id.clone()).collect();
    let expected: Vec<String> = (2..22).rev().map(|n| format!("a-{n:02}")).collect();
    assert_eq!(ids, expected);
    assert_eq!(listed[0], snapshot("a-21", "owner-a", 210));
    assert_eq!(listed[19], snapshot("a-02", "owner-a", 20));

    assert_eq!(
        store.find_by_owner("owner-b", 20).await.unwrap(),
        vec![other]
    );
    assert!(store.find_by_owner("owner-c", 20).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn 메시지_집계는_세션마다_마지막_시각과_내림한_분과_수다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    // 0·1·2 분의 메시지 셋: 2분, 3개.
    store.save(&snapshot("s-a", "owner-a", 0)).await.unwrap();
    // 10분과 100분 59초의 메시지 둘: 90분 59초 → 90분(내림), 2개.
    let mut long = snapshot("s-b", "owner-a", 10);
    long.history = vec![
        message(MessageRole::Assistant, "made-up greeting", 1, 10),
        Message {
            at: minute(100) + Duration::seconds(59),
            ..message(MessageRole::User, "made-up answer", 1, 0)
        },
    ];
    long.analyses.truncate(1);
    store.save(&long).await.unwrap();
    let mut empty = snapshot("s-empty", "owner-a", 20);
    empty.history.clear();
    empty.analyses.clear();
    empty.turns.clear();
    store.save(&empty).await.unwrap();

    let activity = store
        .message_activity(&["s-a", "s-b", "s-empty", "s-nobody"])
        .await
        .unwrap();
    assert_eq!(
        activity.get("s-a"),
        Some(&MessageActivity {
            last_message_at: Some(minute(2)),
            duration_minutes: Some(2),
            message_count: 3,
        })
    );
    assert_eq!(
        activity.get("s-b"),
        Some(&MessageActivity {
            last_message_at: Some(minute(100) + Duration::seconds(59)),
            duration_minutes: Some(90),
            message_count: 2,
        })
    );
    assert_eq!(activity.len(), 2, "메시지가 없거나 없는 세션은 빠진다");
    assert!(store.message_activity(&[]).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn 계정별_활동은_세션_수와_그_세션들의_마지막_메시지_시각이다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    // owner-a: 0·1·2 분의 메시지가 있는 세션과 메시지가 없는 세션.
    store.save(&snapshot("s-a", "owner-a", 0)).await.unwrap();
    let mut empty = snapshot("s-a-empty", "owner-a", 50);
    empty.history.clear();
    empty.analyses.clear();
    empty.turns.clear();
    store.save(&empty).await.unwrap();
    // owner-b: 10·11·12 분과 30·31·32 분의 세션 둘.
    store.save(&snapshot("s-b1", "owner-b", 10)).await.unwrap();
    store.save(&snapshot("s-b2", "owner-b", 30)).await.unwrap();
    // owner-c: 메시지가 없는 세션 하나.
    let mut quiet = snapshot("s-c", "owner-c", 0);
    quiet.history.clear();
    quiet.analyses.clear();
    quiet.turns.clear();
    store.save(&quiet).await.unwrap();

    let owners = ["owner-a", "owner-b", "owner-c", "owner-nobody"].map(String::from);
    let activity = store.activity_by_owner(&owners).await.unwrap();
    assert_eq!(
        activity.get("owner-a"),
        Some(&AccountActivity {
            session_count: 2,
            last_active_at: Some(minute(2)),
        })
    );
    assert_eq!(
        activity.get("owner-b"),
        Some(&AccountActivity {
            session_count: 2,
            last_active_at: Some(minute(32)),
        })
    );
    assert_eq!(
        activity.get("owner-c"),
        Some(&AccountActivity {
            session_count: 1,
            last_active_at: None,
        }),
        "메시지가 없으면 시각이 없다"
    );
    assert_eq!(activity.len(), 3, "세션이 없는 계정은 빠진다");
    assert!(store.activity_by_owner(&[]).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn 세션_유무는_지금_남아_있는_세션으로_센다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    assert!(!store.has_sessions("owner-a").await.unwrap());
    store.save(&snapshot("s-a", "owner-a", 0)).await.unwrap();
    store.save(&snapshot("s-b", "owner-b", 0)).await.unwrap();
    assert!(store.has_sessions("owner-a").await.unwrap());
    assert!(!store.has_sessions("owner-c").await.unwrap());

    store.delete("s-a").await.unwrap();
    assert!(
        !store.has_sessions("owner-a").await.unwrap(),
        "세션을 다 지우면 없다"
    );
    assert!(store.has_sessions("owner-b").await.unwrap());
    db.close().await;
}

#[tokio::test]
async fn 지우면_네_테이블에서_그_세션만_사라진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let gone = closed_with_report("s-gone", "owner-a", 0);
    let kept = snapshot("s-kept", "owner-a", 10);
    store.save(&gone).await.unwrap();
    store.save(&kept).await.unwrap();

    store.delete("s-gone").await.unwrap();
    assert_eq!(db.rows_of("s-gone").await, (0, 0, 0, 0));
    assert_eq!(store.find("s-gone").await.unwrap(), None);
    assert_eq!(db.rows_of("s-kept").await, (1, 3, 2, 2));
    assert_eq!(store.find("s-kept").await.unwrap(), Some(kept.clone()));
    assert_eq!(
        store.find_by_owner("owner-a", 20).await.unwrap(),
        vec![kept]
    );
    // 없는 id 를 지워도 오류가 아니다.
    store.delete("s-gone").await.unwrap();
    db.close().await;
}

#[tokio::test]
async fn 계획과_요약과_전사_칸은_세션_행에_없다() {
    let db = SessionsSchema::open().await;
    let columns: Vec<(String,)> = sqlx::query_as(
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema = current_schema() AND table_name = 'sessions' ORDER BY column_name",
    )
    .fetch_all(&db.pool)
    .await
    .unwrap();
    let names: Vec<&str> = columns.iter().map(|(name,)| name.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "closed",
            "created_at",
            "deleted_at",
            "grief_profile",
            "id",
            "owner_id",
            "report",
            "report_deleted_at",
            "retry_count",
            "support_level",
            "task",
            "updated_at",
        ]
    );
    db.close().await;
}

/// 저장한 세션의 한 칸을 SQL 로 망가뜨리면 읽기가 오류를 낸다(기본값으로 넘기지 않는다).
async fn assert_corrupt_read(statement: &str) {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store
        .save(&closed_with_report("s-1", "owner-a", 0))
        .await
        .unwrap();
    // 여러 문장(제약을 풀고 값을 바꾸기)을 한 번에 보낸다.
    db.pool
        .execute(AssertSqlSafe(statement.to_owned()))
        .await
        .unwrap();

    let found = store.find("s-1").await;
    assert!(
        matches!(found, Err(StoreError::Database(_))),
        "{statement}: {found:?}"
    );
    assert!(store.find_by_owner("owner-a", 20).await.is_err());
    db.close().await;
}

#[tokio::test]
async fn 모르는_역할은_읽기_오류다() {
    assert_corrupt_read("UPDATE messages SET role = 'system' WHERE seq = 1").await;
}

#[tokio::test]
async fn 모르는_단계와_감지자는_읽기_오류다() {
    assert_corrupt_read("UPDATE turn_analyses SET phase = 'wander' WHERE seq = 0").await;
    assert_corrupt_read("UPDATE turn_analyses SET risk_detected_by = 'human' WHERE seq = 0").await;
}

#[tokio::test]
async fn 범위_밖의_과제와_수준은_읽기_오류다() {
    assert_corrupt_read("UPDATE sessions SET task = 6").await;
    assert_corrupt_read("UPDATE sessions SET support_level = 0").await;
    assert_corrupt_read("UPDATE messages SET task = -1 WHERE seq = 0").await;
    assert_corrupt_read("UPDATE turn_analyses SET to_task = 9 WHERE seq = 1").await;
    assert_corrupt_read("UPDATE turn_analyses SET retry_count = -1 WHERE seq = 1").await;
}

#[tokio::test]
async fn 모양이_틀린_문서는_읽기_오류다() {
    assert_corrupt_read("UPDATE sessions SET grief_profile = '{\"griefPath\": \"lost\"}'").await;
    assert_corrupt_read("UPDATE sessions SET report = '[]'").await;
    assert_corrupt_read(
        "UPDATE turn_analyses SET supervision = \
         '{\"evaluated\": true, \"quality\": \"great\", \"flags\": []}' WHERE seq = 0",
    )
    .await;
    assert_corrupt_read("UPDATE turn_analyses SET knowledge = '{}' WHERE seq = 0").await;
}

#[tokio::test]
async fn 모르는_턴_상태와_오류_종류는_읽기_오류다() {
    assert_corrupt_read(
        "ALTER TABLE turns DROP CONSTRAINT turns_status_check; \
         UPDATE turns SET status = 'lost' WHERE id = 's-1-turn-0'",
    )
    .await;
    assert_corrupt_read(
        "ALTER TABLE turns DROP CONSTRAINT turns_error_kind_check; \
         UPDATE turns SET error_kind = 'cosmic' WHERE id = 's-1-turn-2'",
    )
    .await;
}

#[tokio::test]
async fn 턴의_상태_전이는_다시_저장하면_덮인다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    // 받자마자 저장: 사용자 말과 pending 턴, 답은 아직 없다.
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up waiting", 2, 5),
        "s-1",
        2,
    ));
    snap.turns.push(pending_turn("s-1", 2, 5));
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap.clone()));

    // 답이 끝나면 done.
    snap.history.push(in_turn(
        message(MessageRole::Assistant, "made-up late reply", 2, 6),
        "s-1",
        2,
    ));
    snap.turns[2] = done_turn("s-1", 2, 5, 6);
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap.clone()));

    // 다음 턴은 실패로 끝난다.
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up next", 2, 7),
        "s-1",
        3,
    ));
    snap.turns.push(pending_turn("s-1", 3, 7));
    store.save(&snap).await.unwrap();
    snap.turns[3] = Turn {
        status: TurnStatus::Failed,
        finished_at: Some(minute(8)),
        error_kind: Some(TurnErrorKind::Timeout),
        ..pending_turn("s-1", 3, 7)
    };
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 6, 2, 4));
    db.close().await;
}

#[tokio::test]
async fn 기동_때_정리는_남은_pending_턴만_restart_실패로_닫는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut first = snapshot("s-a", "owner-a", 0);
    first.history.push(in_turn(
        message(MessageRole::User, "made-up cut off", 2, 5),
        "s-a",
        2,
    ));
    first.turns.push(pending_turn("s-a", 2, 5));
    let mut second = closed_with_report("s-b", "owner-b", 10);
    second.closed = false;
    second.report = None;
    second.turns.push(pending_turn("s-b", 3, 16));
    store.save(&first).await.unwrap();
    store.save(&second).await.unwrap();

    let restarted = minute(60);
    assert_eq!(store.fail_pending_turns(restarted).await.unwrap(), 2);

    let closed = |turn: &Turn| Turn {
        status: TurnStatus::Failed,
        finished_at: Some(restarted),
        error_kind: Some(TurnErrorKind::Restart),
        ..turn.clone()
    };
    first.turns[2] = closed(&first.turns[2]);
    second.turns[3] = closed(&second.turns[3]);
    assert_eq!(store.find("s-a").await.unwrap(), Some(first));
    assert_eq!(
        store.find("s-b").await.unwrap(),
        Some(second),
        "끝난 턴(done, failed)은 그대로다"
    );
    assert_eq!(
        store.fail_pending_turns(minute(61)).await.unwrap(),
        0,
        "남은 pending 이 없으면 바꾸지 않는다"
    );
    db.close().await;
}

#[tokio::test]
async fn 다른_세션이_쓴_턴_id_로는_쓰지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mine = snapshot("s-1", "owner-a", 0);
    store.save(&mine).await.unwrap();

    // 다른 세션(새 세션과 이미 있는 세션 둘 다)이 s-1 의 턴 id 를 보낸다.
    let mut theirs = snapshot("s-2", "owner-b", 30);
    theirs.history.push(in_turn(
        message(MessageRole::User, "made-up borrowed", 2, 35),
        "s-1",
        1,
    ));
    theirs.turns.push(Turn {
        id: turn_id("s-1", 1),
        ..pending_turn("s-2", 9, 35)
    });
    assert!(matches!(
        store.save(&theirs).await,
        Err(StoreError::TurnIdTaken)
    ));
    assert_eq!(
        store.find("s-2").await.unwrap(),
        None,
        "아무것도 쓰지 않는다"
    );
    assert_eq!(db.rows_of("s-2").await, (0, 0, 0, 0));

    let existing = snapshot("s-2", "owner-b", 30);
    store.save(&existing).await.unwrap();
    assert!(matches!(
        store.save(&theirs).await,
        Err(StoreError::TurnIdTaken)
    ));
    assert_eq!(store.find("s-2").await.unwrap(), Some(existing));
    assert_eq!(store.find("s-1").await.unwrap(), Some(mine));
    assert_eq!(db.rows_of("s-1").await, (1, 3, 2, 2));
    db.close().await;
}

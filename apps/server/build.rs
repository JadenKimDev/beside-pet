//! `sqlx::migrate!` 가 마이그레이션을 실행 파일에 넣으므로, 파일이 더해지거나 바뀌면 다시 빌드하게 한다.
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}

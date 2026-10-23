//! `claude -p` 자식 프로세스 한 번을 띄운다: 빈 작업 디렉터리, 생각 끄기, 중첩 세션 표지를 뺀 env, stdin 의 프롬프트.
//!
//! 자식은 부른 쪽이 버리면(라우터의 시간 제한 포함) 죽는다(`kill_on_drop`). stderr 는 본문이 섞일 수 있어 읽지 않는다.

use std::path::PathBuf;
use std::process::{ExitStatus, Stdio};

use tokio::io::AsyncWriteExt;
use tokio::process::{Child, ChildStdout, Command};

use crate::shared::Config;

/// 레포의 `CLAUDE.md` 와 메모리가 섞이지 않게 띄우는 빈 디렉터리의 이름(임시 디렉터리 아래).
const EMPTY_DIR: &str = "beside-pet-claude-code";

/// 한 번의 호출에 쓸 실행 파일, 인자, 프롬프트. 다시 시도와 스트림이 같은 것을 다시 띄운다.
pub(super) struct Invocation {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub prompt: String,
}

/// 자식에게 넘기지 않는 env 인가: 중첩 세션 표지와 그 토큰(ADR-0035 의 6).
pub(super) fn is_nested_session_marker(name: &str) -> bool {
    name == "CLAUDECODE" || name.starts_with("CLAUDE_CODE_")
}

impl Invocation {
    /// 띄우고 프롬프트를 stdin 에 쓴 뒤 닫는다. stdout 만 돌려받는다.
    pub(super) fn spawn(&self) -> Result<(Child, ChildStdout), &'static str> {
        let dir = std::env::temp_dir().join(EMPTY_DIR);
        std::fs::create_dir_all(&dir).map_err(|_| "cannot create working directory")?;
        let mut command = Command::new(&self.program);
        command
            .args(&self.args)
            .current_dir(dir)
            .env("MAX_THINKING_TOKENS", "0")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        for name in Config::inherited_env_names() {
            if is_nested_session_marker(&name) {
                command.env_remove(name);
            }
        }
        let mut child = command.spawn().map_err(|_| "cannot start claude")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        if let Some(mut stdin) = child.stdin.take() {
            let prompt = self.prompt.clone().into_bytes();
            // 자식이 stdin 을 다 읽기 전에 stdout 을 채워도 막히지 않게 따로 쓴다. 쓰기 실패는 종료 코드로 드러난다.
            tokio::spawn(async move {
                let _ = stdin.write_all(&prompt).await;
            });
        }
        Ok((child, stdout))
    }
}

/// 자식이 끝나기를 기다려 성공인지 본다.
pub(super) async fn finished(child: &mut Child) -> Result<(), &'static str> {
    let status: ExitStatus = child.wait().await.map_err(|_| "cannot wait for claude")?;
    if status.success() {
        Ok(())
    } else {
        Err("claude exited with failure")
    }
}

//! 가짜 `claude` 실행 파일: 부를 때마다 받은 인자, stdin, 작업 디렉터리, 생각 끄기 값, env 의 이름을 파일로 적고
//! 미리 정한 출력(json 또는 stream-json)과 종료 코드를 낸다. 실제 `claude` 는 부르지 않고 출력은 지어냈다.
//!
//! `sleep` 파일이 있으면 기록을 적은 뒤 답하지 않고 잠든다. n 번째 호출은 `out.<n>`(없으면 `out`)을 찍고 `code.<n>`(없으면 0)으로 끝난다. 다시 시도를 보려고 호출마다 다르게 둔다.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

const SCRIPT: &str = r#"#!/bin/sh
dir="$(dirname "$0")"
n=$(cat "$dir/count" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$dir/count"
for arg in "$@"; do printf '%s\0' "$arg"; done > "$dir/args.$n"
cat > "$dir/stdin.$n"
pwd -P > "$dir/cwd.$n"
printf '%s' "${MAX_THINKING_TOKENS-unset}" > "$dir/think.$n"
env | cut -d= -f1 > "$dir/env.$n"
echo "$$" > "$dir/pid.$n"
if [ -f "$dir/sleep" ]; then exec sleep "$(cat "$dir/sleep")"; fi
if [ -f "$dir/out.$n" ]; then cat "$dir/out.$n"; else cat "$dir/out"; fi
if [ -f "$dir/code.$n" ]; then exit "$(cat "$dir/code.$n")"; fi
exit 0
"#;

static NEXT: AtomicU32 = AtomicU32::new(0);

/// 테스트 하나의 가짜 실행 파일과 그 기록이 사는 디렉터리. 버리면 지운다.
pub(crate) struct FakeClaude {
    dir: PathBuf,
}

impl FakeClaude {
    /// 모든 호출에 `output` 을 찍고 0 으로 끝나는 가짜.
    pub(crate) fn answering(output: &str) -> FakeClaude {
        let unique = format!(
            "beside-pet-fake-claude-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let dir = std::env::temp_dir().join(unique);
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("claude");
        std::fs::write(&script, SCRIPT).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(dir.join("out"), output).unwrap();
        FakeClaude { dir }
    }

    /// `call` 번째(1부터) 호출만 `output` 을 찍고 `code` 로 끝나게 한다.
    pub(crate) fn on_call(self, call: u32, output: &str, code: i32) -> FakeClaude {
        std::fs::write(self.dir.join(format!("out.{call}")), output).unwrap();
        std::fs::write(self.dir.join(format!("code.{call}")), code.to_string()).unwrap();
        self
    }

    /// 모든 호출이 기록을 적은 뒤 `secs` 초 동안 답하지 않게 한다(같은 프로세스 id 로 잠든다).
    pub(crate) fn sleeping(self, secs: u32) -> FakeClaude {
        std::fs::write(self.dir.join("sleep"), secs.to_string()).unwrap();
        self
    }

    /// `call` 번째 호출의 프로세스 id.
    pub(crate) fn pid(&self, call: u32) -> String {
        self.read(&format!("pid.{call}")).trim().to_owned()
    }

    pub(crate) fn program(&self) -> PathBuf {
        self.dir.join("claude")
    }

    /// 불린 횟수.
    pub(crate) fn calls(&self) -> u32 {
        std::fs::read_to_string(self.dir.join("count"))
            .map(|text| text.trim().parse().unwrap())
            .unwrap_or(0)
    }

    /// `call` 번째(1부터) 호출이 받은 인자(`claude` 뒤의 것들). 빈 인자(`--tools ""`)도 하나로 센다.
    pub(crate) fn args(&self, call: u32) -> Vec<String> {
        let raw = self.read(&format!("args.{call}"));
        let mut args: Vec<String> = raw.split('\0').map(str::to_owned).collect();
        args.pop();
        args
    }

    pub(crate) fn stdin(&self, call: u32) -> String {
        self.read(&format!("stdin.{call}"))
    }

    pub(crate) fn cwd(&self, call: u32) -> String {
        self.read(&format!("cwd.{call}")).trim().to_owned()
    }

    pub(crate) fn thinking(&self, call: u32) -> String {
        self.read(&format!("think.{call}"))
    }

    /// 자식이 받은 env 의 이름들.
    pub(crate) fn env_names(&self, call: u32) -> Vec<String> {
        self.read(&format!("env.{call}"))
            .lines()
            .map(str::to_owned)
            .collect()
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.dir.join(name))
            .unwrap_or_else(|_| panic!("가짜 claude 의 {name} 이 없다"))
    }
}

impl Drop for FakeClaude {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

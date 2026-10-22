# 러너: 라벨로 PRD 를 구현시키기

이슈에 라벨 `run:implement`(또는 이어서 한 번 더: `run:again`)가 붙으면 GitHub Actions 가 **이 Mac 에 설치한 self-hosted 러너**(라벨 `beside-pet-mac`)에서 `implement.sh <이슈>` 를 돌린다. 러너는 워크트리에서 `claude -p '/implement-prd <이슈>'` 를 이 머신의 Claude Code 구독으로 돌리고, 결과를 이슈 댓글로 남긴 뒤 라벨 `review:ready` 를 붙인다. 막히면 `run:blocked` 와 이유 댓글로 멈춘다. 이슈를 닫는 것은 사람이다.

| 파일 | 하는 일 |
|---|---|
| `.github/workflows/implement.yml` | 라벨이 `run:implement` 또는 `run:again` 일 때만 `beside-pet-mac` 러너에서 `implement.sh` 를 부른다. `actions/checkout` 없이 본 체크아웃(`BESIDE_PET_REPO`)을 쓰고, 기본 `GITHUB_TOKEN` 의 권한은 비운다(`permissions: {}`). 한 번에 하나(`concurrency: implement`), 180분에 끊는다 |
| `implement.sh` | 러너가 부르는 실행 스크립트. 머리 주석에 순서와 환경 변수 |
| `com.beside-pet.runner.plist` | 로그인할 때 러너(`<레포>/.runner/run.sh`)를 띄우는 LaunchAgent 본 |

## 설치 (사용자가 한다)

러너를 계정에 등록하는 일은 클라우드 자원과 같은 취급이라 사용자가 한다. 등록 토큰과 GitHub 토큰은 사용자가 발급하고 보관한다. 에이전트는 토큰을 만들지도, 읽지도 않는다.

### 1. 러너 내려받기와 등록

1. GitHub 에서 `JadenKimDev/beside-pet` → **Settings → Actions → Runners → New self-hosted runner**.
2. 운영체제 **macOS**, 아키텍처 **ARM64** 를 고른다. 화면의 Download 명령을 레포 루트의 `.runner/` 에서 돌린다(gitignore 됨). 홈 디렉터리 등 레포 밖에 흩어 두지 않는다.

   ```bash
   mkdir -p <레포>/.runner && cd <레포>/.runner
   # 화면의 curl -o actions-runner-osx-arm64-<버전>.tar.gz ... 와 tar xzf ... 를 그대로 붙인다
   ```

3. 화면의 Configure 명령에 라벨과 이름을 붙여 돌린다. `--token` 값은 화면에 보이는 등록 토큰이다(한 시간 뒤 만료).

   ```bash
   ./config.sh --url https://github.com/JadenKimDev/beside-pet --token <화면의 등록 토큰> \
     --name beside-pet-mac --labels beside-pet-mac --work _work --unattended
   ```

   `./svc.sh install` 은 쓰지 않는다. 아래 LaunchAgent 하나로만 띄운다(둘을 쓰면 러너가 두 번 뜬다).

### 2. 러너 환경 변수

러너는 디렉터리의 `.env` 파일(`<레포>/.runner/.env`, `KEY=VALUE` 줄)을 작업의 환경 변수로 읽는다. `./config.sh` 가 이 파일에 `LANG` 줄을 먼저 만들어 두므로(2026-10-22 실측) 덮어쓰지(`cat >`) 않고 덧붙인다. 사용자가 직접 쓰고, 권한은 `chmod 600` 으로 둔다.

```bash
cat >> <레포>/.runner/.env <<'EOF'
GH_TOKEN=<JadenKimDev 의 클래식 토큰>
BESIDE_PET_REPO=/Users/taehokim/workspace/beside-pet
EOF
chmod 600 <레포>/.runner/.env
```

- `GH_TOKEN`: `JadenKimDev` 계정의 **클래식 토큰**(Settings → Developer settings → Personal access tokens → **Tokens (classic)**). scope 는 **`repo`**(이슈 댓글과 라벨, 본 체크아웃의 `git pull`)와 **`project`**(보드 이동) 둘이다. 세분화 토큰(`github_pat_` 형식)을 쓰지 않는 것은 그 토큰이 개인 계정이 소유한 Projects 에 닿지 못하기 때문이다(GitHub 문서 [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) 의 limitations 절, "access Projects owned by a user account" 미지원). 이 레포의 보드 2 는 `JadenKimDev` 개인 계정 소유다. `repo` 는 계정의 모든 레포에 미치는 넓은 권한이므로 토큰은 이 Mac 의 `.env`(600)에만 두고 다른 곳에 적지 않는다. 레포 기본 `GITHUB_TOKEN` 을 쓰지 않는 것은 댓글과 라벨의 작성자가 사람 계정이어야 보드 자동화가 같은 흐름을 타기 때문이다.
- `BESIDE_PET_REPO`: 본 체크아웃 경로. 러너가 받은 소스가 아니라 이 체크아웃에서 `implement.sh` 와 작업 대장 CLI 를 부른다.
- 고를 수 있는 것: `RUNNER_MAX_TURNS`(`claude -p` 의 `--max-turns`, 기본 400).
- `gh` 는 2.99 이상이어야 QA 스크린샷을 올린다(`brew upgrade gh`, 아래 "스크린샷").
- `PATH` 는 plist 가 준다: `~/.local/bin`(claude), fnm 의 기본 node(`~/.local/share/fnm/aliases/default/bin`, Node 24), `/opt/homebrew/bin`(pnpm, gh). 경로가 다르면 설치 전에 plist 를 고친다. 러너 세션은 셸 설정(`.zshrc`)을 읽지 않는다.
- Claude 인증: LaunchAgent 는 로그인한 사용자 세션에서 돌아 키체인의 구독 로그인을 그대로 쓴다. `claude -p` 가 인증 오류로 끝나면 사용자가 `claude setup-token` 으로 토큰을 만들어 `.env` 에 `CLAUDE_CODE_OAUTH_TOKEN=<토큰>` 으로 더한다.

### 3. LaunchAgent 설치와 해제

설치(로그인할 때 자동 시작, 죽으면 30초 뒤 다시 띄움):

```bash
sed "s|__HOME__|$HOME|g; s|__REPO__|$PWD|g" dev-tools/scripts/runner/com.beside-pet.runner.plist > ~/Library/LaunchAgents/com.beside-pet.runner.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.beside-pet.runner.plist
launchctl print gui/$(id -u)/com.beside-pet.runner | grep -E 'state|pid'
```

`.env` 나 plist 를 바꾼 뒤 다시 띄우기: `launchctl kickstart -k gui/$(id -u)/com.beside-pet.runner`

해제:

```bash
launchctl bootout gui/$(id -u)/com.beside-pet.runner
rm ~/Library/LaunchAgents/com.beside-pet.runner.plist
# 계정에서 러너를 지우려면: cd <레포>/.runner && ./config.sh remove --token <Settings 화면의 제거 토큰>
```

GitHub 의 Runners 화면에서 `beside-pet-mac` 이 **Idle** 이면 설치가 끝난 것이다.

## 동시 실행

한 번에 하나만 돈다. 워크플로의 `concurrency` 가 1차 울타리이고(이 Mac 의 CPU 와 구독 한도), `implement.sh` 는 이슈마다 잠금(`outputs/runner/<이슈>/.lock`)을 잡아 같은 이슈가 겹치면 "이미 진행 중" 댓글로 끝낸다. 사람이 pane 에서 같은 이슈를 하고 있으면(원장에 `doing` 작업) "누가 하고 있다" 댓글을 남기고 시작하지 않는다. 다른 이슈를 pane 에서 진행하는 것은 괜찮다. 같은 DB 와 `data/` 를 보므로 서버 포트가 겹치지 않는지만 본다.

## 판정

`implement.sh` 는 다음 가운데 하나라도 있으면 막힘(`run:blocked`)으로 본다. 아니면 `pnpm test` 를 워크트리에서 돌리고 `runner:report` 의 댓글과 함께 `review:ready` 를 붙인다.

- 시작 전: 원장 없음, `needs_spec` 이나 `parked` 작업, 본 체크아웃이 main 이 아니거나 `git pull --ff-only` 실패, 워크트리가 더러움.
- `claude -p` 의 종료 코드가 0 이 아님, 결과 JSON 의 `subtype` 이 `success` 가 아님(예: `error_max_turns`), `permission_denials`(분류기가 막은 명령)가 있음.
- 끝난 뒤 워크트리의 원장에 `done` 이 아닌 작업이 남음, QA 보고서에 `확인 불가`, `pnpm test` 실패, 보고 작성기 실패.
- 스크립트 안의 어떤 명령이든 예상하지 못하게 실패하면 그 행과 명령을 댓글로 남긴다.

러너는 `.env` 의 값과 DB 본문을 읽지 않고, production 에 닿는 명령(`pnpm deploy:prod` 등)을 부르지 않는다. 묻는 것이 필요한 일(검증 방법, 파괴적 변경의 승인)은 답할 사람이 없으므로 막힘으로 끝난다.

## 스크린샷

결과 댓글을 단 뒤 `implement.sh` 가 `outputs/qa/<이슈>/` 바로 아래의 이미지(png, jpg, gif, webp, 50장까지)를 `gh issue comment --attach` 로 댓글 하나에 올린다. GitHub 의 REST, GraphQL API 에는 이슈 댓글에 파일을 올리는 공개 엔드포인트가 없고, `gh` 2.99.0(2026-09-01)의 `--attach` 가 공식으로 이 일을 한다.

- 조건: `gh` 2.99 이상, 토큰의 사용자가 레포에 쓰기 권한(WRITE, MAINTAIN, ADMIN). 위의 클래식 토큰이면 `repo` scope 가 쓰기 권한을 포함한다.
- 올린 이미지는 공개 이슈에서 누구나 볼 수 있다. QA 계정의 지어낸 데이터만 찍히므로 괜찮지만, 실제 사용자의 화면이 찍힌 이미지는 그 폴더에 두지 않는다.
- 안 되는 경우(`gh` 가 낡았거나 올리기 실패)에는 판정을 바꾸지 않고 러너 로그에만 남긴다. 스크린샷은 이 Mac 의 `outputs/qa/<이슈>/` 에 그대로 있고, 결과 댓글의 QA 표는 레포 기준 상대 경로(`outputs/qa/<이슈>/<파일>`)만 적는다. 댓글의 다른 경로도 홈 디렉터리를 `~` 로 가려 이 Mac 의 사용자 이름을 공개 이슈에 싣지 않는다.
- 레포에 이미지를 커밋하는 길(브랜치, 릴리스 자산)은 쓰지 않는다.

## 로그

- 실행마다: `outputs/runner/<이슈>/<시각>.log`(`claude -p` 의 JSON 결과), `<시각>-runner.log`(스크립트의 출력, 워크플로 로그와 같음), `<시각>-test.log`(`pnpm test`), `<시각>-report.md`(올린 결과 댓글). `outputs/` 는 gitignore 이고 워크트리도 링크로 같이 쓴다.
- 러너 자체: `~/Library/Logs/beside-pet-runner.log`, `<레포>/.runner/_diag/`.

## 막혔을 때 사람이 이어 하기

1. 이슈의 막힘 댓글에서 이유와 워크트리 경로를 본다. 로그는 위 자리에 있다.
2. 이 Mac 에서 `pnpm wt:pane <이슈>` 로 같은 워크트리에 구현 pane 을 연다(herdr 가 없으면 `cd <워크트리> && HARNESS_IMPL=<이슈> claude '/implement-prd <이슈>'`). 막힌 물음에 답하거나 분류기가 막은 명령을 사람이 돌린다.
3. 사람이 끝까지 하면 그대로 마감한다. 러너가 `review:ready` 를 붙일 때는 `run:blocked` 도 뗀다. 러너에 다시 맡기려면 원장에 `doing` 작업이 없게 둔 채로(작업을 끝내거나 판정을 받아 둔다) 라벨 `run:again` 을 붙인다. `run:blocked` 는 사람이 뗀다.
4. 이슈를 닫은 뒤 워크트리를 치우는 것(`pnpm wt:remove <이슈>`)도 사람이 한다. 러너는 워크트리를 지우지 않는다.

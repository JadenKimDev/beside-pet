# 레포 루트의 `.env` 가 있으면 그 값을 환경 변수로 올린다. 다른 스크립트가 `.` 으로 읽는다.
# DB 를 띄우는 쪽(db.sh)과 서버를 띄우는 쪽(dev-bg.sh, dev.sh)이 같은 접속 정보를 보게 한다.
# 부르기 전에 레포 루트로 옮겨 와 있어야 한다.

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

---
id: ADR-0023
date: 2026-10-20
status: accepted
tags: [infra, aws, docker, deploy, environment, secrets, pulumi]
related: [ADR-0021, ADR-0018, ADR-0007]
---
# production 은 AWS 의 EC2 한 대와 CloudFront 이고, 비밀은 SSM 파라미터 하나, 배포는 Mac 빌드 → ECR → SSM, Pulumi 상태는 S3 다

## 맥락

ADR-0021 은 production 을 "지금은 이 머신의 Docker 에 띄우며 나중에 인스턴스로 옮긴다"고 적었다. 2026-10-16 에 AWS 자원을 모두 내린 뒤 클라우드에는 운영 자원이 없었고, `infra/` 의 Pulumi 코드는 내린 자원을 `external` 로 기록만 하는 것이라 아무것도 만들지 않았다.

2026-10-20 확인: AWS 계정(765899425598, ap-northeast-2, `old-admin` 프로필)에는 기본 VPC 만 있다. besidepet.com 은 상표 문제로 포기한 이름이라 쓰지 않고, 대신할 도메인은 아직 없다. 이 Mac 은 arm64 다. 제품은 Haiku 를 쓰는 SSE 스트리밍 서버(axum)와 Next.js 웹, PostgreSQL(pgvector) 셋이고 compose 한 파일에 담겨 있다(ADR-0021).

## 결정

- **production 은 AWS 의 EC2 한 대다.** 기본 VPC 의 공개 서브넷에 Amazon Linux 2023 arm64 `t4g.small` 하나, EIP 하나. 인스턴스 안은 이 머신에서 쓰던 것과 같은 compose(db, api, web)이고 `build:` 대신 ECR 이미지를 쓴다(`infra/docker/compose.host.yaml`). DB 는 같은 인스턴스의 컨테이너이고 데이터는 루트 EBS 의 볼륨에 있으며 DLM 정책이 매일 스냅샷을 7일 보관한다. `pnpm prod:up` 은 남겨 두되 뜻이 바뀐다: 같은 compose 를 이 머신에서 미리 돌려 보는 것이다.
- **앞에 CloudFront 를 둔다.** 주소는 CloudFront 기본 도메인(`*.cloudfront.net`, 출력 `cloudFrontDomain`)이고 커스텀 도메인과 ACM 인증서는 쓰지 않는다. besidepet.com 은 상표 문제로 쓰지 않는다. 원본은 같은 인스턴스의 8000(api)과 8001(web) 둘이고 동작은 `/v1/*` → api, `/_next/static/*` → web(캐시), 기본 → web 이다. api 와 기본 동작은 캐시를 끄고 쿠키·Host·질의를 그대로 넘긴다. 원본 읽기 제한은 60초라 SSE 조각 사이가 60초를 넘으면 끊기는데, 이것은 ADR-0018 의 유휴 제한 60초와 같은 선이다. 웹과 api 가 한 호스트라 SameSite 와 CORS 문제가 없고, 웹은 `NEXT_PUBLIC_API_BASE_URL` 빈 값(같은 출처)으로 빌드한다. 쿠키는 `APP_ENV=production` 의 기본인 Secure 다(ADR-0007, ADR-0021).
- **인스턴스에는 SSH 가 없다.** 보안 그룹은 CloudFront 의 origin-facing 관리형 prefix list 에서 오는 8000, 8001 만 허용한다. 쉘이 필요하면 SSM Session Manager 다. 인스턴스 역할은 SSM 관리, ECR 읽기, 파라미터 하나 읽기뿐이다.
- **비밀은 SSM Parameter Store 의 SecureString 한 개다.** `/beside-pet/production/server-env` 의 내용은 `apps/server/.env.production` 파일 그대로이고, 사용자가 Mac 에서 `put-parameter --value file://` 로 넣는다. 호스트의 배포 스크립트가 이것을 `/opt/beside-pet/.env.production`(0600)으로 내려 쓴다. Pulumi 설정, user-data, 배포 로그에는 비밀을 두지 않고, 에이전트는 값을 읽지 않는다(루트 `CLAUDE.md` "읽지 않는 것").
- **배포는 Mac 에서 빌드해 ECR 로 밀고 SSM Run Command 로 올린다.** `pnpm deploy:prod`(`infra/scripts/deploy.sh`)가 git sha 태그로 arm64 이미지 둘을 `docker buildx` 로 빌드해 ECR(`beside-pet-api`, `beside-pet-web`)에 올리고, 인스턴스에 `/opt/beside-pet/host-deploy.sh <태그>` 를 보내 `compose pull && up` 을 시킨 뒤 결과를 기다려 보여 준다. 작업 트리가 더러우면 멈춘다. CI 는 두지 않는다.
- **자원은 모두 `infra/` 의 Pulumi 코드로 만들고 상태는 같은 계정의 S3 버킷 `beside-pet-pulumi-state` 에 둔다.** 스택은 `production` 하나다. 버킷은 상태를 담을 곳이라 Pulumi 로 만들 수 없어 사용자가 손으로 한 번 만든다. 옛 `external`/`managed` 모드와 `dev`, `prod` 스택은 지운다. 클라우드에 자원을 만들거나 바꾸는 명령(`pulumi up`, `put-parameter`, 버킷 만들기)은 사용자가 돌린다. 이 제품의 AWS 프로필은 `old-admin` 이고 `default`, `memoriq` 는 다른 회사 계정이라 쓰지 않는다.

## 버린 것

| 안 | 이유 |
|---|---|
| RDS | 사용자 수에 비해 비용이 크고, DB 가 컨테이너에 있어도 EBS 스냅샷으로 충분하다. 필요해지면 그때 옮긴다 |
| 커스텀 도메인과 ACM 인증서 | 쓰려던 besidepet.com 은 상표 문제로 포기했고 대신할 도메인이 아직 없다. 도메인이 정해지면 ACM 인증서와 별칭을 더하는 후속으로 간다 |
| SSH 키 쌍과 22번 포트 | 열 필요가 없다. 쉘은 SSM Session Manager 로 든다 |
| 인스턴스에서 이미지를 빌드 | `t4g.small` 의 메모리로 Rust 와 Next 빌드가 버겁고, 소스를 인스턴스에 둘 이유가 없다 |
| ECS, App Runner 같은 관리형 컨테이너 | 세 서비스를 compose 한 파일로 이미 돌리고 있어 그대로 옮기는 것이 가장 짧다 |
| 비밀을 Pulumi 설정(암호화)에 둠 | 상태와 설정 파일이 레포와 S3 에 남는다. 파라미터 한 개가 더 단순하고 에이전트가 값에 닿지 않는다 |
| Pulumi Service 백엔드 | 지금 로그인은 임시 agent 계정이라 쓰지 않는다. 상태는 제품 계정의 S3 에 둔다 |
| CI 에서 빌드와 배포 | 운영자가 한 사람이고 Mac 이 arm64 라 바로 빌드하는 것이 빠르다. 다음에 필요해지면 같은 스크립트를 CI 가 돌리면 된다 |

## 결과

- `pnpm sandbox:reset` 은 아직 이 머신의 production 컨테이너를 읽는다. EC2 로 옮긴 뒤에는 원격 DB 를 읽어야 하므로(SSM 포트 전달) 후속 이슈로 남긴다. 이 머신의 production 데이터(QA 계정 등)를 옮기는 것도 같다.
- 루트 `CLAUDE.md` "지키는 선"의 "클라우드에는 운영 자원이 없다"와 "production 은 … 이 머신의 Docker" 는 이 결정으로 바뀐다.
- SSE 조각 사이가 60초를 넘는 모델(로컬 모델, ADR-0010)로 바꾸면 CloudFront 원본 읽기 제한을 함께 봐야 한다.
- CloudFront 전파는 수 분에서 수십 분이 걸린다. 사용자에게 주는 주소는 `cloudFrontDomain` 출력이다.

## 근거

- 이슈 #23 의 "설계", "배포 순서", "수용 기준".
- ADR-0021 "결정"(지금은 이 머신의 Docker, 나중에 인스턴스로), ADR-0018(유휴 제한 60초), ADR-0007(쿠키).
- 루트 `CLAUDE.md` "지키는 선", "읽지 않는 것".

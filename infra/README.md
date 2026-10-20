# Infrastructure

production 은 AWS 계정(ap-northeast-2, `old-admin` 프로필)의 EC2 한 대이고, 앞에 CloudFront 를 두어 `https://app.besidepet.com` 으로 연다. 인스턴스 안은 `infra/docker/compose.host.yaml` 의 compose(db, api, web)이다. `pnpm prod:up` 은 같은 compose 를 이 머신에서 미리 돌려 보는 것이다.

자원은 모두 이 Pulumi 프로젝트의 코드로 만든다. 스택은 `production` 하나이고 설정은 `Pulumi.production.yaml` 에 있다(`awsRegion`, `awsProfile`, `domain`, `instanceType`). 비밀은 Pulumi 설정에 두지 않는다. 서버 설정은 SSM Parameter Store 의 SecureString `/beside-pet/production/server-env` 하나다.

**클라우드에 자원을 만들거나 바꾸는 명령(`pulumi up`, `pulumi destroy`, `aws ssm put-parameter`, 버킷 만들기)은 사용자가 돌린다.** 에이전트는 코드와, 사용자가 로그인해 둔 뒤의 `pulumi preview` 까지만 한다. AWS 의 `default`, `memoriq` 프로필은 다른 회사 계정이라 쓰지 않는다(`config.ts` 가 거부한다).

## 상태 백엔드

상태는 같은 계정의 S3 버킷 `beside-pet-pulumi-state` 에 둔다. 상태를 담을 곳이라 Pulumi 로 만들 수 없어 사용자가 손으로 한 번 만든다(버전 관리 켬).

```bash
aws s3api create-bucket --profile old-admin --bucket beside-pet-pulumi-state \
  --region ap-northeast-2 --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-bucket-versioning --profile old-admin --bucket beside-pet-pulumi-state \
  --versioning-configuration Status=Enabled
pulumi login 's3://beside-pet-pulumi-state?region=ap-northeast-2&profile=old-admin'
cd infra && pulumi stack init production
```

## 처음 올리는 순서

1. 위의 버킷을 만들고 로그인한 뒤 `pulumi stack init production`.
2. `cd infra && pulumi up`. ECR 저장소 둘, 호스트, 인증서가 올라가고 인증서 검증 CNAME(`certificateValidationRecords`)과 CloudFront 도메인(`cloudFrontDomain`)이 출력된다. Squarespace DNS 에 검증 CNAME 과 `app` → CloudFront 도메인 CNAME 을 더한다. 인증서가 발급되면(수 분) `pulumi up` 이 끝난다.
3. 서버 설정을 파라미터로 넣는다.
   ```bash
   aws ssm put-parameter --profile old-admin --name /beside-pet/production/server-env \
     --type SecureString --value file://apps/server/.env.production
   ```
4. `pnpm deploy:prod`.

## 배포

```bash
pnpm deploy:prod
```

이 Mac 이 api 와 web 이미지를 arm64 로 빌드해 ECR 에 올리고(태그는 git sha), 인스턴스에 SSM 명령을 보내 새 이미지를 당겨 올린다. 인스턴스 id 와 레지스트리는 `pulumi stack output`(`instanceId`, `ecrRegistry`)에서 읽는다.

## 출력

| 이름 | 뜻 |
| --- | --- |
| `ecrRegistry` | `<account>.dkr.ecr.<region>.amazonaws.com` |
| `apiRepositoryUrl`, `webRepositoryUrl` | 두 저장소의 URL |
| `awsRegion`, `awsProfile`, `domain`, `instanceType`, `stack` | 스택 설정 |

호스트(`host.ts`)와 가장자리(`edge.ts`)가 `instanceId`, `publicDns`, `eip`, `cloudFrontDomain`, `certificateValidationRecords` 를 더한다.

## 내리는 법

ECR 저장소는 `protect: true` 라 먼저 보호를 푼다.

```bash
cd infra
pulumi state unprotect --all
pulumi destroy
```

ECR 저장소에 이미지가 남아 있으면 지우기가 실패하므로 이미지를 먼저 지운다. EBS 스냅샷(DLM)은 정책을 지워도 남으니 필요 없으면 따로 지운다.

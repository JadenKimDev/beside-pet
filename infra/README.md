# Infrastructure

production 은 AWS 계정(ap-northeast-2, `old-admin` 프로필)의 EC2 한 대이고, 앞에 CloudFront 를 둔다. 주소는 CloudFront 기본 도메인(`cloudFrontDomain` 출력, `https://<id>.cloudfront.net`)이고 커스텀 도메인은 쓰지 않는다. besidepet.com 은 상표 문제로 쓰지 않는다. 인스턴스 안은 `infra/docker/compose.host.yaml` 의 compose(db, api, web)이다. `pnpm prod:up` 은 같은 compose 를 이 머신에서 미리 돌려 보는 것이다.

자원은 모두 이 Pulumi 프로젝트의 코드로 만든다. 스택은 `production` 하나이고 설정은 `Pulumi.production.yaml` 에 있다(`awsRegion`, `awsProfile`, `instanceType`). 비밀은 Pulumi 설정에 두지 않는다. 서버 설정은 SSM Parameter Store 의 SecureString `/beside-pet/production/server-env` 하나다.

**클라우드에 자원을 만들거나 바꾸는 명령(`pulumi up`, `pulumi destroy`, `aws ssm put-parameter`, 버킷 만들기)은 사용자가 돌린다.** 에이전트는 코드와, 사용자가 로그인해 둔 뒤의 `pulumi preview` 까지만 한다. AWS 의 `default`, `memoriq` 프로필은 다른 회사 계정이라 쓰지 않는다(`config.ts` 가 거부한다).

## 상태 백엔드

상태는 같은 계정의 S3 버킷 `beside-pet-pulumi-state` 에 둔다. 상태를 담을 곳이라 Pulumi 로 만들 수 없어 사용자가 손으로 한 번 만든다(버전 관리 켬).

```bash
aws s3api create-bucket --profile old-admin --bucket beside-pet-pulumi-state \
  --region ap-northeast-2 --create-bucket-configuration LocationConstraint=ap-northeast-2
aws s3api put-bucket-versioning --profile old-admin --bucket beside-pet-pulumi-state \
  --versioning-configuration Status=Enabled
pulumi login 's3://beside-pet-pulumi-state?region=ap-northeast-2&profile=old-admin'
cd infra && PULUMI_CONFIG_PASSPHRASE="" pulumi stack init production
```

S3 백엔드는 스택 설정의 비밀을 잠글 암호(`PULUMI_CONFIG_PASSPHRASE`)를 요구한다. 이 스택은 설정에 비밀을 두지 않으므로(비밀은 SSM 파라미터 `/beside-pet/production/server-env` 에만 있다) **빈 암호로 간다.** 모든 `pulumi` 명령(`stack init`, `preview`, `up`, `stack output`, `destroy`) 앞에 `PULUMI_CONFIG_PASSPHRASE=""` 를 붙인다. `stack init` 이 `Pulumi.production.yaml` 에 적는 `encryptionsalt` 는 비밀이 아니라 커밋한다. `pnpm deploy:prod` 는 이 변수가 비어 있으면 스스로 빈 문자열로 둔다.

## 처음 올리는 순서

1. 위의 버킷을 만들고 로그인한 뒤 `PULUMI_CONFIG_PASSPHRASE="" pulumi stack init production`. 생긴 `encryptionsalt` 줄은 커밋한다.
2. `cd infra && PULUMI_CONFIG_PASSPHRASE="" pulumi up`. ECR 저장소 둘, 호스트, CloudFront 배포가 올라가고 주소(`cloudFrontDomain`)가 출력된다. DNS 작업은 없다. CloudFront 전파에 수 분이 걸린다.
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

## 호스트의 두 파일 갱신

user-data 는 인스턴스의 첫 부팅에만 돈다. `/opt/beside-pet/` 의 `compose.host.yaml` 과 `host-deploy.sh` 는 그때 레포의 `infra/docker/` 에서 놓인다. DB 데이터가 루트 EBS 에 있어 인스턴스를 교체하면 데이터가 사라지므로, `host.ts` 는 user-data 와 AMI 의 변경을 무시하고(`ignoreChanges`) 인스턴스를 `protect` 로 둔다. 그래서 두 파일을 바꿔도 `pulumi up` 은 인스턴스에 손대지 않는다. 바꾼 파일은 SSM Run Command(`AWS-RunShellScript`)나 Session Manager 로 `/opt/beside-pet/` 에 다시 놓는다(스크립트는 0755).

## 출력

| 이름 | 뜻 |
| --- | --- |
| `ecrRegistry` | `<account>.dkr.ecr.<region>.amazonaws.com` |
| `apiRepositoryUrl`, `webRepositoryUrl` | 두 저장소의 URL |
| `awsRegion`, `awsProfile`, `instanceType`, `stack` | 스택 설정 |

호스트(`host.ts`)와 가장자리(`edge.ts`)가 `instanceId`, `publicDns`, `eip`, `cloudFrontDomain`(production 의 주소) 을 더한다.

## 내리는 법

ECR 저장소는 `protect: true` 라 먼저 보호를 푼다.

```bash
cd infra
export PULUMI_CONFIG_PASSPHRASE=""
pulumi state unprotect --all
pulumi destroy
```

ECR 저장소에 이미지가 남아 있으면 지우기가 실패하므로 이미지를 먼저 지운다. EBS 스냅샷(DLM)은 정책을 지워도 남으니 필요 없으면 따로 지운다.

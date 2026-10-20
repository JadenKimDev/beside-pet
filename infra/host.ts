import * as fs from "node:fs";
import * as path from "node:path";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { awsRegion, instanceType, provider } from "./config";
import { apiRepository, webRepository } from "./ecr";

// production 호스트: 기본 VPC 의 EC2 한 대. 안은 /opt/beside-pet/compose.host.yaml 의 compose 다.
// DB 데이터가 루트 EBS 에 있으므로 인스턴스를 교체하면 데이터가 사라진다. 그래서
// AMI 와 user-data 의 변경은 무시하고(ignoreChanges) 인스턴스를 protect 로 둔다.

const name = "beside-pet-production";
const tags = { Name: name };
const backupTag = { Backup: name };
const opts = { provider };

const SERVER_ENV_PARAM = "/beside-pet/production/server-env";
const COMPOSE_VERSION = "v2.29.7";
const COMPOSE_SHA256 = "6e9fbd5daa20dca5d7d89145081ae8155d68ef2928b497d9f85b54fe0f9dbb2c";

// --- 네트워크: 기본 VPC 의 <리전>a 공개 서브넷.
const vpc = aws.ec2.getVpcOutput({ default: true }, opts);
const subnet = aws.ec2.getSubnetOutput(
  {
    filters: [
      { name: "vpc-id", values: [vpc.id] },
      { name: "default-for-az", values: ["true"] },
      { name: "availability-zone", values: [`${awsRegion}a`] },
    ],
  },
  opts,
);

const ami = aws.ssm.getParameterOutput(
  { name: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64" },
  opts,
);
const caller = aws.getCallerIdentityOutput({}, opts);
const cloudFrontPrefixList = aws.ec2.getManagedPrefixListOutput(
  { name: "com.amazonaws.global.cloudfront.origin-facing" },
  opts,
);

// --- 보안 그룹: CloudFront origin-facing 에서 오는 8000(api), 8001(web)만. SSH 없음.
// prefix list 는 규칙마다 최대 항목 수만큼 규칙 한도를 먹으므로 포트 범위 하나의 규칙으로 둔다.
const securityGroup = new aws.ec2.SecurityGroup(
  name,
  {
    name,
    description: "Beside Pet production: CloudFront origin-facing only",
    vpcId: vpc.id,
    ingress: [
      {
        description: "CloudFront to api 8000 and web 8001",
        protocol: "tcp",
        fromPort: 8000,
        toPort: 8001,
        prefixListIds: [cloudFrontPrefixList.id],
      },
    ],
    egress: [{ description: "all outbound", protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] }],
    tags,
  },
  opts,
);

// --- 인스턴스 역할: SSM 관리, ECR 읽기, 서버 설정 파라미터 하나 읽기.
// 파라미터는 기본 키(aws/ssm)로 암호화하므로 kms:Decrypt 를 따로 주지 않는다.
const role = new aws.iam.Role(
  name,
  {
    name,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ec2.amazonaws.com" }),
    tags,
  },
  opts,
);
new aws.iam.RolePolicyAttachment(
  `${name}-ssm-core`,
  { role: role.name, policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore" },
  opts,
);
new aws.iam.RolePolicy(
  `${name}-deploy`,
  {
    role: role.id,
    policy: pulumi.jsonStringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: ["ecr:GetAuthorizationToken"], Resource: "*" },
        {
          Effect: "Allow",
          Action: ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
          Resource: [apiRepository.arn, webRepository.arn],
        },
        {
          Effect: "Allow",
          Action: ["ssm:GetParameter"],
          Resource: pulumi.interpolate`arn:aws:ssm:${awsRegion}:${caller.accountId}:parameter${SERVER_ENV_PARAM}`,
        },
      ],
    }),
  },
  opts,
);
const instanceProfile = new aws.iam.InstanceProfile(name, { name, role: role.name, tags }, opts);

// --- user-data: 첫 부팅에만 돈다. 비밀은 넣지 않는다(서버 설정은 host-deploy.sh 가 파라미터에서 받는다).
function readRepoFile(relative: string): string {
  const content = fs.readFileSync(path.join(__dirname, relative), "utf8");
  if (content.includes("BESIDE_PET_EOF")) {
    throw new Error(`${relative} contains the heredoc delimiter`);
  }
  return content.endsWith("\n") ? content : `${content}\n`;
}

const userData = `#!/bin/bash
set -euo pipefail

dnf install -y docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \\
  https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-aarch64
echo "${COMPOSE_SHA256}  /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -
chmod 0755 /usr/local/lib/docker/cli-plugins/docker-compose
systemctl enable --now docker

mkdir -p /opt/beside-pet
cat > /opt/beside-pet/compose.host.yaml <<'BESIDE_PET_EOF'
${readRepoFile("docker/compose.host.yaml")}BESIDE_PET_EOF
cat > /opt/beside-pet/host-deploy.sh <<'BESIDE_PET_EOF'
${readRepoFile("docker/scripts/host-deploy.sh")}BESIDE_PET_EOF
chmod 0644 /opt/beside-pet/compose.host.yaml
chmod 0755 /opt/beside-pet/host-deploy.sh
`;

// --- 인스턴스.
const instance = new aws.ec2.Instance(
  name,
  {
    ami: ami.value,
    instanceType,
    subnetId: subnet.id,
    vpcSecurityGroupIds: [securityGroup.id],
    iamInstanceProfile: instanceProfile.name,
    associatePublicIpAddress: true,
    metadataOptions: { httpTokens: "required", httpEndpoint: "enabled", httpPutResponseHopLimit: 2 },
    rootBlockDevice: {
      volumeType: "gp3",
      volumeSize: 20,
      encrypted: true,
      deleteOnTermination: true,
      tags: { ...tags, ...backupTag },
    },
    userData,
    userDataReplaceOnChange: false,
    tags,
  },
  { ...opts, protect: true, ignoreChanges: ["ami", "userData"] },
);

const elasticIp = new aws.ec2.Eip(name, { domain: "vpc", instance: instance.id, tags }, opts);

// --- DLM: Backup 태그의 볼륨을 매일 스냅샷해 7개 보관.
const dlmRole = new aws.iam.Role(
  `${name}-dlm`,
  {
    name: `${name}-dlm`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "dlm.amazonaws.com" }),
    tags,
  },
  opts,
);
new aws.iam.RolePolicyAttachment(
  `${name}-dlm`,
  { role: dlmRole.name, policyArn: "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole" },
  opts,
);
new aws.dlm.LifecyclePolicy(
  name,
  {
    description: "Beside Pet production root volume daily snapshots",
    executionRoleArn: dlmRole.arn,
    state: "ENABLED",
    policyDetails: {
      policyType: "EBS_SNAPSHOT_MANAGEMENT",
      resourceTypes: ["VOLUME"],
      targetTags: backupTag,
      schedules: [
        {
          name: "daily-7",
          createRule: { interval: 24, intervalUnit: "HOURS", times: "18:00" },
          retainRule: { count: 7 },
          copyTags: true,
        },
      ],
    },
    tags,
  },
  opts,
);

export const instanceId = instance.id;
/** EIP 의 공개 DNS 이름. CloudFront 원본(edge.ts)이 쓴다. 인스턴스의 publicDns 는 EIP 를 따르지 않을 수 있다. */
export const publicDns = elasticIp.publicDns;
export const eip = elasticIp.publicIp;

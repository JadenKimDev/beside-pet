import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

// 비밀은 여기 두지 않는다. 서버 설정은 SSM 파라미터 /beside-pet/production/server-env 에 있다.
export const stack = pulumi.getStack();
export const awsRegion = config.get("awsRegion") ?? "ap-northeast-2";
export const awsProfile = config.get("awsProfile") ?? "old-admin";
export const domain = config.get("domain") ?? "app.besidepet.com";
export const instanceType = config.get("instanceType") ?? "t4g.small";

// 다른 회사 계정의 프로필로 자원을 만들지 않는다(루트 CLAUDE.md "지키는 선").
const forbiddenProfiles = new Set(["default", "memoriq"]);
if (forbiddenProfiles.has(awsProfile)) {
  throw new Error(`awsProfile ${awsProfile} is not allowed for this project`);
}

/** 서울 리전 공급자. 호스트, ECR 등 대부분의 자원이 쓴다. */
export const provider = new aws.Provider("aws", {
  region: awsRegion as aws.Region,
  profile: awsProfile,
});

/** CloudFront 용 ACM 인증서는 us-east-1 에만 둘 수 있다. */
export const usEast1Provider = new aws.Provider("aws-us-east-1", {
  region: "us-east-1",
  profile: awsProfile,
});

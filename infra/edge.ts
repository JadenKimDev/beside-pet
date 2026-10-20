import * as aws from "@pulumi/aws";
import { domain, provider, usEast1Provider } from "./config";
import { publicDns } from "./host";

// production 가장자리: app.besidepet.com 의 CloudFront 배포 하나와 그 인증서.
// DNS 는 Squarespace 에 있어 Route53 을 쓰지 않는다. 검증 CNAME 과 app CNAME 은 사용자가 손으로 더한다.
// 웹과 api 를 한 호스트에 두어 쿠키의 SameSite 와 CORS 문제가 없게 한다.

const name = "beside-pet-production";
const tags = { Name: name };

// --- 인증서: CloudFront 는 us-east-1 의 ACM 인증서만 쓴다.
const certificate = new aws.acm.Certificate(
  name,
  { domainName: domain, validationMethod: "DNS", tags },
  { provider: usEast1Provider },
);

/** 사용자가 Squarespace DNS 에 더하는 검증 레코드. */
export const certificateValidationRecords = certificate.domainValidationOptions.apply((options) =>
  options.map((o) => ({ name: o.resourceRecordName, type: o.resourceRecordType, value: o.resourceRecordValue })),
);

// 사용자가 DNS 에 검증 레코드를 더하고 발급될 때까지 pulumi up 이 기다린다.
const validation = new aws.acm.CertificateValidation(
  name,
  {
    certificateArn: certificate.arn,
    validationRecordFqdns: certificate.domainValidationOptions.apply((options) =>
      options.map((o) => o.resourceRecordName),
    ),
  },
  { provider: usEast1Provider, customTimeouts: { create: "45m" } },
);

// --- 관리형 정책: 이름으로 찾는다.
function policyId(result: { id?: string }, policyName: string): string {
  if (!result.id) throw new Error(`CloudFront managed policy ${policyName} not found`);
  return result.id;
}
const cachingDisabled = aws.cloudfront
  .getCachePolicyOutput({ name: "Managed-CachingDisabled" }, { provider })
  .apply((p) => policyId(p, "Managed-CachingDisabled"));
const cachingOptimized = aws.cloudfront
  .getCachePolicyOutput({ name: "Managed-CachingOptimized" }, { provider })
  .apply((p) => policyId(p, "Managed-CachingOptimized"));
// 쿠키, Host, 질의를 원본에 그대로 넘긴다.
const allViewer = aws.cloudfront
  .getOriginRequestPolicyOutput({ name: "Managed-AllViewer" }, { provider })
  .apply((p) => policyId(p, "Managed-AllViewer"));

// --- 원본: 같은 인스턴스의 api(8000)와 web(8001). 보안 그룹이 CloudFront 에서 오는 것만 받는다.
// 원본 읽기 제한 60초: SSE 조각 사이가 60초를 넘으면 끊긴다(ADR-0018 의 유휴 제한과 같은 선).
function origin(originId: string, httpPort: number) {
  return {
    originId,
    domainName: publicDns,
    customOriginConfig: {
      httpPort,
      httpsPort: 443,
      originProtocolPolicy: "http-only",
      originReadTimeout: 60,
      originKeepaliveTimeout: 60,
      originSslProtocols: ["TLSv1.2"],
    },
  };
}

const allMethods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"];
const readMethods = ["GET", "HEAD"];

const distribution = new aws.cloudfront.Distribution(
  name,
  {
    comment: name,
    aliases: [domain],
    enabled: true,
    isIpv6Enabled: true,
    httpVersion: "http2and3",
    priceClass: "PriceClass_200",
    origins: [origin("api", 8000), origin("web", 8001)],
    orderedCacheBehaviors: [
      {
        // api 의 SSE 를 압축하면 조각이 모여서 나갈 수 있어 compress 를 끈다.
        pathPattern: "/v1/*",
        targetOriginId: "api",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: allMethods,
        cachedMethods: readMethods,
        cachePolicyId: cachingDisabled,
        originRequestPolicyId: allViewer,
        compress: false,
      },
      {
        pathPattern: "/_next/static/*",
        targetOriginId: "web",
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: readMethods,
        cachedMethods: readMethods,
        cachePolicyId: cachingOptimized,
        compress: true,
      },
    ],
    defaultCacheBehavior: {
      targetOriginId: "web",
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: allMethods,
      cachedMethods: readMethods,
      cachePolicyId: cachingDisabled,
      originRequestPolicyId: allViewer,
      compress: true,
    },
    viewerCertificate: {
      acmCertificateArn: validation.certificateArn,
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },
    restrictions: { geoRestriction: { restrictionType: "none" } },
    tags,
  },
  { provider },
);

/** 사용자가 Squarespace DNS 에 app CNAME 으로 넣는 값. */
export const cloudFrontDomain = distribution.domainName;

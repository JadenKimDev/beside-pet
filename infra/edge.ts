import * as aws from "@pulumi/aws";
import { provider } from "./config";
import { publicDns } from "./host";

// production 가장자리: CloudFront 배포 하나. 주소는 CloudFront 기본 도메인(*.cloudfront.net, 출력 cloudFrontDomain)이고
// 커스텀 도메인과 인증서는 쓰지 않는다(besidepet.com 은 상표 문제로 쓰지 않는다. ADR-0023).
// 웹과 api 를 한 호스트에 두어 쿠키의 SameSite 와 CORS 문제가 없게 한다.

const name = "beside-pet-production";
const tags = { Name: name };

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
    // 기본 인증서(*.cloudfront.net). 커스텀 도메인이 없으니 따로 인증서를 두지 않는다.
    viewerCertificate: { cloudfrontDefaultCertificate: true },
    restrictions: { geoRestriction: { restrictionType: "none" } },
    tags,
  },
  { provider },
);

/** production 의 주소(CloudFront 기본 도메인). 사용자는 이 주소로 연다. */
export const cloudFrontDomain = distribution.domainName;

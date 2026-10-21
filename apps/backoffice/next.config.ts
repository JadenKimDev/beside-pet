import type { NextConfig } from 'next';

// 브라우저는 늘 같은 출처의 /v1/... 을 부르고, Next 서버가 그것을 API_BASE_URL 의 /v1/... 로 넘긴다.
// 인증 쿠키가 SameSite=Lax 라 브라우저가 다른 사이트의 API 를 직접 부르면 쿠키가 실리지 않기 때문이다.
// API_BASE_URL 은 서버 쪽 값이라 브라우저 번들에 들어가지 않는다(NEXT_PUBLIC_ 이 아니다).
// rewrites 는 `next dev` 와 `next build` 때 읽혀 routes-manifest 에 굳는다. 빌드한 이미지의 API 를 바꾸려면
// 다시 빌드한다(Dockerfile 의 빌드 인자).

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

type Rewrite = { source: string; destination: string };

export function apiRewrites(apiBaseUrl: string | undefined): Rewrite[] {
  const raw = apiBaseUrl?.trim() || DEFAULT_API_BASE_URL;
  if (!/^https?:\/\/[^/]/.test(raw)) {
    throw new Error(`API_BASE_URL must be an http(s) URL such as ${DEFAULT_API_BASE_URL}`);
  }
  const base = raw.replace(/\/+$/, '');
  return [{ source: '/v1/:path*', destination: `${base}/v1/:path*` }];
}

export function buildNextConfig(env: { API_BASE_URL?: string }): NextConfig {
  const rewrites = apiRewrites(env.API_BASE_URL);
  return {
    // Self-contained server build (.next/standalone) for the Docker image.
    output: 'standalone',
    rewrites: async () => rewrites,
  };
}

export default buildNextConfig({ API_BASE_URL: process.env.API_BASE_URL });

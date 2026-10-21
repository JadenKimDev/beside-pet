import { describe, expect, it } from 'vitest';
import { apiRewrites, buildNextConfig, DEFAULT_API_BASE_URL } from './next.config';

describe('apiRewrites', () => {
  it('sends same-origin /v1/* to API_BASE_URL/v1/*', () => {
    expect(apiRewrites('http://127.0.0.1:8000')).toEqual([
      { source: '/v1/:path*', destination: 'http://127.0.0.1:8000/v1/:path*' },
    ]);
  });

  it('defaults to the sandbox server when API_BASE_URL is missing or blank', () => {
    expect(DEFAULT_API_BASE_URL).toBe('http://127.0.0.1:3000');
    expect(apiRewrites(undefined)[0].destination).toBe('http://127.0.0.1:3000/v1/:path*');
    expect(apiRewrites('  ')[0].destination).toBe('http://127.0.0.1:3000/v1/:path*');
  });

  it('drops trailing slashes so the destination has a single slash', () => {
    expect(apiRewrites('https://d123.cloudfront.net//')[0].destination).toBe(
      'https://d123.cloudfront.net/v1/:path*',
    );
  });

  it('rejects a value that is not an http(s) URL', () => {
    expect(() => apiRewrites('127.0.0.1:3000')).toThrow(/API_BASE_URL/);
  });
});

describe('buildNextConfig', () => {
  it('builds standalone output and rewrites from the given environment', async () => {
    const config = buildNextConfig({ API_BASE_URL: 'http://127.0.0.1:8000' });

    expect(config.output).toBe('standalone');
    expect(await config.rewrites?.()).toEqual([
      { source: '/v1/:path*', destination: 'http://127.0.0.1:8000/v1/:path*' },
    ]);
  });
});

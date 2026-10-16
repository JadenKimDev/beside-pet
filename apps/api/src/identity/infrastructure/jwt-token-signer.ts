/**
 * jwt-token-signer.ts — TokenSigner implementation (@nestjs/jwt). External boundary: verification
 * failures / malformed input are caught and narrowed to undefined to stop propagation (absence-is-undefined rule).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TokenClaims } from '@/identity/domain/port/token-claims';
import type { TokenSigner } from '@/identity/domain/port/token-signer.port';

const DEFAULT_TTL = '7d';

const isClaims = (value: object): value is TokenClaims =>
  'sub' in value &&
  typeof value.sub === 'string' &&
  'role' in value &&
  typeof value.role === 'string';

@Injectable()
export class JwtTokenSigner implements TokenSigner {
  private readonly secret: string;
  private readonly ttl: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.get<string>('JWT_SECRET') ?? 'dev-insecure-secret-change-me';
    this.ttl = config.get<string>('JWT_TTL') ?? DEFAULT_TTL;
  }

  sign(claims: TokenClaims): string {
    return this.jwt.sign(
      { sub: claims.sub, role: claims.role },
      { secret: this.secret, expiresIn: this.ttl },
    );
  }

  verify(token: string): TokenClaims | undefined {
    try {
      const decoded = this.jwt.verify<object>(token, { secret: this.secret });
      return isClaims(decoded) ? { sub: decoded.sub, role: decoded.role } : undefined;
    } catch {
      return undefined;
    }
  }
}

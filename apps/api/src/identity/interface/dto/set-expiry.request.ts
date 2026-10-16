/**
 * set-expiry.request.ts — PATCH /v1/admin/accounts/:id/expiry request body (admin only).
 * Omitting expiresAt clears the account's expiry.
 */
import { IsISO8601, IsOptional } from 'class-validator';

export class SetExpiryRequest {
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

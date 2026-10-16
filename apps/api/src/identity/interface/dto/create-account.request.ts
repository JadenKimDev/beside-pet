/**
 * create-account.request.ts — POST /v1/admin/accounts request body (admin only).
 */
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '@/identity/domain/model/role';

export class CreateAccountRequest {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsOptional()
  @IsIn(['admin', 'viewer'])
  role?: Role;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

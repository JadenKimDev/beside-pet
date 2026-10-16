/**
 * setup.request.ts — POST /v1/auth/setup request body (first-run only).
 */
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class SetupRequest {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  company?: string;
}

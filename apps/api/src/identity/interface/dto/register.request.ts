/**
 * register.request.ts — POST /v1/auth/register request body (public application).
 */
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterRequest {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  company!: string;
}

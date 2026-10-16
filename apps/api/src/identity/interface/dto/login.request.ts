/**
 * login.request.ts — POST /v1/auth/login request body. The login id is a free-form username, not an email.
 */
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginRequest {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

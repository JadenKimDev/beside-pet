/**
 * admin.controller.ts — issue, list, and manage accounts (admin only).
 *  POST   /v1/admin/accounts                  issue an account (username, password, company, role?, expiresAt?)
 *  GET    /v1/admin/accounts                  list accounts (all, incl. deleted)
 *  POST   /v1/admin/accounts/:id/approve      approve a pending application (→ active)
 *  POST   /v1/admin/accounts/:id/revoke       revoke an account (→ revoked; data preserved)
 *  POST   /v1/admin/accounts/:id/soft-delete  soft-delete an account (→ deleted; data preserved)
 *  POST   /v1/admin/accounts/:id/reactivate   reactivate an account (→ active)
 *  PATCH  /v1/admin/accounts/:id/expiry       set/extend/clear the account expiry
 *  DELETE /v1/admin/accounts/:id              delete an account (hard — fully removed)
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApproveAccountUseCase } from '../application/approve-account.usecase';
import { CreateAccountUseCase } from '../application/create-account.usecase';
import { DeleteAccountUseCase } from '../application/delete-account.usecase';
import { ListAccountsQuery } from '../application/list-accounts.query';
import { ReactivateAccountUseCase } from '../application/reactivate-account.usecase';
import { RevokeAccountUseCase } from '../application/revoke-account.usecase';
import { SetExpiryUseCase } from '../application/set-expiry.usecase';
import { SoftDeleteAccountUseCase } from '../application/soft-delete-account.usecase';
import { JwtAuthGuard } from '../guard/jwt-auth.guard';
import { Roles } from '../guard/roles.decorator';
import { RolesGuard } from '../guard/roles.guard';
import { AccountResponse } from './dto/account.response';
import { CreateAccountRequest } from './dto/create-account.request';
import { SetExpiryRequest } from './dto/set-expiry.request';

@ApiTags('admin')
@ApiCookieAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly approveAccount: ApproveAccountUseCase,
    private readonly listAccounts: ListAccountsQuery,
    private readonly revokeAccount: RevokeAccountUseCase,
    private readonly softDeleteAccount: SoftDeleteAccountUseCase,
    private readonly reactivateAccount: ReactivateAccountUseCase,
    private readonly setExpiry: SetExpiryUseCase,
    private readonly deleteAccount: DeleteAccountUseCase,
  ) {}

  @Post('accounts')
  @HttpCode(201)
  create(@Body() body: CreateAccountRequest): Promise<AccountResponse> {
    return this.createAccount.execute({
      username: body.username,
      password: body.password,
      company: body.company,
      role: body.role,
      expiresAt: body.expiresAt,
    });
  }

  @Get('accounts')
  list(): Promise<AccountResponse[]> {
    return this.listAccounts.execute();
  }

  @Post('accounts/:id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string): Promise<AccountResponse> {
    return this.approveAccount.execute(id);
  }

  @Post('accounts/:id/revoke')
  @HttpCode(200)
  revoke(@Param('id') id: string): Promise<AccountResponse> {
    return this.revokeAccount.execute(id);
  }

  @Post('accounts/:id/soft-delete')
  @HttpCode(200)
  softDelete(@Param('id') id: string): Promise<AccountResponse> {
    return this.softDeleteAccount.execute(id);
  }

  @Post('accounts/:id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id') id: string): Promise<AccountResponse> {
    return this.reactivateAccount.execute(id);
  }

  @Patch('accounts/:id/expiry')
  @HttpCode(200)
  expiry(@Param('id') id: string, @Body() body: SetExpiryRequest): Promise<AccountResponse> {
    return this.setExpiry.execute(id, body.expiresAt);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.deleteAccount.execute(id);
  }
}

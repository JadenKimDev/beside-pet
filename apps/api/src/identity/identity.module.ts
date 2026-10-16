/**
 * identity.module.ts — wires up the auth/account bounded context.
 * port → adapter bindings (in-memory, bcrypt, JWT), use cases, guards. Guards are exported so the support module can use them too.
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApproveAccountUseCase } from './application/approve-account.usecase';
import { CreateAccountUseCase } from './application/create-account.usecase';
import { DeleteAccountUseCase } from './application/delete-account.usecase';
import { ListAccountsQuery } from './application/list-accounts.query';
import { LoginUseCase } from './application/login.usecase';
import { MyProfileQuery } from './application/my-profile.query';
import { ReactivateAccountUseCase } from './application/reactivate-account.usecase';
import { RegisterAccountUseCase } from './application/register-account.usecase';
import { RevokeAccountUseCase } from './application/revoke-account.usecase';
import { SetExpiryUseCase } from './application/set-expiry.usecase';
import { SetupAdminUseCase } from './application/setup-admin.usecase';
import { SoftDeleteAccountUseCase } from './application/soft-delete-account.usecase';
import { UpdateChatLanguageUseCase } from './application/update-chat-language.usecase';
import { PASSWORD_HASHER, SETUP_TOKEN_GATE, TOKEN_SIGNER } from './domain/port/tokens';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { RolesGuard } from './guard/roles.guard';
import { AdminSetup } from './infrastructure/admin-setup';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { JwtTokenSigner } from './infrastructure/jwt-token-signer';
import { AdminController } from './interface/admin.controller';
import { AuthController } from './interface/auth.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, AdminController],
  providers: [
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SIGNER, useClass: JwtTokenSigner },
    CreateAccountUseCase,
    ApproveAccountUseCase,
    RegisterAccountUseCase,
    LoginUseCase,
    RevokeAccountUseCase,
    SoftDeleteAccountUseCase,
    ReactivateAccountUseCase,
    SetExpiryUseCase,
    DeleteAccountUseCase,
    ListAccountsQuery,
    MyProfileQuery,
    UpdateChatLanguageUseCase,
    SetupAdminUseCase,
    AdminSetup,
    { provide: SETUP_TOKEN_GATE, useExisting: AdminSetup },
    JwtAuthGuard,
    RolesGuard,
  ],
  // When another module uses these guards via @UseGuards, Nest reconstructs the guard in that context,
  // so we export the guards and their token-signer dependency. ACCOUNT_REPOSITORY comes from the
  // global PersistenceModule, so it doesn't need re-exporting here.
  exports: [JwtAuthGuard, RolesGuard, TOKEN_SIGNER],
})
export class IdentityModule {}

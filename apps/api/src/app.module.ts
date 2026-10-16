/**
 * app.module.ts — Root assembly. Wires the bounded contexts (support, safety) and shared surface together.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from './identity/identity.module';
import { PersistenceModule } from './infrastructure/database/persistence.module';
import { SafetyModule } from './safety/safety.module';
import { HealthController } from './shared/health.controller';
import { TimeModule } from './shared/time/time.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    // ConfigModule is the single owner of env loading: it reads the
    // NODE_ENV-selected file and everything else injects ConfigService.
    // (NODE_ENV itself is the selector, so it is the one direct read.)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'development' ? '.env.development' : '.env',
    }),
    PersistenceModule,
    TimeModule,
    IdentityModule,
    SupportModule,
    SafetyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

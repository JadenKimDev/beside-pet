/**
 * time.module.ts — global module exposing the TimeProvider token so any provider can inject it.
 */
import { Global, Module } from '@nestjs/common';
import { LuxonTimeProvider } from './luxon-time-provider';
import { TIME_PROVIDER } from './time-provider';

@Global()
@Module({
  providers: [{ provide: TIME_PROVIDER, useClass: LuxonTimeProvider }],
  exports: [TIME_PROVIDER],
})
export class TimeModule {}

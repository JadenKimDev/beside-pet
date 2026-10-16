/**
 * safety.module.ts — Safety (auxiliary subdomain) assembly.
 */
import { Module } from '@nestjs/common';
import { SafetyController } from './interface/safety.controller';

@Module({
  controllers: [SafetyController],
})
export class SafetyModule {}

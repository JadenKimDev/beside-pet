/**
 * health.controller.ts — liveness probe.
 *  GET /v1/health
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthResponse } from './health.response';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  health(): HealthResponse {
    return { status: 'ok' };
  }
}

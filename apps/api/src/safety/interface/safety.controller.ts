/**
 * safety.controller.ts — Safety resources surface.
 *  GET /v1/safety/resources  List of support resources / helplines to point to in a crisis
 */
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { safetyResources } from '../domain/safety-resources';
import { SafetyResourceResponse } from './dto/safety-resource.response';

@ApiTags('safety')
@Controller('safety')
export class SafetyController {
  @Get('resources')
  resources(): SafetyResourceResponse[] {
    return safetyResources();
  }
}

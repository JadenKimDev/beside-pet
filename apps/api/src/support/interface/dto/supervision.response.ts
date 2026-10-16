/**
 * supervision.response.ts — background quality read of a reply (mirrors Supervision).
 */
import type { SupervisionQuality } from '@/support/domain/model/supervision';

export class SupervisionResponse {
  evaluated!: boolean;
  quality!: SupervisionQuality;
  flags!: string[];
  note?: string;
}

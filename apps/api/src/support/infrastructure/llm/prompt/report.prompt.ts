/**
 * report.prompt.ts — prompt construction and parsing for the mind report.
 * The @@marker contract is defined and parsed in this one module, so the
 * format cannot drift between the prompt and the parser.
 */
import type { ReportBodies, ReportContext } from '@/support/domain/port/report-context';
import { OUTPUT_LANGUAGE } from './output-language';

const REPORT_KEYS: (keyof ReportBodies)[] = ['journey', 'emotions', 'keepsake', 'encouragement'];

export function buildReportSystemPrompt(context: ReportContext): string {
  const crisisNote = context.crisis
    ? ' If their pain feels heavy, gently add that professional support lines (e.g., 109 in Korea, 988 in the US) are always there to lean on.'
    : '';
  return [
    'You are a warm companion who just walked through a pet-loss grief conversation with the user. You now hand them a "mind report" that looks back on the conversation.',
    `The pet's name is "${context.petName}". Write ONLY in ${OUTPUT_LANGUAGE[context.locale]}, in a soft and heartfelt tone.`,
    'Do not use medical language such as treatment, diagnosis, or prescription. Use only the language of emotional support and companionship.',
    'Write each of the four sections below in 2-3 sentences. Each section MUST start with its marker:',
    '@@journey — Warmly acknowledge the steps of grief walked today as an achievement.',
    '@@emotions — Acknowledge the feelings that surfaced in the conversation, and reassure them that these are natural feelings born of love.',
    `@@keepsake — Pick one memory of ${context.petName} from what the user actually shared, and reflect it back as something to hold on to.`,
    `@@encouragement — Close by honoring today and offering one line that helps them be gentle with themselves.${crisisNote}`,
    'Output only the markers (@@journey etc.) and their bodies — no other headers, lists, or quotation marks.',
  ].join('\n');
}

export function buildReportUserPrompt(context: ReportContext): string {
  const transcript = context.history
    .map((message) => `${message.role === 'user' ? 'User' : 'Companion'}: ${message.text}`)
    .join('\n');
  const lossOrSituation =
    context.griefProfile.lossType ?? context.griefProfile.situation ?? 'unknown';
  return [
    '[Facts]',
    `- Pet: ${context.petName}`,
    `- Time together: ${context.griefProfile.togetherRange ?? 'unknown'}`,
    `- Type of loss/situation: ${lossOrSituation}`,
    `- Stage reached: ${context.reachedTask}/5 (progress ${Math.round(context.progress * 100)}%)`,
    '',
    '[Transcript]',
    transcript,
  ].join('\n');
}

/** Splits the marker-delimited model output into section bodies; a missing section stays empty. */
export function parseReportBodies(raw: string): ReportBodies {
  const result: ReportBodies = { journey: '', emotions: '', keepsake: '', encouragement: '' };
  for (const key of REPORT_KEYS) {
    const match = raw.match(
      new RegExp(`@@${key}\\s*([\\s\\S]*?)(?=@@(?:journey|emotions|keepsake|encouragement)\\b|$)`),
    );
    const body = match?.[1]?.trim();
    if (body) {
      result[key] = body;
    }
  }
  return result;
}

/**
 * reply.prompt.ts — prompt construction for the empathetic reply.
 * Owns the system prompt, the per-phase guidance, and the history-window
 * assembly for one utterance. The structural decisions (phase, task) are made
 * by the domain; this module only turns them into model input.
 */
import type { PromptMessage } from '@/llm/domain/model/prompt-message';
import type { Message } from '@/support/domain/model/message';
import type { KnowledgeChunk } from '@/support/domain/port/knowledge-chunk';
import type { ReplyPhase } from '@/support/domain/port/llm.port';
import type { PreviousSessionContext, ReplyContext } from '@/support/domain/port/reply-context';
import { OUTPUT_LANGUAGE } from './output-language';

/** How many recent messages travel to the model with each turn. */
const HISTORY_WINDOW = 10;

export function buildReplySystemPrompt(context: ReplyContext): string {
  const grounding = context.knowledge
    .map((chunk: KnowledgeChunk) => `- (${chunk.source}) ${chunk.content}`)
    .join('\n');
  return [
    'You are a warm companion supporting someone through the grief of losing a beloved pet.',
    `The pet's name is "${context.petName}". Respond ONLY in ${OUTPUT_LANGUAGE[context.locale]}.`,
    'Speak about one thing at a time, in 2-3 short and gentle sentences. Do not use lists, assessments, or strings of advice.',
    'Keep empathy and acknowledgement to one sentence at most, and every reply except a closing MUST end with exactly one concrete question the user can answer. Never reply with empathy alone.',
    `Current phase guidance: ${PHASE_GUIDE[context.phase]}`,
    context.previous ? formatPreviousSession(context.previous) : '',
    grounding
      ? `Ground your words in the following verified grief theory, but never quote or cite it:\n${grounding}`
      : '',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Cross-session continuity block for a resume greeting. */
function formatPreviousSession(previous: PreviousSessionContext): string {
  const recap = previous.summary ? `Previous session recap: ${previous.summary.headline}` : '';
  const tail = previous.recentHistory
    .map((message) => `${message.role === 'user' ? 'User' : 'Companion'}: ${message.text}`)
    .join('\n');
  return [
    'Context from the previous conversation (for continuity — never quote it verbatim):',
    recap,
    tail ? `Last messages exchanged:\n${tail}` : '',
    'Gently acknowledge what was shared last time before asking your reopening question.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

const PHASE_GUIDE: Record<ReplyPhase, string> = {
  intro:
    'Greet briefly, reassure them you are here together, then move straight into one concrete question that opens the story of the loss. Always include a short parenthetical example (e.g., ...) so the user knows what kind of answer fits.',
  resume:
    'Briefly welcome them back, then ask one concrete question that reopens the current stage as a continuation of the previous conversation — do not start over from the beginning. Always include a short parenthetical example (e.g., ...).',
  task: 'Move the conversation forward with one question that opens the new stage. Include a short parenthetical example (e.g., ...) to make answering easier.',
  deepen:
    'Pick up what the user just said and ask one follow-up question that goes one layer deeper — do not switch topics. Always include a short parenthetical example (e.g., ...).',
  retry:
    'Do not press. Reassure them that not answering is fine, then ask one low-pressure question. Include a very easy parenthetical example (even a single word is fine).',
  closing: 'Acknowledge what they shared today and close warmly. Do not ask a new question.',
};

/**
 * Maps the recent history window into prompt messages. When the model must
 * speak first (no trailing user turn), a synthetic phase seed is appended so
 * the request always ends on a user message.
 */
export function toPromptMessages(context: ReplyContext): PromptMessage[] {
  const recent = context.history.slice(-HISTORY_WINDOW);
  const messages: PromptMessage[] = recent.map((message: Message) => ({
    role: message.role,
    content: message.text,
  }));
  const last = messages[messages.length - 1];
  if (last?.role !== 'user') {
    messages.push({ role: 'user', content: PHASE_SEED[context.phase] });
  }
  return messages;
}

const PHASE_SEED: Record<ReplyPhase, string> = {
  intro: '(The session begins.)',
  resume: '(The session resumes from last time.)',
  task: '(Please continue.)',
  deepen: '(Please go a little deeper.)',
  retry: '(Please continue gently.)',
  closing: '(Please close the conversation.)',
};

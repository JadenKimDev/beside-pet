/**
 * reply-phase.ts — the conversational phase of a turn (a domain value).
 * first greeting / stage-opening question / deeper follow-up / gentle re-ask / closing.
 * The LLM port and the turn analysis both reference this single definition.
 *  - intro:  first-ever greeting; opens the loss story at stage 1
 *  - resume: welcome-back greeting for a returning user; opens at the resumed stage
 *  - task:   opens a new stage with its first question
 *  - deepen: stays on the current stage and goes one layer deeper on what was just said
 *  - retry:  the user disengaged; reassure and re-ask with a lower-demand question
 */
export type ReplyPhaseName = 'intro' | 'resume' | 'task' | 'deepen' | 'retry' | 'closing';

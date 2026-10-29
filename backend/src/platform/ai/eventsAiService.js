/**
 * ManageX Events & Hackathons AI Service (Phase 03 — Task 3.1)
 * Strictly adheres to docs/managex-ai-implementation-plan.md (§4.2, §7.3, §8.2),
 * PRD Section 7 (EVT-001, EVT-008, §20.14 Decision 9), and docs/security.md.
 *
 * Invariants:
 * - Module slug: 'events'.
 * - Enforces event.edit permission or organiser/admin status.
 * - Source data minimization: uses only non-confidential event metadata.
 * - Submissions, confidential judge notes, private scores, and unreleased participant data
 *   are strictly excluded.
 * - Untrusted inputs are enclosed in structural XML delimiters (<event_context>, <event_tracks>).
 * - Delimiters inside user input are sanitized to prevent premature tag termination and prompt injection.
 * - Output validated against Zod schemas.
 * - Scores conform to PRD §20.14 Decision 9 (integer > 0 and <= 100).
 * - Rubric generation strictly rejected once scoring has commenced (EVT-008).
 * - AI completions executed outside database transactions with OpenRouter ZDR routing controls.
 * - Ephemeral draft output (isDraft: true); zero automatic database writes.
 */

import { ValidationError, ConflictError, AuthorizationError, NotFoundError } from '../common/errors.js';
import { withTenantTransaction } from '../database/transaction.js';
import { executeAiCompletion } from './aiService.js';
import {
  generateEventContentInputSchema,
  generateEventContentOutputSchema,
  generateJudgingRubricInputSchema,
  generateJudgingRubricOutputSchema,
} from './schemas/eventsAiSchemas.js';

// =============================================================================
// Helper: Permission check
// =============================================================================

function hasPermission(permissions, key) {
  if (!permissions) return false;
  if (permissions instanceof Set) return permissions.has(key);
  return permissions.includes(key);
}

// =============================================================================
// Helper: Sanitize untrusted input delimiters to neutralize XML breakout attacks
// =============================================================================

export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<\/event_context>/gi, '[closing tag removed]')
    .replace(/<\/event_tracks>/gi, '[closing tag removed]')
    .replace(/<\/user_instructions>/gi, '[closing tag removed]')
    .replace(/<\/focus_areas>/gi, '[closing tag removed]')
    .replace(/<\/additional_instructions>/gi, '[closing tag removed]');
}

// =============================================================================
// Phase 03: Event Content Generator (Announcement, Description & Rules/FAQ)
// =============================================================================

export const EVENT_CONTENT_SYSTEM_PROMPT = `You are an expert event producer, hackathon director, and technical marketing writer in ManageX.
Your task is to generate compelling, clear, professional, and accessible event content based on the provided event parameters.

GUIDELINES:
1. "overview": Concise, engaging summary (1-3 sentences) suitable for preview cards and social announcements (1 to 1000 characters).
2. "description": Comprehensive, well-structured event description highlighting objectives, themes, and key activities (1 to 5000 characters).
3. "eligibilityCriteria": Clear criteria defining who can participate (e.g. students, professionals, teams, regional limits).
4. "submissionGuidelines": Actionable instructions for project deliverables (e.g. repository link, video demo, slide deck).
5. "rules": An array of rule strings (e.g. ["Original work only", "Code of conduct applies"]). Maximum 20 rules.
6. "faqs": An array of objects each with "question" (string) and "answer" (string). Maximum 15 items.
7. Output must strictly conform to the JSON schema:
   {
     "titleSuggestion": "Concise title or null",
     "overview": "Engaging overview paragraph",
     "description": "Comprehensive event description",
     "eligibilityCriteria": "Eligibility requirements",
     "submissionGuidelines": "Submission instructions",
     "rules": ["Rule 1", "Rule 2"],
     "faqs": [{"question": "FAQ 1?", "answer": "Answer 1"}]
   }
8. Do not include markdown code fences or any conversational prose outside the JSON object.`;

/**
 * Builds the isolated user prompt for event content generation.
 */
export function buildEventContentPrompt({
  eventTitle,
  eventType,
  startDate,
  endDate,
  locationType,
  location,
  virtualUrl,
  theme,
  targetAudience,
  focusAreas = [],
  additionalInstructions = '',
}) {
  const focusList = focusAreas.length > 0
    ? focusAreas.map((f) => `- ${sanitizeText(f)}`).join('\n')
    : '';

  return `Generate structured event content for the following event:

<event_context>
Title: ${sanitizeText(eventTitle)}
Type: ${eventType === 'hackathon' ? 'Hackathon' : 'General Event'}
Schedule: ${startDate ? new Date(startDate).toISOString() : 'TBD'} to ${endDate ? new Date(endDate).toISOString() : 'TBD'}
Format: ${locationType || 'in_person'} ${location ? `at ${sanitizeText(location)}` : ''} ${virtualUrl ? `(Virtual: ${sanitizeText(virtualUrl)})` : ''}
${theme ? `Theme: ${sanitizeText(theme)}` : ''}
${targetAudience ? `Target Audience: ${sanitizeText(targetAudience)}` : ''}
</event_context>

${
  focusList
    ? `<focus_areas>\nEmphasize the following focus areas in the content:\n${focusList}\n</focus_areas>`
    : ''
}

${
  additionalInstructions
    ? `<additional_instructions>\n${sanitizeText(additionalInstructions)}\n</additional_instructions>`
    : ''
}

Generate structured JSON output adhering strictly to the requested schema.`;
}

/**
 * Generates structured draft event content (description, rules, FAQs).
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.eventId
 * @param {string} params.userId
 * @param {string[]} [params.userPermissions]
 * @param {object} [params.input] - Validated generateEventContentInputSchema
 * @param {string} [params.apiKey]
 * @param {string} [params.baseUrl]
 * @param {typeof fetch} [params.fetchFn]
 */
export async function generateEventContent({
  organisationId,
  eventId,
  userId,
  userPermissions = [],
  input = {},
  apiKey = undefined,
  baseUrl = undefined,
  fetchFn = fetch,
}) {
  if (!organisationId) throw new ValidationError('organisationId is required');
  if (!eventId) throw new ValidationError('eventId is required');
  if (!userId) throw new ValidationError('userId is required');

  const validatedInput = generateEventContentInputSchema.parse(input);

  let event;

  // Step 1: Context retrieval & permission verification inside tenant transaction
  await withTenantTransaction({ organisationId, userId }, async (client) => {
    const res = await client.query(
      `SELECT id, organisation_id, title, event_type, status, visibility,
              start_at, end_at, location_type, location, virtual_url, created_by_id
       FROM events
       WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    event = res.rows[0];

    // Authorization: Creator, event.edit, org.admin, or org.owner
    const isCreator = event.created_by_id === userId;
    const canEdit =
      isCreator ||
      hasPermission(userPermissions, 'event.edit') ||
      hasPermission(userPermissions, 'org.admin') ||
      hasPermission(userPermissions, 'org.owner');

    if (!canEdit) {
      throw new AuthorizationError(
        'User lacks permission to edit event or generate AI content.',
        'FORBIDDEN'
      );
    }

    // Lifecycle guard: Reject completed, cancelled, or archived events
    if (['completed', 'cancelled', 'archived'].includes(event.status)) {
      throw new ConflictError(
        `Cannot generate AI content for event in "${event.status}" status.`,
        'EVENT_TERMINAL'
      );
    }
  });

  // Step 2: Build untrusted context prompt with delimiter isolation
  const prompt = buildEventContentPrompt({
    eventTitle: event.title,
    eventType: event.event_type,
    startDate: event.start_at,
    endDate: event.end_at,
    locationType: event.location_type,
    location: event.location,
    virtualUrl: event.virtual_url,
    theme: validatedInput.theme,
    targetAudience: validatedInput.targetAudience,
    focusAreas: validatedInput.focusAreas,
    additionalInstructions: validatedInput.additionalInstructions,
  });

  // Step 3: Execute via shared AI orchestrator (outside DB transaction)
  const result = await executeAiCompletion({
    organisationId,
    userId,
    moduleSlug: 'events',
    feature: 'event_content_generation',
    systemPrompt: EVENT_CONTENT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    outputSchema: generateEventContentOutputSchema,
    apiKey,
    baseUrl,
    fetchFn,
  });

  // Step 4: Return ephemeral draft payload (zero automatic database writes)
  return {
    isDraft: true,
    eventId,
    content: result.content,
    usage: {
      totalTokens: result.usage.totalTokens,
      estimatedCostUsd: result.usage.estimatedCostUsd,
    },
  };
}

// =============================================================================
// Phase 03: Judging Rubric & Criteria Generator (EVT-008, §20.14 Decision 9)
// =============================================================================

export const JUDGING_RUBRIC_SYSTEM_PROMPT = `You are a principal hackathon organizer, judging coordinator, and academic evaluator in ManageX.
Your task is to generate clear, structured, objective, and fair judging rubrics and criteria for evaluating hackathon submissions.

INVARIANTS:
1. "rubricTitle": A concise, descriptive title for the overall judging rubric (max 255 characters).
2. "overview": Brief summary or judging philosophy (max 1000 characters).
3. "criteria": An array of criteria objects, each containing:
   - "name": Concise criterion name (max 120 chars, e.g. "Technical Innovation", "Execution & Architecture", "Impact & Practicality", "Design & UX").
   - "maxScore": Must be an integer between 1 and 100 (defaults to 100). Straight sum scoring is used across criteria.
   - "description": Detailed explanation of what judges must look for in the project.
   - "scoringGuidance": Explicit scoring level rubric (e.g. "1-25 Poor, 26-50 Average, 51-75 Good, 76-100 Outstanding") to ensure consistent evaluation.
   - "orderIndex": Sequential integer starting at 0 (0, 1, 2, ...).
4. Output must strictly conform to the JSON schema:
   {
     "rubricTitle": "Evaluation Rubric Title",
     "overview": "Short rubric overview",
     "criteria": [
       {
         "name": "Technical Execution",
         "description": "Evaluates code quality, robustness, and architectural soundness.",
         "maxScore": 100,
         "scoringGuidance": "1-25 Poor: Non-functional or severe bugs; 26-50 Average: Basic MVP with flaws; 51-75 Good: Solid architecture and clean code; 76-100 Outstanding: Production-grade quality and resilience.",
         "orderIndex": 0
       }
     ]
   }
5. Do not include markdown code fences or any conversational prose outside the JSON object.`;

/**
 * Builds the isolated user prompt for judging rubric generation.
 */
export function buildJudgingRubricPrompt({
  eventTitle,
  eventType,
  tracks = [],
  criteriaCount = 4,
  focusAreas = [],
  additionalInstructions = '',
  existingCriteriaNames = [],
}) {
  const tracksList = tracks.length > 0
    ? tracks.map((t) => `- ${sanitizeText(t)}`).join('\n')
    : 'General track';

  const focusList = focusAreas.length > 0
    ? focusAreas.map((f) => `- ${sanitizeText(f)}`).join('\n')
    : '';

  const existingList = existingCriteriaNames.length > 0
    ? existingCriteriaNames.map((c) => `- ${sanitizeText(c)}`).join('\n')
    : '';

  return `Generate a balanced judging rubric with approximately ${criteriaCount} distinct criteria for the following competition:

<event_context>
Event: ${sanitizeText(eventTitle)}
Type: ${eventType === 'hackathon' ? 'Hackathon Competition' : 'Event'}
</event_context>

<event_tracks>
${tracksList}
</event_tracks>

${
  focusList
    ? `<focus_areas>\nPrioritize evaluation of:\n${focusList}\n</focus_areas>`
    : ''
}

${
  existingList
    ? `<existing_criteria>\nAvoid duplicating the names of existing criteria already created:\n${existingList}\n</existing_criteria>`
    : ''
}

${
  additionalInstructions
    ? `<additional_instructions>\n${sanitizeText(additionalInstructions)}\n</additional_instructions>`
    : ''
}

Generate structured JSON output adhering strictly to the requested schema.`;
}

/**
 * Generates structured draft judging rubrics and criteria for an event or round.
 *
 * @param {object} params
 * @param {string} params.organisationId
 * @param {string} params.eventId
 * @param {string} [params.roundId]
 * @param {string} params.userId
 * @param {string[]} [params.userPermissions]
 * @param {object} [params.input] - Validated generateJudgingRubricInputSchema
 * @param {string} [params.apiKey]
 * @param {string} [params.baseUrl]
 * @param {typeof fetch} [params.fetchFn]
 */
export async function generateJudgingRubric({
  organisationId,
  eventId,
  roundId = null,
  userId,
  userPermissions = [],
  input = {},
  apiKey = undefined,
  baseUrl = undefined,
  fetchFn = fetch,
}) {
  if (!organisationId) throw new ValidationError('organisationId is required');
  if (!eventId) throw new ValidationError('eventId is required');
  if (!userId) throw new ValidationError('userId is required');

  const validatedInput = generateJudgingRubricInputSchema.parse(input);

  let event;
  let existingCriteriaNames = [];

  // Step 1: Context retrieval & validation inside tenant transaction
  await withTenantTransaction({ organisationId, userId }, async (client) => {
    // 1.1 Verify event exists and is accessible within tenant
    const res = await client.query(
      `SELECT id, organisation_id, title, event_type, status, created_by_id
       FROM events
       WHERE id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Event not found.', 'EVENT_NOT_FOUND');
    }

    event = res.rows[0];

    // 1.2 Authorization check: Creator, event.edit, org.admin, or org.owner
    const isCreator = event.created_by_id === userId;
    const canEdit =
      isCreator ||
      hasPermission(userPermissions, 'event.edit') ||
      hasPermission(userPermissions, 'org.admin') ||
      hasPermission(userPermissions, 'org.owner');

    if (!canEdit) {
      throw new AuthorizationError(
        'User lacks permission to generate judging rubrics for this event.',
        'FORBIDDEN'
      );
    }

    // 1.3 Lifecycle check: Reject terminal events
    if (['completed', 'cancelled', 'archived'].includes(event.status)) {
      throw new ConflictError(
        `Cannot generate judging rubrics for event in "${event.status}" status.`,
        'EVENT_TERMINAL'
      );
    }

    // 1.4 Strict scoring commencement guard (PRD EVT-008):
    // Modifying or adding scoring criteria once scoring has started is strictly prohibited
    const scoreCountSql = roundId
      ? `SELECT COUNT(*)::int AS count FROM event_scores WHERE round_id = $1`
      : `SELECT COUNT(*)::int AS count FROM event_scores WHERE event_id = $1`;
    const scoreCountParams = roundId ? [roundId] : [eventId];

    const scoreCountRes = await client.query(scoreCountSql, scoreCountParams);
    if (scoreCountRes.rows[0].count > 0) {
      throw new ConflictError(
        'Cannot generate or modify judging rubrics after scoring has commenced.',
        'SCORING_ALREADY_STARTED'
      );
    }

    // 1.5 Fetch existing criteria names to guide deduplication
    const critRes = await client.query(
      `SELECT name FROM event_scoring_criteria WHERE event_id = $1 AND organisation_id = $2`,
      [eventId, organisationId]
    );
    existingCriteriaNames = critRes.rows.map((r) => r.name);
  });

  // Step 2: Build untrusted context prompt with delimiter isolation
  const prompt = buildJudgingRubricPrompt({
    eventTitle: event.title,
    eventType: event.event_type,
    tracks: validatedInput.tracks,
    criteriaCount: validatedInput.criteriaCount,
    focusAreas: validatedInput.focusAreas,
    additionalInstructions: validatedInput.additionalInstructions,
    existingCriteriaNames,
  });

  // Step 3: Execute via shared AI orchestrator (outside DB transaction)
  const result = await executeAiCompletion({
    organisationId,
    userId,
    moduleSlug: 'events',
    feature: 'judging_rubric_generation',
    systemPrompt: JUDGING_RUBRIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    outputSchema: generateJudgingRubricOutputSchema,
    apiKey,
    baseUrl,
    fetchFn,
  });

  // Step 4: Normalize criteria (ensuring sequential orderIndex and integer maxScore)
  const rawCriteria = result.content?.criteria || [];
  const normalizedCriteria = rawCriteria.map((c, idx) => ({
    name: c.name,
    description: c.description || '',
    maxScore: Number.isInteger(Number(c.maxScore)) && c.maxScore > 0 && c.maxScore <= 100
      ? Number(c.maxScore)
      : 100,
    orderIndex: Number.isInteger(Number(c.orderIndex)) ? Number(c.orderIndex) : idx,
    scoringGuidance: c.scoringGuidance || '',
  }));

  // Step 5: Return ephemeral rubric draft (zero automatic database writes)
  return {
    isDraft: true,
    eventId,
    roundId: roundId || null,
    rubricTitle: result.content?.rubricTitle || `${event.title} Judging Rubric`,
    criteria: normalizedCriteria,
    usage: {
      totalTokens: result.usage.totalTokens,
      estimatedCostUsd: result.usage.estimatedCostUsd,
    },
  };
}

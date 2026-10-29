import { z } from 'zod';

// =============================================================================
// Event Announcement, Description & Rules/FAQ Schemas (AI-REQ-07, PRD §7.1)
// =============================================================================

export const generateEventContentInputSchema = z.object({
  theme: z
    .string()
    .trim()
    .max(200, 'Theme must be under 200 characters')
    .optional(),
  targetAudience: z
    .string()
    .trim()
    .max(200, 'Target audience must be under 200 characters')
    .optional(),
  focusAreas: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Focus area cannot be empty')
        .max(200, 'Focus area must be under 200 characters')
    )
    .max(5, 'At most 5 focus areas allowed')
    .optional()
    .default([]),
  additionalInstructions: z
    .string()
    .trim()
    .max(1000, 'Additional instructions must be under 1000 characters')
    .optional(),
});

export const eventFaqItemSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'FAQ question is required')
    .max(300, 'FAQ question cannot exceed 300 characters'),
  answer: z
    .string()
    .trim()
    .min(1, 'FAQ answer is required')
    .max(2000, 'FAQ answer cannot exceed 2000 characters'),
});

export const generateEventContentOutputSchema = z.object({
  titleSuggestion: z
    .string()
    .trim()
    .max(255, 'Title suggestion cannot exceed 255 characters')
    .optional(),
  overview: z
    .string()
    .trim()
    .min(1, 'Event overview is required')
    .max(1000, 'Event overview cannot exceed 1000 characters'),
  description: z
    .string()
    .trim()
    .min(1, 'Event description is required')
    .max(5000, 'Event description cannot exceed 5000 characters'),
  eligibilityCriteria: z
    .string()
    .trim()
    .max(2000, 'Eligibility criteria cannot exceed 2000 characters')
    .optional()
    .default(''),
  submissionGuidelines: z
    .string()
    .trim()
    .max(2000, 'Submission guidelines cannot exceed 2000 characters')
    .optional()
    .default(''),
  rules: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Rule item cannot be empty')
        .max(500, 'Rule item cannot exceed 500 characters')
    )
    .max(20, 'At most 20 rules allowed')
    .default([]),
  faqs: z
    .array(eventFaqItemSchema)
    .max(15, 'At most 15 FAQ items allowed')
    .default([]),
});

// =============================================================================
// Judging Rubric & Criteria Generator Schemas (AI-REQ-08, PRD §7.4, §20.14)
// =============================================================================

export const generateJudgingRubricInputSchema = z.object({
  tracks: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Track name cannot be empty')
        .max(100, 'Track name must be under 100 characters')
    )
    .max(5, 'At most 5 tracks allowed')
    .optional()
    .default([]),
  criteriaCount: z
    .number()
    .int('Criteria count must be an integer')
    .min(2, 'Must generate at least 2 criteria')
    .max(10, 'Cannot generate more than 10 criteria')
    .optional()
    .default(4),
  focusAreas: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Focus area cannot be empty')
        .max(200, 'Focus area must be under 200 characters')
    )
    .max(5, 'At most 5 focus areas allowed')
    .optional()
    .default([]),
  additionalInstructions: z
    .string()
    .trim()
    .max(1000, 'Additional instructions must be under 1000 characters')
    .optional(),
});

export const judgingCriterionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Criterion name must be at least 2 characters')
    .max(120, 'Criterion name cannot exceed 120 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description cannot exceed 2000 characters')
    .default(''),
  maxScore: z
    .number()
    .int('Max score must be an integer')
    .min(1, 'Max score must be greater than 0')
    .max(100, 'Max score cannot exceed 100')
    .default(100),
  orderIndex: z
    .number()
    .int('Order index must be an integer')
    .min(0)
    .default(0),
  scoringGuidance: z
    .string()
    .trim()
    .max(2000, 'Scoring guidance cannot exceed 2000 characters')
    .optional()
    .default(''),
});

export const generateJudgingRubricOutputSchema = z.object({
  rubricTitle: z
    .string()
    .trim()
    .min(1, 'Rubric title is required')
    .max(200, 'Rubric title cannot exceed 200 characters'),
  criteria: z
    .array(judgingCriterionSchema)
    .min(1, 'At least one criterion must be generated')
    .max(15, 'At most 15 criteria allowed'),
});

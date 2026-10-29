import { z } from 'zod';

export const generateAgendaInputSchema = z.object({
  focusTopics: z
    .array(z.string().trim().min(1, 'Topic must not be empty').max(200, 'Topic must be under 200 characters'))
    .max(10, 'At most 10 focus topics allowed')
    .optional()
    .default([]),
  targetDurationMinutes: z
    .number()
    .int('Target duration must be an integer')
    .positive('Target duration must be positive')
    .max(1440, 'Target duration cannot exceed 24 hours')
    .optional()
    .nullable(),
  additionalContext: z
    .string()
    .trim()
    .max(1000, 'Additional context must be under 1000 characters')
    .optional(),
});

export const suggestedAgendaItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Agenda item title is required')
    .max(255, 'Agenda item title must be at most 255 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be at most 2000 characters')
    .default(''),
  durationMinutes: z
    .number()
    .int('Duration must be an integer')
    .positive('Duration must be positive')
    .max(1440, 'Duration cannot exceed 24 hours')
    .default(15),
  orderIndex: z
    .number()
    .int()
    .min(0)
    .default(0),
});

export const generateAgendaOutputSchema = z.object({
  suggestedAgendaItems: z
    .array(suggestedAgendaItemSchema)
    .min(1, 'At least one agenda item must be generated')
    .max(25, 'At most 25 agenda items allowed'),
});

// Phase 02B: Confidential Meeting Notes Summarizer Schemas
export const summarizeNotesInputSchema = z.object({
  focusAreas: z
    .array(z.string().trim().min(1, 'Focus area cannot be empty').max(200, 'Focus area cannot exceed 200 characters'))
    .max(5, 'At most 5 focus areas allowed')
    .optional()
    .default([]),
  additionalContext: z
    .string()
    .trim()
    .max(1000, 'Additional context must be under 1000 characters')
    .optional(),
});

export const summarizeNotesOutputSchema = z.object({
  executiveSummary: z
    .string()
    .trim()
    .min(10, 'Executive summary must be at least 10 characters')
    .max(5000, 'Executive summary cannot exceed 5000 characters'),
  keyDiscussionPoints: z
    .array(
      z.object({
        topic: z.string().trim().min(1, 'Topic cannot be empty').max(255, 'Topic cannot exceed 255 characters'),
        summary: z.string().trim().min(1, 'Summary cannot be empty').max(2000, 'Summary cannot exceed 2000 characters'),
      })
    )
    .max(20, 'At most 20 discussion points allowed')
    .default([]),
  decisions: z
    .array(
      z.object({
        decision: z.string().trim().min(1, 'Decision cannot be empty').max(255, 'Decision cannot exceed 255 characters'),
        rationale: z.string().trim().max(2000, 'Rationale cannot exceed 2000 characters').optional().default(''),
      })
    )
    .max(20, 'At most 20 decisions allowed')
    .default([]),
});

// Phase 02C: Action Items Extraction with Candidate Assignee Matching Schemas
export const extractActionItemsInputSchema = z.object({
  focusAreas: z
    .array(z.string().trim().min(1, 'Focus area cannot be empty').max(200, 'Focus area cannot exceed 200 characters'))
    .max(5, 'At most 5 focus areas allowed')
    .optional()
    .default([]),
  additionalContext: z
    .string()
    .trim()
    .max(1000, 'Additional context must be under 1000 characters')
    .optional(),
});

export const extractedCandidateActionItemSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Action item title is required')
    .max(200, 'Action item title cannot exceed 200 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional()
    .default(''),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .default('medium'),
  suggestedDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format')
    .optional()
    .nullable(),
  suggestedAssigneeName: z
    .string()
    .trim()
    .max(255, 'Assignee name cannot exceed 255 characters')
    .optional()
    .nullable(),
  rationale: z
    .string()
    .trim()
    .max(1000, 'Rationale cannot exceed 1000 characters')
    .optional()
    .default(''),
});

export const extractActionItemsOutputSchema = z.object({
  candidateActionItems: z
    .array(extractedCandidateActionItemSchema)
    .max(30, 'At most 30 action items can be extracted')
    .default([]),
});

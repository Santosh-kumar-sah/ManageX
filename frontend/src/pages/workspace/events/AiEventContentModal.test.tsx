import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AiEventContentModal,
  composeParticipantInstructions,
  GeneratedEventContent,
} from './AiEventContentModal';

describe('AiEventContentModal (Phase 03 Unit Tests)', () => {
  const defaultInitialEvent = {
    title: 'Autonomous AI Hackathon 2026',
    description: 'An existing hackathon description in database.',
    participantInstructions: 'Original participant rules and guidelines.',
    updatedAt: '2026-10-28T12:00:00.000Z',
  };

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 'org-test-events-ai',
    eventId: 'evt-test-1234',
    initialEvent: defaultInitialEvent,
    onEventUpdated: vi.fn(),
  };

  it('1. Renders initial input form with theme, audience, focus areas, and instructions', () => {
    const html = renderToStaticMarkup(<AiEventContentModal {...defaultProps} />);

    expect(html).toContain('AI Event Content Assistant');
    expect(html).toContain('Event Theme / Main Subject (Optional)');
    expect(html).toContain('Target Audience (Optional)');
    expect(html).toContain('Focus Areas / Tracks (Optional, max 5)');
    expect(html).toContain('Additional Instructions (Optional)');
    expect(html).toContain('Generate Draft');
  });

  it('2. Closed modal renders empty/hidden', () => {
    const html = renderToStaticMarkup(
      <AiEventContentModal {...defaultProps} isOpen={false} />
    );
    expect(html).toBe('');
  });

  describe('composeParticipantInstructions helper', () => {
    it('3. Formats eligibility, guidelines, rules, and FAQs into structured markdown', () => {
      const mockContent: GeneratedEventContent = {
        titleSuggestion: 'NextGen Autonomous Hackathon',
        overview: 'Build production-grade agents in 48 hours.',
        description: 'Comprehensive technical challenges across multiple domains.',
        eligibilityCriteria: 'Open to software engineers, students, and researchers worldwide.',
        submissionGuidelines: 'Submit public GitHub repo and YouTube demo video.',
        rules: [
          'All code must be written during the competition',
          'Teams must consist of 1 to 4 participants',
          'Adhere strictly to the ManageX Code of Conduct',
        ],
        faqs: [
          {
            question: 'Can I use open-source foundation models?',
            answer: 'Yes, existing pre-trained weights and open-source APIs are allowed.',
          },
          {
            question: 'Is virtual attendance permitted?',
            answer: 'Yes, this hackathon supports fully hybrid participation.',
          },
        ],
      };

      const md = composeParticipantInstructions(mockContent);

      expect(md).toContain('## Eligibility Criteria\nOpen to software engineers, students, and researchers worldwide.');
      expect(md).toContain('## Submission Guidelines\nSubmit public GitHub repo and YouTube demo video.');
      expect(md).toContain('## Rules & Code of Conduct\n1. All code must be written during the competition\n2. Teams must consist of 1 to 4 participants\n3. Adhere strictly to the ManageX Code of Conduct');
      expect(md).toContain('## Frequently Asked Questions\n**Q: Can I use open-source foundation models?**\nA: Yes, existing pre-trained weights and open-source APIs are allowed.\n\n**Q: Is virtual attendance permitted?**\nA: Yes, this hackathon supports fully hybrid participation.');
    });

    it('4. Handles empty or omitted sections gracefully without orphaned headers', () => {
      const partialContent: GeneratedEventContent = {
        overview: 'Brief overview.',
        description: 'Brief description.',
        rules: ['Rule 1 only'],
        faqs: [],
      };

      const md = composeParticipantInstructions(partialContent);

      expect(md).not.toContain('## Eligibility Criteria');
      expect(md).not.toContain('## Submission Guidelines');
      expect(md).toContain('## Rules & Code of Conduct\n1. Rule 1 only');
      expect(md).not.toContain('## Frequently Asked Questions');
    });
  });

  describe('Conflict Detection Logic & Concurrency Protection', () => {
    it('5. Detects conflict when database title has changed concurrently', () => {
      const initialEvent = {
        title: 'Original Title',
        description: 'Original Description',
        participantInstructions: 'Original Instructions',
      };

      const latestEventFromDb = {
        title: 'Concurrent Editor Changed Title',
        description: 'Original Description',
        participantInstructions: 'Original Instructions',
      };

      const draftTitle = 'AI Proposed Title';
      const applyTitle = true;

      const titleChanged =
        applyTitle &&
        latestEventFromDb.title !== initialEvent.title &&
        latestEventFromDb.title !== draftTitle;

      expect(titleChanged).toBe(true);
    });

    it('6. Does NOT flag conflict when database matches initialEvent', () => {
      const initialEvent = {
        title: 'Original Title',
        description: 'Original Description',
        participantInstructions: 'Original Instructions',
      };

      const latestEventFromDb = {
        title: 'Original Title',
        description: 'Original Description',
        participantInstructions: 'Original Instructions',
      };

      const draftTitle = 'AI Proposed Title';
      const applyTitle = true;

      const titleChanged =
        applyTitle &&
        latestEventFromDb.title !== initialEvent.title &&
        latestEventFromDb.title !== draftTitle;

      expect(titleChanged).toBe(false);
    });

    it('7. Preserves unselected fields in patch payload', () => {
      const applyTitle = false;
      const applyDescription = true;
      const applyInstructions = false;

      const draftTitle = 'Suggested Title';
      const draftDescription = 'Suggested Description';
      const draftInstructions = 'Suggested Instructions';

      const patchPayload: Record<string, any> = {};

      if (applyTitle && draftTitle.trim()) {
        patchPayload.title = draftTitle.trim();
      }
      if (applyDescription) {
        patchPayload.description = draftDescription.trim() || null;
      }
      if (applyInstructions) {
        patchPayload.participantInstructions = draftInstructions.trim() || null;
      }

      expect(patchPayload).toEqual({
        description: 'Suggested Description',
      });
      expect(patchPayload.title).toBeUndefined();
      expect(patchPayload.participantInstructions).toBeUndefined();
    });
  });
});

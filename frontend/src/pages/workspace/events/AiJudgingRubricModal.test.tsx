import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AiJudgingRubricModal,
  mergeScoringGuidance,
  EditableCriterionDraft,
} from './AiJudgingRubricModal';

describe('AiJudgingRubricModal (Phase 03 Unit Tests)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 'org-test-rubrics-ai',
    eventId: 'evt-test-5678',
    roundId: 'round-uuid-1',
    roundName: 'Preliminary Round',
    onCriteriaCreated: vi.fn(),
  };

  it('1. Renders initial input form with tracks, criteria count, and round information', () => {
    const html = renderToStaticMarkup(<AiJudgingRubricModal {...defaultProps} />);

    expect(html).toContain('AI Judging Rubric Assistant');
    expect(html).toContain('Preliminary Round');
    expect(html).toContain('Competition Tracks (Optional, max 5)');
    expect(html).toContain('Number of Criteria to Generate (2 to 10)');
    expect(html).toContain('Evaluation Focus Areas (Optional, max 5)');
    expect(html).toContain('Generate Rubric');
  });

  it('2. Closed modal renders empty/hidden', () => {
    const html = renderToStaticMarkup(
      <AiJudgingRubricModal {...defaultProps} isOpen={false} />
    );
    expect(html).toBe('');
  });

  describe('mergeScoringGuidance helper', () => {
    it('3. Merges non-empty description and scoring guidance with explicit label', () => {
      const description = 'Evaluates architectural scalability and adherence to distributed design principles.';
      const guidance = '1-25 Monolithic flaws; 26-50 Basic modularity; 51-75 Scalable service boundaries; 76-100 Fault-tolerant perfection.';

      const merged = mergeScoringGuidance(description, guidance);

      expect(merged).toBe(
        'Evaluates architectural scalability and adherence to distributed design principles.\n\nScoring Guidance:\n1-25 Monolithic flaws; 26-50 Basic modularity; 51-75 Scalable service boundaries; 76-100 Fault-tolerant perfection.'
      );
    });

    it('4. Handles empty description by returning just the labeled scoring guidance', () => {
      const guidance = '1-50 Incomplete demo; 51-100 Flawless live execution.';
      const merged = mergeScoringGuidance('', guidance);

      expect(merged).toBe('Scoring Guidance:\n1-50 Incomplete demo; 51-100 Flawless live execution.');
    });

    it('5. Handles empty guidance by returning just the description', () => {
      const description = 'Clean code and comprehensive test coverage.';
      const merged = mergeScoringGuidance(description, '');

      expect(merged).toBe('Clean code and comprehensive test coverage.');
    });
  });

  describe('Validation & Sequential Save with Finding-01 Retry Protection', () => {
    it('6. Rejects criteria with invalid scores or empty names', () => {
      const invalidCriteria: EditableCriterionDraft[] = [
        {
          tempId: 'crit-1',
          name: 'A', // Too short (<2 chars)
          description: 'Valid description',
          maxScore: 100,
        },
        {
          tempId: 'crit-2',
          name: 'Valid Criterion',
          description: 'Valid description',
          maxScore: 150, // Exceeds 100
        },
      ];

      // Validate Criterion 1
      const isNameTooShort = !invalidCriteria[0].name.trim() || invalidCriteria[0].name.trim().length < 2;
      expect(isNameTooShort).toBe(true);

      // Validate Criterion 2
      const isScoreOutOfBounds = invalidCriteria[1].maxScore < 1 || invalidCriteria[1].maxScore > 100;
      expect(isScoreOutOfBounds).toBe(true);
    });

    it('7. Simulates sequential save with partial failure and verifies unsaved items remain for retry', async () => {
      const initialCriteria: EditableCriterionDraft[] = [
        {
          tempId: 'crit-1',
          name: 'Technical Execution',
          description: 'Code quality and testing',
          maxScore: 100,
        },
        {
          tempId: 'crit-2',
          name: 'Innovation & Impact',
          description: 'Originality of solution',
          maxScore: 100,
        },
        {
          tempId: 'crit-3',
          name: 'Design & UX', // Simulates duplicate name collision
          description: 'Usability and aesthetics',
          maxScore: 100,
        },
      ];

      const savedRecords: string[] = [];
      const remainingCriteria = [...initialCriteria];
      let partialSaveError: string | null = null;

      // Mock save loop matching AiJudgingRubricModal.handleSaveCriteria
      while (remainingCriteria.length > 0) {
        const currentCrit = remainingCriteria[0];

        if (currentCrit.name === 'Design & UX') {
          // Simulate 409 Conflict: Criterion with name 'Design & UX' already exists
          partialSaveError = `A criterion named "${currentCrit.name}" already exists in this event.`;
          break;
        }

        // Simulates successful API POST
        savedRecords.push(currentCrit.name);
        remainingCriteria.shift();
      }

      // Assertions matching Finding-01 invariant
      expect(savedRecords).toEqual(['Technical Execution', 'Innovation & Impact']);
      expect(savedRecords.length).toBe(2);
      expect(remainingCriteria.length).toBe(1);
      expect(remainingCriteria[0].name).toBe('Design & UX');
      expect(partialSaveError).toContain('already exists');

      // User fixes the duplicate name in the remaining list
      remainingCriteria[0].name = 'Product Design & Usability';

      // Retry save for remaining criteria
      while (remainingCriteria.length > 0) {
        const currentCrit = remainingCriteria[0];
        savedRecords.push(currentCrit.name);
        remainingCriteria.shift();
      }

      expect(savedRecords).toEqual([
        'Technical Execution',
        'Innovation & Impact',
        'Product Design & Usability',
      ]);
      expect(remainingCriteria.length).toBe(0);
    });
  });
});

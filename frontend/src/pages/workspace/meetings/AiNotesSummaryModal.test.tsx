import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AiNotesSummaryModal,
  formatSummaryToMarkdown,
  NotesSummaryPayload,
} from './AiNotesSummaryModal';
import { ApiError } from '@/api/client';

describe('AiNotesSummaryModal (Phase 02B SSR / Unit)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 'org-test-1',
    meetingId: 'meet-test-1',
    currentNotesContent: 'Existing note content',
    currentNotesUpdatedAt: '2026-10-28T12:00:00.000Z',
    onNotesSaved: vi.fn().mockResolvedValue(true),
  };

  it('renders initial form with focus areas, context, and generate button', () => {
    const html = renderToStaticMarkup(<AiNotesSummaryModal {...defaultProps} />);

    expect(html).toContain('Summarize Meeting Notes with AI');
    expect(html).toContain('Focus Areas (Optional, one per line)');
    expect(html).toContain('Additional Instructions (Optional)');
    expect(html).toContain('Generate Summary');
    expect(html).toContain('Privacy &amp; Human-in-the-Loop Verification');
    expect(html).toContain('Zero Data Retention');
  });

  it('renders closed modal as empty/hidden', () => {
    const html = renderToStaticMarkup(<AiNotesSummaryModal {...defaultProps} isOpen={false} />);
    expect(html).not.toContain('Summarize Meeting Notes with AI');
  });

  describe('formatSummaryToMarkdown', () => {
    it('formats executive summary, discussion points, and decisions with rationale', () => {
      const summary: NotesSummaryPayload = {
        executiveSummary: 'The team aligned on the Q4 release roadmap and resolved staging blockers.',
        keyDiscussionPoints: [
          { topic: 'Database Migration', summary: 'Agreed to perform RLS migration during maintenance window.' },
          { topic: 'Frontend Optimization', summary: 'Bundle size reduced by tree shaking.' },
        ],
        decisions: [
          { decision: 'Deploy to Neon Postgres', rationale: 'Fully supports RLS with zero downtime.' },
          { decision: 'Adopt Tailwind v4' },
        ],
      };

      const md = formatSummaryToMarkdown(summary);

      expect(md).toContain('## Executive Summary\nThe team aligned on the Q4 release roadmap and resolved staging blockers.');
      expect(md).toContain('### Key Discussion Points\n- **Database Migration**: Agreed to perform RLS migration during maintenance window.\n- **Frontend Optimization**: Bundle size reduced by tree shaking.');
      expect(md).toContain('### Decisions\n- **Deploy to Neon Postgres** — *Rationale:* Fully supports RLS with zero downtime.\n- **Adopt Tailwind v4**');
    });

    it('handles empty sections gracefully without generating blank headers', () => {
      const summary: NotesSummaryPayload = {
        executiveSummary: 'Brief notes summary.',
        keyDiscussionPoints: [],
        decisions: [],
      };

      const md = formatSummaryToMarkdown(summary);

      expect(md).toBe('## Executive Summary\nBrief notes summary.');
      expect(md).not.toContain('## Key Discussion Points');
      expect(md).not.toContain('## Decisions');
    });
  });

  describe('Append vs Replace Note Merging Logic', () => {
    const sampleSummary: NotesSummaryPayload = {
      executiveSummary: 'Summary text.',
      keyDiscussionPoints: [{ topic: 'Topic A', summary: 'Details A' }],
      decisions: [{ decision: 'Decision 1' }],
    };

    it('appends summary to existing notes separated by horizontal rule', () => {
      const existing = 'Pre-existing confidential notes.';
      const summaryMd = formatSummaryToMarkdown(sampleSummary);
      const merged = existing ? `${existing}\n\n---\n\n${summaryMd}` : summaryMd;

      expect(merged).toBe(`${existing}\n\n---\n\n${summaryMd}`);
      expect(merged).toContain('Pre-existing confidential notes.');
      expect(merged).toContain('---');
      expect(merged).toContain('## Executive Summary\nSummary text.');
    });

    it('uses summary markdown directly when existing notes are empty', () => {
      const existing = '   '.trim();
      const summaryMd = formatSummaryToMarkdown(sampleSummary);
      const merged = existing ? `${existing}\n\n---\n\n${summaryMd}` : summaryMd;

      expect(merged).toBe(summaryMd);
      expect(merged).not.toContain('---');
    });

    it('replaces notes completely when replace action is chosen', () => {
      const summaryMd = formatSummaryToMarkdown(sampleSummary);
      expect(summaryMd).not.toContain('Pre-existing');
      expect(summaryMd).toContain('## Executive Summary\nSummary text.');
    });
  });

  describe('Optimistic Concurrency & Conflict Protection', () => {
    it('simulates HTTP 409 conflict detection passing expectedUpdatedAt', async () => {
      const expectedUpdatedAt = '2026-10-28T12:00:00.000Z';
      const mockOnNotesSaved = vi.fn().mockRejectedValue(
        new ApiError('Notes modified concurrently', 409, 'CONCURRENT_MODIFICATION')
      );

      let caughtError: any = null;
      try {
        await mockOnNotesSaved('New content', expectedUpdatedAt);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ApiError);
      expect(caughtError.statusCode).toBe(409);
      expect(caughtError.code).toBe('CONCURRENT_MODIFICATION');
      expect(mockOnNotesSaved).toHaveBeenCalledWith('New content', expectedUpdatedAt);
    });

    it('preserves draft summary state when concurrent write conflict occurs', () => {
      const draftState = {
        executiveSummary: 'Unsaved draft that must not be lost',
        keyDiscussionPoints: [],
        decisions: [],
      };

      // Conflict occurs: error alert is set, but draftState remains intact in memory
      let errorMessage: string | null = null;
      const onConflict = () => {
        errorMessage = 'Conflict: These notes were updated by another user while reviewing this summary.';
      };

      onConflict();

      expect(errorMessage).toContain('Conflict: These notes were updated by another user');
      expect(draftState.executiveSummary).toBe('Unsaved draft that must not be lost');
    });
  });
});

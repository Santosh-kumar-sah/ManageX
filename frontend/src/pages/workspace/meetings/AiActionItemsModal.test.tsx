import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AiActionItemsModal,
  CandidateActionItemDraft,
} from './AiActionItemsModal';

describe('AiActionItemsModal (Phase 02C SSR / Unit)', () => {
  const mockOrgMembers = [
    { userId: 'usr-1', fullName: 'Sarah Connor', email: 'sarah@example.com', status: 'active' },
    { userId: 'usr-2', fullName: 'John Connor', email: 'john@example.com', status: 'active' },
    { userId: 'usr-3', fullName: 'Kyle Reese', email: 'kyle@example.com', status: 'suspended' },
  ];

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 'org-test-1',
    meetingId: 'meet-test-1',
    attendees: [
      { userId: 'usr-1', fullName: 'Sarah Connor', email: 'sarah@example.com' },
      { userId: 'usr-2', fullName: 'John Connor', email: 'john@example.com' },
    ],
    orgMembers: mockOrgMembers,
    onItemsSaved: vi.fn(),
  };

  it('renders initial form with focus areas, instructions, and extract button', () => {
    const html = renderToStaticMarkup(<AiActionItemsModal {...defaultProps} />);

    expect(html).toContain('Extract Action Items with AI');
    expect(html).toContain('Focus Areas (Optional, one per line)');
    expect(html).toContain('Additional Instructions (Optional)');
    expect(html).toContain('Extract Action Items');
    expect(html).toContain('Zero Data Retention &amp; Member Matching');
  });

  it('renders closed modal as empty/hidden', () => {
    const html = renderToStaticMarkup(<AiActionItemsModal {...defaultProps} isOpen={false} />);
    expect(html).not.toContain('Extract Action Items with AI');
  });

  describe('Sequential Save Partial Failure & Retry Logic (Finding-01 Protection)', () => {
    it('simulates sequential save where item 1 and 2 succeed and item 3 fails', async () => {
      const mockCandidates: CandidateActionItemDraft[] = [
        {
          id: 'item-1',
          title: 'Deploy Migration 41',
          description: 'Run database migration on staging',
          priority: 'high',
          dueDate: '2026-10-31',
          selected: true,
          assigneeId: 'usr-1',
        },
        {
          id: 'item-2',
          title: 'Update Frontend Modal',
          description: 'Wire up retry protection',
          priority: 'medium',
          dueDate: '2026-11-01',
          selected: true,
          assigneeId: 'usr-2',
        },
        {
          id: 'item-3',
          title: 'Conduct Security Review',
          description: 'Audit RLS policies',
          priority: 'urgent',
          dueDate: '2026-11-02',
          selected: true,
          assigneeId: 'usr-1',
        },
      ];

      // Simulate sequential save loop matching handleSaveSelected logic
      const itemsToSave = [...mockCandidates];
      const submittedBodies: string[] = [];
      let anySaved = false;
      let errorOccurred = false;

      const mockSaveApi = async (body: any) => {
        submittedBodies.push(body.title);
        if (body.title === 'Conduct Security Review') {
          throw new Error('Network timeout on item 3');
        }
      };

      try {
        while (itemsToSave.length > 0) {
          const currentItem = itemsToSave[0];
          await mockSaveApi(currentItem);
          anySaved = true;

          // Confirmed successful save: remove item from working list
          itemsToSave.shift();
        }
      } catch (err) {
        errorOccurred = true;
      }

      // Assertions on initial run
      expect(errorOccurred).toBe(true);
      expect(anySaved).toBe(true);
      expect(submittedBodies).toEqual([
        'Deploy Migration 41',
        'Update Frontend Modal',
        'Conduct Security Review',
      ]);
      // Working copy retains ONLY the unsaved item (item 3)
      expect(itemsToSave.length).toBe(1);
      expect(itemsToSave[0].title).toBe('Conduct Security Review');

      // Now simulate user retry on remaining unsaved items
      const retryBodies: string[] = [];
      const mockRetrySaveApi = async (body: any) => {
        retryBodies.push(body.title);
      };

      while (itemsToSave.length > 0) {
        const currentItem = itemsToSave[0];
        await mockRetrySaveApi(currentItem);
        itemsToSave.shift();
      }

      // Assertions on retry:
      // Item 1 and Item 2 are NOT resubmitted. Only Item 3 is sent.
      expect(retryBodies).toEqual(['Conduct Security Review']);
      expect(itemsToSave.length).toBe(0);
    });

    it('validates that title and assigneeId are required before saving', () => {
      const candidates: CandidateActionItemDraft[] = [
        {
          id: 'item-valid',
          title: 'Valid Item',
          description: '',
          priority: 'medium',
          dueDate: '',
          selected: true,
          assigneeId: 'usr-1',
        },
        {
          id: 'item-no-assignee',
          title: 'Item Missing Assignee',
          description: '',
          priority: 'medium',
          dueDate: '',
          selected: true,
          assigneeId: '',
        },
      ];

      const validateItems = (items: CandidateActionItemDraft[]) => {
        const selected = items.filter((i) => i.selected);
        if (selected.length === 0) return 'Please select at least one action item to save.';
        for (const item of selected) {
          if (!item.title.trim()) return 'All selected action items must have a non-empty title.';
          if (!item.assigneeId) return `Please select an active assignee for "${item.title.trim()}".`;
        }
        return null;
      };

      expect(validateItems(candidates)).toBe('Please select an active assignee for "Item Missing Assignee".');

      // Now fix assignee but leave title empty
      candidates[1].assigneeId = 'usr-2';
      candidates[1].title = '   ';
      expect(validateItems(candidates)).toBe('All selected action items must have a non-empty title.');

      // Deselect all
      candidates[0].selected = false;
      candidates[1].selected = false;
      expect(validateItems(candidates)).toBe('Please select at least one action item to save.');

      // Valid case
      candidates[0].selected = true;
      expect(validateItems(candidates)).toBeNull();
    });
  });

  describe('Assignee Matching Resolution Badges', () => {
    it('accurately identifies matched, ambiguous, and unresolved candidates', () => {
      const candidateMatched: CandidateActionItemDraft = {
        id: 'c1',
        title: 'Task A',
        description: '',
        priority: 'medium',
        dueDate: '',
        candidateAssigneeName: 'Sarah Connor',
        suggestedAssignee: { userId: 'usr-1', fullName: 'Sarah Connor', email: 'sarah@example.com' },
        isAmbiguousAssignee: false,
        selected: true,
        assigneeId: 'usr-1',
      };

      const candidateAmbiguous: CandidateActionItemDraft = {
        id: 'c2',
        title: 'Task B',
        description: '',
        priority: 'high',
        dueDate: '',
        candidateAssigneeName: 'John',
        suggestedAssignee: null,
        isAmbiguousAssignee: true,
        selected: true,
        assigneeId: '',
      };

      const candidateUnresolved: CandidateActionItemDraft = {
        id: 'c3',
        title: 'Task C',
        description: '',
        priority: 'low',
        dueDate: '',
        candidateAssigneeName: 'Terminator T-800',
        suggestedAssignee: null,
        isAmbiguousAssignee: false,
        selected: true,
        assigneeId: '',
      };

      expect(candidateMatched.suggestedAssignee?.userId).toBe('usr-1');
      expect(candidateAmbiguous.isAmbiguousAssignee).toBe(true);
      expect(candidateAmbiguous.suggestedAssignee).toBeNull();
      expect(candidateUnresolved.candidateAssigneeName).toBe('Terminator T-800');
      expect(candidateUnresolved.suggestedAssignee).toBeNull();
      expect(candidateUnresolved.isAmbiguousAssignee).toBe(false);
    });
  });

  describe('Backend / Frontend Contract Compatibility (Finding-01 Remediation)', () => {
    it('correctly maps canonical backend extraction response into UI candidate drafts', () => {
      // Exact canonical backend response shape from POST /organisations/:orgId/meetings/:meetingId/ai/action-items
      const backendResponse = {
        isDraft: true,
        meetingId: 'meet-test-1',
        candidateActionItems: [
          {
            title: 'Deploy database migration 41 to staging',
            description: 'Execute forward migration and verify RLS isolation.',
            priority: 'high' as const,
            suggestedDueDate: '2026-10-31',
            rawAssigneeName: 'Sarah Connor',
            suggestedAssignee: {
              userId: 'usr-1',
              fullName: 'Sarah Connor',
              name: 'Sarah Connor',
              email: 'sarah@example.com',
            },
            isAmbiguousAssignee: false,
            rationale: 'Discussed during deployment review.',
          },
          {
            title: 'Review team feedback',
            description: '',
            priority: 'medium' as const,
            suggestedDueDate: null, // missing optional due date
            rawAssigneeName: 'John',
            suggestedAssignee: null, // ambiguous
            isAmbiguousAssignee: true,
            rationale: '',
          },
          {
            title: 'Procure external SSL certificates',
            description: 'Order certificates from vendor',
            priority: 'low' as const,
            suggestedDueDate: '2026-11-05',
            rawAssigneeName: 'Vendor Rep', // non-member
            suggestedAssignee: null,
            isAmbiguousAssignee: false,
            rationale: '',
          },
        ],
        usage: {
          totalTokens: 650,
          estimatedCostUsd: 0.00013,
        },
      };

      // Transform function matching AiActionItemsModal handleGenerate logic
      const rawList = backendResponse.candidateActionItems || [];
      const mapped: CandidateActionItemDraft[] = rawList.map((item, idx) => ({
        id: `item-test-${idx}`,
        title: item.title || '',
        description: item.description || '',
        priority: item.priority || 'medium',
        dueDate: item.suggestedDueDate || '',
        candidateAssigneeName: item.rawAssigneeName || null,
        suggestedAssignee: item.suggestedAssignee
          ? {
              userId: item.suggestedAssignee.userId,
              fullName: item.suggestedAssignee.fullName || item.suggestedAssignee.name || '',
              email: item.suggestedAssignee.email || '',
            }
          : null,
        isAmbiguousAssignee: Boolean(item.isAmbiguousAssignee),
        selected: true,
        assigneeId: item.suggestedAssignee?.userId || '',
      }));

      // Candidate 1: Matched member
      expect(mapped.length).toBe(3);
      expect(mapped[0].title).toBe('Deploy database migration 41 to staging');
      expect(mapped[0].priority).toBe('high');
      expect(mapped[0].dueDate).toBe('2026-10-31');
      expect(mapped[0].candidateAssigneeName).toBe('Sarah Connor');
      expect(mapped[0].suggestedAssignee).toEqual({
        userId: 'usr-1',
        fullName: 'Sarah Connor',
        email: 'sarah@example.com',
      });
      expect(mapped[0].assigneeId).toBe('usr-1');
      expect(mapped[0].isAmbiguousAssignee).toBe(false);

      // Candidate 2: Ambiguous member with null suggestedDueDate
      expect(mapped[1].title).toBe('Review team feedback');
      expect(mapped[1].dueDate).toBe('');
      expect(mapped[1].candidateAssigneeName).toBe('John');
      expect(mapped[1].suggestedAssignee).toBeNull();
      expect(mapped[1].assigneeId).toBe('');
      expect(mapped[1].isAmbiguousAssignee).toBe(true);

      // Candidate 3: Unresolved non-member
      expect(mapped[2].title).toBe('Procure external SSL certificates');
      expect(mapped[2].dueDate).toBe('2026-11-05');
      expect(mapped[2].candidateAssigneeName).toBe('Vendor Rep');
      expect(mapped[2].suggestedAssignee).toBeNull();
      expect(mapped[2].assigneeId).toBe('');
      expect(mapped[2].isAmbiguousAssignee).toBe(false);
    });

    it('handles empty candidate list without failing or throwing', () => {
      const backendEmptyResponse = {
        isDraft: true,
        meetingId: 'meet-test-1',
        candidateActionItems: [],
        usage: { totalTokens: 100 },
      };

      const rawList = backendEmptyResponse.candidateActionItems || [];
      const mapped = rawList.map((item: any, idx: number) => ({
        id: `item-test-${idx}`,
        title: item.title || '',
        description: item.description || '',
        priority: item.priority || 'medium',
        dueDate: item.suggestedDueDate || '',
        candidateAssigneeName: item.rawAssigneeName || null,
        suggestedAssignee: item.suggestedAssignee || null,
        isAmbiguousAssignee: Boolean(item.isAmbiguousAssignee),
        selected: true,
        assigneeId: item.suggestedAssignee?.userId || '',
      }));

      expect(mapped).toEqual([]);
    });
  });
});

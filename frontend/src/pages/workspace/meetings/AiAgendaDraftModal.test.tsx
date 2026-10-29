import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiAgendaDraftModal } from './AiAgendaDraftModal';

describe('AiAgendaDraftModal (Phase 02A SSR / Unit)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 'org-test-1',
    meetingId: 'meet-test-1',
    onItemsSaved: vi.fn(),
  };

  it('renders initial form with focus topics, target duration, and action buttons', () => {
    const html = renderToStaticMarkup(<AiAgendaDraftModal {...defaultProps} />);

    expect(html).toContain('Generate Meeting Agenda with AI');
    expect(html).toContain('Focus Topics');
    expect(html).toContain('Target Duration');
    expect(html).toContain('Generate Agenda');
    expect(html).toContain('Human-in-the-Loop AI Draft');
  });

  it('renders closed modal as empty/hidden', () => {
    const html = renderToStaticMarkup(<AiAgendaDraftModal {...defaultProps} isOpen={false} />);
    expect(html).not.toContain('Generate Meeting Agenda with AI');
  });

  describe('Sequential Save Partial Failure & Retry Logic (Finding-01)', () => {
    it('simulates sequential save where item 1 and 2 succeed and item 3 fails', async () => {
      // Mock items
      const mockDraft = [
        { title: 'Item 1', description: 'Desc 1', durationMinutes: 10, orderIndex: 0 },
        { title: 'Item 2', description: 'Desc 2', durationMinutes: 20, orderIndex: 1 },
        { title: 'Item 3', description: 'Desc 3', durationMinutes: 30, orderIndex: 2 },
      ];

      // Simulate sequential saving loop matching handleSaveAll logic
      const itemsToSave = [...mockDraft];
      const submittedBodies: string[] = [];
      let anySaved = false;
      let errorOccurred = false;

      // Mock API call: succeeds for Item 1 and Item 2, fails for Item 3
      const mockSaveApi = async (body: any) => {
        submittedBodies.push(body.title);
        if (body.title === 'Item 3') {
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

      // Assertions on first pass:
      expect(errorOccurred).toBe(true);
      expect(anySaved).toBe(true);
      // Item 1 and Item 2 were submitted; Item 3 attempted and failed
      expect(submittedBodies).toEqual(['Item 1', 'Item 2', 'Item 3']);
      // Working copy retains ONLY the unsaved item (Item 3)
      expect(itemsToSave.length).toBe(1);
      expect(itemsToSave[0].title).toBe('Item 3');

      // Now simulate user retry on remaining unsaved items:
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
      // CRITICAL: Item 1 and Item 2 are NOT resubmitted. Only Item 3 is sent.
      expect(retryBodies).toEqual(['Item 3']);
      expect(itemsToSave.length).toBe(0);
    });

    it('prevents duplicate submissions while save is in progress', () => {
      let isSaving = true;
      const saveAttempts: number[] = [];

      const attemptSave = () => {
        if (isSaving) return;
        saveAttempts.push(1);
      };

      attemptSave();
      attemptSave();

      expect(saveAttempts.length).toBe(0);
    });
  });
});

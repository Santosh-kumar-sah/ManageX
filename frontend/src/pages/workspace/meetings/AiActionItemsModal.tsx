import React, { useState, useMemo } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/api/client';
import {
  Sparkles,
  Check,
  CheckSquare,
  AlertTriangle,
  UserCheck,
  UserX,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react';

export interface ExtractedCandidateActionItem {
  title: string;
  description?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  suggestedDueDate?: string | null;
  rawAssigneeName?: string | null;
  suggestedAssignee?: {
    userId: string;
    fullName: string;
    name?: string;
    email: string;
  } | null;
  isAmbiguousAssignee?: boolean;
  rationale?: string;
}

export interface ExtractActionItemsApiResponse {
  isDraft: boolean;
  meetingId: string;
  candidateActionItems: ExtractedCandidateActionItem[];
  usage?: {
    totalTokens: number;
    estimatedCostUsd?: number;
  };
}

export interface CandidateActionItemDraft {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate: string;
  candidateAssigneeName?: string | null;
  suggestedAssignee?: {
    userId: string;
    fullName: string;
    email: string;
  } | null;
  isAmbiguousAssignee?: boolean;
  selected: boolean;
  assigneeId: string;
}

export interface AiActionItemsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  meetingId: string;
  attendees?: Array<{ userId?: string | null; fullName?: string | null; email?: string | null }>;
  orgMembers?: Array<{ userId: string; fullName: string; email: string; status: string }>;
  onItemsSaved: () => Promise<void> | void;
}

export function AiActionItemsModal({
  isOpen,
  onClose,
  orgId,
  meetingId,
  attendees = [],
  orgMembers = [],
  onItemsSaved,
}: AiActionItemsModalProps) {
  const [focusAreas, setFocusAreas] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftItems, setDraftItems] = useState<CandidateActionItemDraft[] | null>(null);
  const [usageTokens, setUsageTokens] = useState<number | null>(null);

  // Active organisation members available for assignment (MTG-006), attendees prioritized
  const activeMembers = useMemo(() => {
    const list = orgMembers.filter((m) => m.status === 'active');
    const attendeeUserIds = new Set(
      attendees.map((a) => a.userId).filter((id): id is string => Boolean(id))
    );
    return list.sort((a, b) => {
      const aIsAttendee = attendeeUserIds.has(a.userId) ? 1 : 0;
      const bIsAttendee = attendeeUserIds.has(b.userId) ? 1 : 0;
      if (aIsAttendee !== bIsAttendee) return bIsAttendee - aIsAttendee;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [orgMembers, attendees]);

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setError(null);

    const areas = focusAreas
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      const res = await apiClient<ExtractActionItemsApiResponse>(
        `/organisations/${orgId}/meetings/${meetingId}/ai/action-items`,
        {
          method: 'POST',
          body: JSON.stringify({
            focusAreas: areas.length > 0 ? areas : undefined,
            additionalInstructions: additionalInstructions.trim() || undefined,
          }),
        }
      );

      if (res.data) {
        const rawList = res.data.candidateActionItems || [];
        const mapped: CandidateActionItemDraft[] = rawList.map((item, idx) => ({
          id: `item-${Date.now()}-${idx}`,
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

        setDraftItems(mapped);
        if (res.data.usage?.totalTokens) {
          setUsageTokens(res.data.usage.totalTokens);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract action items from meeting notes.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClose = () => {
    setDraftItems(null);
    setError(null);
    setFocusAreas('');
    setAdditionalInstructions('');
    setUsageTokens(null);
    onClose();
  };

  const handleToggleSelectAll = () => {
    if (!draftItems) return;
    const allSelected = draftItems.every((i) => i.selected);
    setDraftItems(draftItems.map((i) => ({ ...i, selected: !allSelected })));
  };

  const handleToggleItem = (id: string) => {
    if (!draftItems) return;
    setDraftItems(draftItems.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)));
  };

  const handleUpdateItem = (id: string, field: keyof CandidateActionItemDraft, val: any) => {
    if (!draftItems) return;
    setDraftItems(
      draftItems.map((i) => {
        if (i.id !== id) return i;
        return { ...i, [field]: val };
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    if (!draftItems) return;
    setDraftItems(draftItems.filter((i) => i.id !== id));
  };

  const handleAddItem = () => {
    const newItem: CandidateActionItemDraft = {
      id: `item-${Date.now()}-${Math.random()}`,
      title: '',
      description: '',
      priority: 'medium',
      dueDate: '',
      candidateAssigneeName: null,
      suggestedAssignee: null,
      isAmbiguousAssignee: false,
      selected: true,
      assigneeId: '',
    };
    setDraftItems([...(draftItems || []), newItem]);
  };

  const handleSaveSelected = async () => {
    if (!draftItems || isSaving) return;
    const itemsToSave = draftItems.filter((i) => i.selected);

    if (itemsToSave.length === 0) {
      setError('Please select at least one action item to save.');
      return;
    }

    // Validation: title and assignee are required by MTG-006
    for (const item of itemsToSave) {
      if (!item.title.trim()) {
        setError('All selected action items must have a non-empty title.');
        return;
      }
      if (!item.assigneeId) {
        setError(`Please select an active assignee for "${item.title.trim()}".`);
        return;
      }
    }

    setIsSaving(true);
    setError(null);
    let anySaved = false;
    const remaining = [...draftItems];

    try {
      while (itemsToSave.length > 0) {
        const currentItem = itemsToSave[0];
        await apiClient(`/organisations/${orgId}/meetings/${meetingId}/action-items`, {
          method: 'POST',
          body: JSON.stringify({
            title: currentItem.title.trim(),
            description: currentItem.description.trim() || undefined,
            assigneeId: currentItem.assigneeId,
            dueDate: currentItem.dueDate.trim() || undefined,
            priority: currentItem.priority,
          }),
        });

        anySaved = true;

        // Confirmed successful save: remove item from working copy and state (Finding-01 retry safety)
        itemsToSave.shift();
        const idx = remaining.findIndex((r) => r.id === currentItem.id);
        if (idx !== -1) {
          remaining.splice(idx, 1);
          setDraftItems([...remaining]);
        }
      }

      await onItemsSaved();
      handleClose();
    } catch (err) {
      if (anySaved) {
        await onItemsSaved();
      }
      setError(
        err instanceof Error
          ? `${err.message} Remaining items have been kept for review and retry.`
          : 'Failed to save remaining action items.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = (draftItems || []).filter((i) => i.selected).length;
  const totalCount = (draftItems || []).length;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={draftItems ? 'Review Extracted Action Items' : 'Extract Action Items with AI'}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="error" data-testid="ai-action-items-error-alert">
            {error}
          </Alert>
        )}

        {!draftItems ? (
          <form onSubmit={handleGenerate} className="space-y-4" data-testid="ai-actions-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Focus Areas (Optional, one per line)
              </label>
              <textarea
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
                placeholder="e.g.&#10;Database migration deliverables&#10;Frontend review tasks&#10;Client follow-ups"
                rows={3}
                disabled={isGenerating}
                className="w-full text-sm rounded-md border border-slate-300 p-2 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                data-testid="ai-actions-focus-areas-input"
              />
              <p className="text-xs text-slate-400 mt-1">
                Optionally specify particular project deliverables or workstreams to prioritize for extraction.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Additional Instructions (Optional)
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="e.g. Default due dates to next Monday unless specified. Ensure Sarah is assigned database tasks."
                rows={2}
                disabled={isGenerating}
                className="w-full text-sm rounded-md border border-slate-300 p-2 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                data-testid="ai-actions-instructions-input"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                Zero Data Retention & Member Matching
              </p>
              <p>
                ManageX AI analyzes confidential notes, discussion points, and recorded decisions. Candidate assignees
                are deterministically matched against active members in your organisation. All extracted items are
                ephemeral drafts and require explicit review before saving.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isGenerating}
                className="flex items-center gap-1.5"
                data-testid="generate-action-items-btn"
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Extracting Action Items...' : 'Extract Action Items'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4" data-testid="ai-actions-draft-review">
            {/* Header / Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleToggleSelectAll}
                  className="text-xs h-7 px-2"
                  data-testid="toggle-select-all-btn"
                >
                  {selectedCount === totalCount && totalCount > 0 ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="font-medium text-slate-700" data-testid="selected-count-badge">
                  {selectedCount} of {totalCount} item{totalCount === 1 ? '' : 's'} selected
                </span>
                {usageTokens && (
                  <Badge variant="neutral" className="text-xs">
                    {usageTokens} tokens
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating || isSaving}
                  className="text-xs h-7 px-2 flex items-center gap-1"
                  data-testid="regenerate-actions-btn"
                >
                  <RefreshCw className={`h-3 w-3 ${isGenerating ? 'animate-spin' : ''}`} />
                  Re-extract
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  disabled={isSaving}
                  className="text-xs h-7 px-2 flex items-center gap-1"
                  data-testid="add-draft-item-btn"
                >
                  <Plus className="h-3 w-3" />
                  Add Item
                </Button>
              </div>
            </div>

            {totalCount === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm border border-dashed rounded-md">
                <CheckSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-medium text-slate-700">No action items detected in notes.</p>
                <p className="text-xs text-slate-500 mt-1">
                  You can add an item manually using the button above or re-run with additional instructions.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {draftItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-lg border transition-all ${
                      item.selected ? 'border-brand-200 bg-white shadow-xs' : 'border-slate-200 bg-slate-50/60 opacity-80'
                    }`}
                    data-testid={`candidate-item-${index}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleItem(item.id)}
                          aria-label={`Select action item ${item.title || index + 1}`}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          data-testid={`item-checkbox-${index}`}
                        />
                      </div>

                      <div className="flex-1 space-y-2.5">
                        {/* Title and Delete */}
                        <div className="flex items-center gap-2">
                          <Input
                            value={item.title}
                            onChange={(e) => handleUpdateItem(item.id, 'title', e.target.value)}
                            placeholder="Action item title (required)"
                            className="font-medium text-sm h-8"
                            data-testid={`item-title-${index}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-slate-400 hover:text-red-600 p-1 h-8 w-8"
                            title="Remove item"
                            data-testid={`remove-item-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Description */}
                        <div>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                            placeholder="Optional details or context..."
                            className="w-full text-xs rounded border border-slate-200 px-2 py-1 text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
                            data-testid={`item-desc-${index}`}
                          />
                        </div>

                        {/* Candidate Matching Status & Controls */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {/* Assignee Match Badge */}
                          {item.suggestedAssignee ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-emerald-700 bg-emerald-50 border border-emerald-200 font-medium"
                              data-testid={`item-matched-badge-${index}`}
                            >
                              <UserCheck className="h-3 w-3" />
                              Matched: {item.suggestedAssignee.fullName}
                            </span>
                          ) : item.isAmbiguousAssignee ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-amber-700 bg-amber-50 border border-amber-200 font-medium"
                              data-testid={`item-ambiguous-badge-${index}`}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              Ambiguous candidate "{item.candidateAssigneeName}" — multiple matches
                            </span>
                          ) : item.candidateAssigneeName ? (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-slate-600 bg-slate-100 border border-slate-200 font-medium"
                              data-testid={`item-unresolved-badge-${index}`}
                            >
                              <UserX className="h-3 w-3" />
                              Candidate "{item.candidateAssigneeName}" not in organisation
                            </span>
                          ) : null}

                          {/* Assignee Selector (Required) */}
                          <div className="flex items-center gap-1 ml-auto">
                            <label className="text-slate-500 font-medium">Assignee:</label>
                            <select
                              value={item.assigneeId}
                              onChange={(e) => handleUpdateItem(item.id, 'assigneeId', e.target.value)}
                              className={`text-xs rounded border px-2 py-1 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                                !item.assigneeId ? 'border-amber-300 text-amber-900 bg-amber-50/40' : 'border-slate-300 text-slate-800'
                              }`}
                              data-testid={`item-assignee-select-${index}`}
                            >
                              <option value="">Select Assignee (Required)...</option>
                              {activeMembers.map((m) => (
                                <option key={m.userId} value={m.userId}>
                                  {m.fullName} ({m.email})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Priority Selector */}
                          <div className="flex items-center gap-1">
                            <label className="text-slate-500 font-medium">Priority:</label>
                            <select
                              value={item.priority}
                              onChange={(e) => handleUpdateItem(item.id, 'priority', e.target.value as any)}
                              className="text-xs rounded border border-slate-300 px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              data-testid={`item-priority-select-${index}`}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>

                          {/* Due Date Input */}
                          <div className="flex items-center gap-1">
                            <label className="text-slate-500 font-medium">Due:</label>
                            <input
                              type="date"
                              value={item.dueDate}
                              onChange={(e) => handleUpdateItem(item.id, 'dueDate', e.target.value)}
                              className="text-xs rounded border border-slate-300 px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
                              data-testid={`item-duedate-input-${index}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSaving}
                data-testid="discard-draft-btn"
              >
                Discard Draft
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSaveSelected}
                  disabled={isSaving || selectedCount === 0}
                  className="flex items-center gap-1.5"
                  data-testid="save-selected-actions-btn"
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? 'Saving Action Items...' : `Save ${selectedCount} Action Item${selectedCount === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

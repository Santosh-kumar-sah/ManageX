import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { Sparkles, Trash2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface SuggestedItem {
  title: string;
  description: string;
  durationMinutes: number;
  orderIndex: number;
}

interface AiAgendaDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  meetingId: string;
  onItemsSaved: () => Promise<void>;
}

export function AiAgendaDraftModal({
  isOpen,
  onClose,
  orgId,
  meetingId,
  onItemsSaved,
}: AiAgendaDraftModalProps) {
  const [focusTopics, setFocusTopics] = useState('');
  const [targetDuration, setTargetDuration] = useState<number | ''>('');
  const [additionalContext, setAdditionalContext] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftItems, setDraftItems] = useState<SuggestedItem[] | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);

    const topics = focusTopics
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await apiClient<{
        isDraft: boolean;
        suggestedAgendaItems: SuggestedItem[];
      }>(`/organisations/${orgId}/meetings/${meetingId}/ai/agenda`, {
        method: 'POST',
        body: JSON.stringify({
          focusTopics: topics,
          targetDurationMinutes: targetDuration ? Number(targetDuration) : undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      if (res.data?.suggestedAgendaItems) {
        setDraftItems(res.data.suggestedAgendaItems);
      } else {
        setError('No agenda items were returned by the AI provider.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          setError('Monthly AI token quota exceeded for this organisation. Please upgrade quota in Settings.');
        } else if (err.statusCode === 403) {
          setError('AI features are disabled or you lack permission to edit this meeting.');
        } else if (err.statusCode === 409) {
          setError('Cannot generate agenda for a completed or cancelled meeting.');
        } else {
          setError(err.message || 'Failed to generate AI agenda.');
        }
      } else {
        setError((err as Error).message || 'Failed to generate AI agenda.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateItem = (index: number, field: keyof SuggestedItem, value: any) => {
    if (!draftItems) return;
    const updated = [...draftItems];
    updated[index] = { ...updated[index], [field]: value };
    setDraftItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (!draftItems) return;
    const updated = draftItems.filter((_, i) => i !== index);
    setDraftItems(updated.map((item, idx) => ({ ...item, orderIndex: idx })));
  };

  const handleSaveAll = async () => {
    if (!draftItems || draftItems.length === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);

    // Keep a working copy of items to save
    const itemsToSave = [...draftItems];
    let anySaved = false;

    try {
      while (itemsToSave.length > 0) {
        const currentItem = itemsToSave[0];
        if (currentItem.title.trim()) {
          await apiClient(`/organisations/${orgId}/meetings/${meetingId}/agenda`, {
            method: 'POST',
            body: JSON.stringify({
              title: currentItem.title.trim(),
              description: currentItem.description.trim() || undefined,
              durationMinutes: currentItem.durationMinutes ? Number(currentItem.durationMinutes) : undefined,
              orderIndex: currentItem.orderIndex,
            }),
          });
          anySaved = true;
        }

        // Confirmed successful save: remove item from working copy and state
        itemsToSave.shift();
        setDraftItems([...itemsToSave]);
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
          : 'Failed to save remaining agenda items.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setDraftItems(null);
    setError(null);
    setFocusTopics('');
    setTargetDuration('');
    setAdditionalContext('');
    onClose();
  };

  const totalDraftDuration = (draftItems || []).reduce(
    (sum, item) => sum + (Number(item.durationMinutes) || 0),
    0
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Generate Meeting Agenda with AI"
      description="Create a structured discussion agenda using ManageX AI. Review and edit items before saving."
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="error" data-testid="ai-agenda-error">
            <AlertCircle className="h-4 w-4 mr-1 inline" />
            {error}
          </Alert>
        )}

        {!draftItems ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Focus Topics (One per line, optional)
              </label>
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                rows={3}
                placeholder="e.g. Q4 Release Roadmap&#10;Architecture Modernization&#10;Team Retrospective"
                value={focusTopics}
                onChange={(e) => setFocusTopics(e.target.value)}
                disabled={isGenerating}
                data-testid="ai-focus-topics-input"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Target Duration (Minutes, optional)
                </label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  placeholder="e.g. 60"
                  value={targetDuration}
                  onChange={(e) => setTargetDuration(e.target.value ? Number(e.target.value) : '')}
                  disabled={isGenerating}
                  data-testid="ai-target-duration-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Additional Context (Optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Reserve last 10m for Q&A"
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  disabled={isGenerating}
                  data-testid="ai-additional-context-input"
                />
              </div>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-md text-xs text-indigo-900 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Human-in-the-Loop AI Draft</p>
                <p className="text-indigo-700">
                  ManageX analyzes the scheduled meeting title, description, and attendee roles.
                  Draft agenda items are returned to you for review and editing before anything is saved.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isGenerating}
                className="flex items-center gap-1.5"
                data-testid="generate-ai-agenda-btn"
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Generating Draft...' : 'Generate Agenda'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4" data-testid="ai-draft-review-container">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b">
              <span>
                {draftItems.length} suggested item{draftItems.length === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Total Duration: <strong>{totalDraftDuration}m</strong>
              </span>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {draftItems.map((item, index) => (
                <div
                  key={index}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 relative group"
                  data-testid={`draft-item-${index}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-slate-400 mt-2 shrink-0 w-4">
                      {index + 1}.
                    </span>
                    <div className="flex-1 space-y-1.5">
                      <Input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                        placeholder="Agenda Title"
                        className="font-medium text-sm"
                        disabled={isSaving}
                        data-testid={`draft-title-input-${index}`}
                      />
                      <Input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                        placeholder="Description (Optional)"
                        className="text-xs text-slate-600"
                        disabled={isSaving}
                        data-testid={`draft-desc-input-${index}`}
                      />
                    </div>
                    <div className="w-20 shrink-0 flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={item.durationMinutes}
                        onChange={(e) =>
                          handleUpdateItem(index, 'durationMinutes', Number(e.target.value) || 1)
                        }
                        className="text-xs text-center"
                        disabled={isSaving}
                        data-testid={`draft-duration-input-${index}`}
                      />
                      <span className="text-xs text-slate-400">m</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      className="text-slate-400 hover:text-red-600 p-1.5 h-auto"
                      disabled={isSaving}
                      title="Remove draft item"
                      data-testid={`draft-remove-btn-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraftItems(null)}
                disabled={isSaving}
              >
                Back / Regenerate
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={isSaving}>
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSaveAll}
                  disabled={isSaving || draftItems.length === 0}
                  className="flex items-center gap-1.5"
                  data-testid="save-ai-agenda-btn"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSaving ? 'Saving Items...' : 'Save to Meeting Agenda'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { apiClient, ApiError } from '@/api/client';
import {
  Sparkles,
  Copy,
  Check,
  FilePlus2,
  FileText,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

export interface DiscussionPointSummary {
  topic: string;
  summary: string;
}

export interface DecisionSummary {
  decision: string;
  rationale?: string;
}

export interface NotesSummaryPayload {
  executiveSummary: string;
  keyDiscussionPoints: DiscussionPointSummary[];
  decisions: DecisionSummary[];
}

export interface AiNotesSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  meetingId: string;
  currentNotesContent: string;
  currentNotesUpdatedAt?: string;
  onNotesSaved: (newContent: string, expectedUpdatedAt?: string) => Promise<boolean>;
}

export function formatSummaryToMarkdown(summary: NotesSummaryPayload): string {
  const sections: string[] = [];

  if (summary.executiveSummary?.trim()) {
    sections.push(`## Executive Summary\n${summary.executiveSummary.trim()}`);
  }

  if (summary.keyDiscussionPoints && summary.keyDiscussionPoints.length > 0) {
    const points = summary.keyDiscussionPoints
      .map((p) => `- **${p.topic.trim()}**: ${p.summary.trim()}`)
      .join('\n');
    sections.push(`### Key Discussion Points\n${points}`);
  }

  if (summary.decisions && summary.decisions.length > 0) {
    const decs = summary.decisions
      .map((d) => `- **${d.decision.trim()}**${d.rationale?.trim() ? ` — *Rationale:* ${d.rationale.trim()}` : ''}`)
      .join('\n');
    sections.push(`### Decisions\n${decs}`);
  }

  return sections.join('\n\n');
}

export function AiNotesSummaryModal({
  isOpen,
  onClose,
  orgId,
  meetingId,
  currentNotesContent,
  currentNotesUpdatedAt,
  onNotesSaved,
}: AiNotesSummaryModalProps) {
  const [focusAreas, setFocusAreas] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  const [draftSummary, setDraftSummary] = useState<NotesSummaryPayload | null>(null);
  const [usageTokens, setUsageTokens] = useState<number | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    setShowReplaceConfirm(false);

    const areas = focusAreas
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);

    try {
      const res = await apiClient<{
        isDraft: boolean;
        summary: NotesSummaryPayload;
        usage?: { totalTokens: number };
      }>(`/organisations/${orgId}/meetings/${meetingId}/ai/summarize`, {
        method: 'POST',
        body: JSON.stringify({
          focusAreas: areas.length > 0 ? areas : undefined,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      if (res.data?.summary) {
        setDraftSummary(res.data.summary);
        if (res.data.usage?.totalTokens) {
          setUsageTokens(res.data.usage.totalTokens);
        }
      } else {
        setError('No summary was returned by the AI provider.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 429) {
          setError('Monthly AI token quota exceeded for this organisation. Please upgrade quota in Settings.');
        } else if (err.statusCode === 403) {
          setError('Access denied: You do not have permission to access confidential meeting notes.');
        } else if (err.statusCode === 409) {
          setError('Cannot summarize notes for a cancelled meeting.');
        } else if (err.statusCode === 422) {
          setError(
            err.message ||
              'Cannot summarize meeting: no notes, discussion points, or decisions have been recorded for this meeting.'
          );
        } else {
          setError(err.message || 'Failed to generate meeting notes summary.');
        }
      } else {
        setError((err as Error).message || 'Failed to generate meeting notes summary.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!draftSummary) return;
    const md = formatSummaryToMarkdown(draftSummary);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  };

  const handleAppend = async () => {
    if (!draftSummary || isSaving) return;
    setIsSaving(true);
    setError(null);

    const summaryMd = formatSummaryToMarkdown(draftSummary);
    const existing = currentNotesContent.trim();
    const merged = existing ? `${existing}\n\n---\n\n${summaryMd}` : summaryMd;

    try {
      const success = await onNotesSaved(merged, currentNotesUpdatedAt);
      if (success) {
        handleClose();
      }
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === 'CONCURRENT_MODIFICATION')) {
        setError(
          'Conflict: These notes were updated by another user while reviewing this summary. Your draft has been preserved. Please reload the page to review the latest notes before merging.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to append summary to meeting notes.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplace = async () => {
    if (!draftSummary || isSaving) return;
    setIsSaving(true);
    setError(null);

    const summaryMd = formatSummaryToMarkdown(draftSummary);

    try {
      const success = await onNotesSaved(summaryMd, currentNotesUpdatedAt);
      if (success) {
        handleClose();
      }
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === 'CONCURRENT_MODIFICATION')) {
        setError(
          'Conflict: These notes were updated by another user while reviewing this summary. Your draft has been preserved. Please reload the page to review the latest notes before merging.'
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to replace meeting notes.');
      }
    } finally {
      setIsSaving(false);
      setShowReplaceConfirm(false);
    }
  };

  const handleClose = () => {
    setDraftSummary(null);
    setError(null);
    setShowReplaceConfirm(false);
    setCopied(false);
    onClose();
  };

  const handleUpdateExecutiveSummary = (text: string) => {
    if (!draftSummary) return;
    setDraftSummary({ ...draftSummary, executiveSummary: text });
  };

  const handleUpdateDiscussionPoint = (index: number, field: 'topic' | 'summary', val: string) => {
    if (!draftSummary) return;
    const updated = [...draftSummary.keyDiscussionPoints];
    updated[index] = { ...updated[index], [field]: val };
    setDraftSummary({ ...draftSummary, keyDiscussionPoints: updated });
  };

  const handleRemoveDiscussionPoint = (index: number) => {
    if (!draftSummary) return;
    const updated = draftSummary.keyDiscussionPoints.filter((_, i) => i !== index);
    setDraftSummary({ ...draftSummary, keyDiscussionPoints: updated });
  };

  const handleUpdateDecision = (index: number, field: 'decision' | 'rationale', val: string) => {
    if (!draftSummary) return;
    const updated = [...draftSummary.decisions];
    updated[index] = { ...updated[index], [field]: val };
    setDraftSummary({ ...draftSummary, decisions: updated });
  };

  const handleRemoveDecision = (index: number) => {
    if (!draftSummary) return;
    const updated = draftSummary.decisions.filter((_, i) => i !== index);
    setDraftSummary({ ...draftSummary, decisions: updated });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={draftSummary ? 'Review Confidential Notes Summary' : 'Summarize Meeting Notes with AI'}
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="error" data-testid="ai-summary-error-alert">
            {error}
          </Alert>
        )}

        {!draftSummary ? (
          <form onSubmit={handleGenerate} className="space-y-4" data-testid="ai-summary-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Focus Areas (Optional, one per line)
              </label>
              <textarea
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
                placeholder="e.g.&#10;Key architecture decisions&#10;Staging deployment timelines&#10;Budget allocations"
                rows={3}
                disabled={isGenerating}
                className="w-full text-sm rounded-md border border-slate-300 p-2 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                data-testid="ai-focus-areas-input"
              />
              <p className="text-xs text-slate-400 mt-1">
                Provide specific subjects to emphasize in the executive summary and discussion takeaways.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Additional Instructions (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. Keep executive summary under 3 sentences."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                disabled={isGenerating}
                data-testid="ai-summary-context-input"
              />
            </div>

            <div className="p-3 bg-brand-50/70 border border-brand-100 rounded-md text-xs text-brand-900 flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Privacy & Human-in-the-Loop Verification</p>
                <p className="text-brand-700">
                  ManageX analyzes confidential notes and structured MOM points using Zero Data Retention (ZDR) routing.
                  Summaries are returned as non-persistent drafts for your review before anything is saved.
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
                data-testid="generate-ai-summary-btn"
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'Analyzing Notes...' : 'Generate Summary'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4" data-testid="ai-summary-review-container">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <FileText className="h-4 w-4 text-brand-600" />
                Generated Draft Summary
              </span>
              {usageTokens && (
                <Badge variant="neutral" className="text-xs">
                  {usageTokens} tokens analyzed
                </Badge>
              )}
            </div>

            {/* Section 1: Executive Summary */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Executive Summary
              </label>
              <textarea
                value={draftSummary.executiveSummary}
                onChange={(e) => handleUpdateExecutiveSummary(e.target.value)}
                rows={4}
                disabled={isSaving}
                className="w-full text-sm rounded-md border border-slate-300 p-3 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50"
                data-testid="summary-executive-textarea"
              />
            </div>

            {/* Section 2: Key Discussion Points */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                  Key Discussion Points ({draftSummary.keyDiscussionPoints.length})
                </label>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {draftSummary.keyDiscussionPoints.map((point, index) => (
                  <div
                    key={index}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 relative group"
                    data-testid={`discussion-point-${index}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          type="text"
                          value={point.topic}
                          onChange={(e) => handleUpdateDiscussionPoint(index, 'topic', e.target.value)}
                          placeholder="Topic / Agenda Item"
                          className="font-medium text-xs"
                          disabled={isSaving}
                          data-testid={`point-topic-${index}`}
                        />
                        <Input
                          type="text"
                          value={point.summary}
                          onChange={(e) => handleUpdateDiscussionPoint(index, 'summary', e.target.value)}
                          placeholder="Discussion summary"
                          className="text-xs text-slate-600"
                          disabled={isSaving}
                          data-testid={`point-summary-${index}`}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDiscussionPoint(index)}
                        className="text-slate-400 hover:text-red-600 p-1.5 h-auto"
                        disabled={isSaving}
                        title="Remove point"
                        data-testid={`remove-point-${index}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Decisions */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Consensus Decisions ({draftSummary.decisions.length})
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {draftSummary.decisions.map((dec, index) => (
                  <div
                    key={index}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1 relative group"
                    data-testid={`decision-item-${index}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          type="text"
                          value={dec.decision}
                          onChange={(e) => handleUpdateDecision(index, 'decision', e.target.value)}
                          placeholder="Decision"
                          className="font-medium text-xs"
                          disabled={isSaving}
                          data-testid={`decision-text-${index}`}
                        />
                        <Input
                          type="text"
                          value={dec.rationale || ''}
                          onChange={(e) => handleUpdateDecision(index, 'rationale', e.target.value)}
                          placeholder="Rationale / Context (Optional)"
                          className="text-xs text-slate-600"
                          disabled={isSaving}
                          data-testid={`decision-rationale-${index}`}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDecision(index)}
                        className="text-slate-400 hover:text-red-600 p-1.5 h-auto"
                        disabled={isSaving}
                        title="Remove decision"
                        data-testid={`remove-decision-${index}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Replace Confirmation Alert */}
            {showReplaceConfirm && (
              <div
                className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900 space-y-2"
                data-testid="replace-confirm-box"
              >
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Confirm Overwrite Existing Notes
                </div>
                <p>
                  Are you sure you want to replace all existing meeting notes with this summary?
                  Existing notes will be permanently overwritten.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReplaceConfirm(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleReplace}
                    disabled={isSaving}
                    data-testid="confirm-replace-notes-btn"
                  >
                    {isSaving ? 'Replacing...' : 'Yes, Replace Notes'}
                  </Button>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDraftSummary(null)}
                disabled={isSaving}
              >
                Back / Regenerate
              </Button>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={isSaving}
                  className="flex items-center gap-1.5"
                  data-testid="copy-summary-markdown-btn"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy Markdown'}
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAppend}
                  disabled={isSaving || showReplaceConfirm}
                  className="flex items-center gap-1.5"
                  data-testid="append-summary-notes-btn"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  {isSaving ? 'Saving...' : 'Append to Notes'}
                </Button>

                {currentNotesContent.trim() && !showReplaceConfirm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReplaceConfirm(true)}
                    disabled={isSaving}
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    data-testid="replace-summary-notes-btn"
                  >
                    Replace Notes
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

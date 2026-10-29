import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { apiClient, ApiError } from '@/api/client';
import {
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import { EventItem } from '@/types/events';

export interface EventFaqItem {
  question: string;
  answer: string;
}

export interface GeneratedEventContent {
  titleSuggestion?: string;
  overview: string;
  description: string;
  eligibilityCriteria?: string;
  submissionGuidelines?: string;
  rules: string[];
  faqs: EventFaqItem[];
}

export interface GenerateEventContentApiResponse {
  isDraft: boolean;
  eventId: string;
  content: GeneratedEventContent;
  usage?: {
    totalTokens: number;
    estimatedCostUsd?: number;
  };
}

export interface AiEventContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  initialEvent: {
    title: string;
    description?: string | null;
    participantInstructions?: string | null;
    updatedAt?: string;
  };
  onEventUpdated: (updatedEvent: EventItem) => void;
}

export function composeParticipantInstructions(content: GeneratedEventContent): string {
  const sections: string[] = [];

  if (content.eligibilityCriteria?.trim()) {
    sections.push(`## Eligibility Criteria\n${content.eligibilityCriteria.trim()}`);
  }

  if (content.submissionGuidelines?.trim()) {
    sections.push(`## Submission Guidelines\n${content.submissionGuidelines.trim()}`);
  }

  if (content.rules && content.rules.length > 0) {
    const rulesList = content.rules.map((r, i) => `${i + 1}. ${r.trim()}`).join('\n');
    sections.push(`## Rules & Code of Conduct\n${rulesList}`);
  }

  if (content.faqs && content.faqs.length > 0) {
    const faqList = content.faqs
      .map((f) => `**Q: ${f.question.trim()}**\nA: ${f.answer.trim()}`)
      .join('\n\n');
    sections.push(`## Frequently Asked Questions\n${faqList}`);
  }

  return sections.join('\n\n');
}

export function AiEventContentModal({
  isOpen,
  onClose,
  orgId,
  eventId,
  initialEvent,
  onEventUpdated,
}: AiEventContentModalProps) {
  // Step navigation: 'input' | 'review' | 'conflict'
  const [step, setStep] = useState<'input' | 'review' | 'conflict'>('input');

  // Input state
  const [theme, setTheme] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [focusAreaInput, setFocusAreaInput] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Draft review state
  const [draftTitle, setDraftTitle] = useState('');
  const [applyTitle, setApplyTitle] = useState(false);

  const [draftDescription, setDraftDescription] = useState('');
  const [applyDescription, setApplyDescription] = useState(true);

  const [draftInstructions, setDraftInstructions] = useState('');
  const [applyInstructions, setApplyInstructions] = useState(true);

  const [rawGeneratedContent, setRawGeneratedContent] = useState<GeneratedEventContent | null>(null);

  // Concurrency & conflict state
  const [conflictEvent, setConflictEvent] = useState<EventItem | null>(null);

  // Reset helper
  const handleReset = () => {
    setStep('input');
    setErrorMsg(null);
    setTheme('');
    setTargetAudience('');
    setFocusAreas([]);
    setFocusAreaInput('');
    setAdditionalInstructions('');
    setRawGeneratedContent(null);
    setConflictEvent(null);
  };

  // Add focus area tag
  const handleAddFocusArea = () => {
    const trimmed = focusAreaInput.trim();
    if (!trimmed) return;
    if (focusAreas.length >= 5) {
      setErrorMsg('Maximum 5 focus areas allowed.');
      return;
    }
    if (focusAreas.includes(trimmed)) return;
    setFocusAreas([...focusAreas, trimmed]);
    setFocusAreaInput('');
    setErrorMsg(null);
  };

  const handleRemoveFocusArea = (index: number) => {
    setFocusAreas(focusAreas.filter((_, i) => i !== index));
  };

  // Copy helper
  const handleCopyText = (field: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Step 1: Generate AI Content
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const payload = {
        theme: theme.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
        additionalInstructions: additionalInstructions.trim() || undefined,
      };

      const response = await apiClient<GenerateEventContentApiResponse>(
        `/organisations/${orgId}/events/${eventId}/ai/content`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const content = response.data?.content;
      if (!content) {
        throw new Error('AI response did not contain content payload.');
      }

      setRawGeneratedContent(content);

      // Initialize review fields
      const suggestedTitle = content.titleSuggestion || '';
      setDraftTitle(suggestedTitle);
      setApplyTitle(Boolean(suggestedTitle && suggestedTitle !== initialEvent.title));

      const composedDesc = content.overview?.trim()
        ? `${content.overview.trim()}\n\n${content.description?.trim() || ''}`
        : content.description?.trim() || '';
      setDraftDescription(composedDesc);
      setApplyDescription(true);

      const instructions = composeParticipantInstructions(content);
      setDraftInstructions(instructions);
      setApplyInstructions(Boolean(instructions.trim()));

      setStep('review');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.code === 'EVENT_TERMINAL') {
          setErrorMsg('Cannot generate content for completed or cancelled events.');
        } else if (err.code === 'AI_QUOTA_EXCEEDED') {
          setErrorMsg('Monthly AI quota exceeded. Please upgrade your organisation tier.');
        } else if (err.code === 'AI_PROVIDER_UNCONFIGURED') {
          setErrorMsg('AI service is currently unconfigured on the server.');
        } else {
          setErrorMsg(err.message || 'Failed to generate event content.');
        }
      } else {
        setErrorMsg(err.message || 'An unexpected error occurred during generation.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 2: Validate conflicts & Save to Database
  const handleSaveToEvent = async (overrideConflict = false) => {
    setErrorMsg(null);

    // Ensure at least one field is selected to apply
    if (!applyTitle && !applyDescription && !applyInstructions) {
      setErrorMsg('Please select at least one field to apply to the event.');
      return;
    }

    try {
      setIsSaving(true);

      // Concurrency pre-flight: Refetch the current event state
      const currentRes = await apiClient<{ event: EventItem }>(
        `/organisations/${orgId}/events/${eventId}`
      );
      const latestEvent = currentRes.data?.event;

      if (!latestEvent) {
        throw new Error('Failed to retrieve current event state from server.');
      }

      // Check if relevant fields have changed since initial load
      if (!overrideConflict) {
        const titleChanged =
          applyTitle &&
          latestEvent.title !== initialEvent.title &&
          latestEvent.title !== draftTitle;
        const descChanged =
          applyDescription &&
          (latestEvent.description || '') !== (initialEvent.description || '') &&
          (latestEvent.description || '') !== draftDescription;
        const instructionsChanged =
          applyInstructions &&
          (latestEvent.participantInstructions || '') !== (initialEvent.participantInstructions || '') &&
          (latestEvent.participantInstructions || '') !== draftInstructions;

        if (titleChanged || descChanged || instructionsChanged) {
          setConflictEvent(latestEvent);
          setStep('conflict');
          setIsSaving(false);
          return;
        }
      }

      // Prepare patch payload with ONLY selected fields
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

      const updateRes = await apiClient<{ event: EventItem }>(
        `/organisations/${orgId}/events/${eventId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(patchPayload),
        }
      );

      if (updateRes.data?.event) {
        onEventUpdated(updateRes.data.event);
      }

      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.code === 'EVENT_TERMINAL') {
          setErrorMsg('Cannot update event in terminal status.');
        } else {
          setErrorMsg(err.message || 'Failed to update event.');
        }
      } else {
        setErrorMsg(err.message || 'An error occurred while saving the event.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="AI Event Content Assistant" className="max-w-2xl">
      <div className="space-y-4">
        {/* Step 1: Input Prompts & Focus Areas */}
        {step === 'input' && (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>
                Provide context below. The AI will draft a compelling event overview, detailed description, guidelines, rules, and FAQs.
              </span>
            </div>

            {errorMsg && (
              <Alert variant="error" title="Error" role="alert">
                {errorMsg}
              </Alert>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Event Theme / Main Subject (Optional)
              </label>
              <Input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Autonomous AI Agents, Sustainable CleanTech, Web3 Security"
                maxLength={200}
                disabled={isGenerating}
              />
              <p className="text-[11px] text-slate-500 mt-0.5">Maximum 200 characters</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target Audience (Optional)
              </label>
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. University Students, Systems Programmers, Full-Stack Developers"
                maxLength={200}
                disabled={isGenerating}
              />
              <p className="text-[11px] text-slate-500 mt-0.5">Maximum 200 characters</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Focus Areas / Tracks (Optional, max 5)
              </label>
              <div className="flex gap-2">
                <Input
                  value={focusAreaInput}
                  onChange={(e) => setFocusAreaInput(e.target.value)}
                  placeholder="e.g. LLM Orchestration, On-Device Inference"
                  maxLength={200}
                  disabled={isGenerating || focusAreas.length >= 5}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddFocusArea();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddFocusArea}
                  disabled={!focusAreaInput.trim() || focusAreas.length >= 5 || isGenerating}
                >
                  Add
                </Button>
              </div>

              {focusAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {focusAreas.map((fa, idx) => (
                    <Badge key={idx} variant="brand" className="flex items-center gap-1 text-xs">
                      {fa}
                      <button
                        type="button"
                        onClick={() => handleRemoveFocusArea(idx)}
                        className="hover:text-red-700 font-bold ml-1"
                        disabled={isGenerating}
                      >
                        &times;
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Additional Instructions (Optional)
              </label>
              <Textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="Specific sponsor guidelines, prizes, judging expectations, or constraints..."
                rows={3}
                maxLength={1000}
                disabled={isGenerating}
              />
              <p className="text-[11px] text-slate-500 mt-0.5">Maximum 1000 characters</p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isGenerating}>
                {isGenerating ? (
                  <span className="flex items-center gap-1.5">
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    Generating Draft...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Generate Draft
                  </span>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: Review, Edit & Select Fields to Apply */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Badge variant="warning">AI Draft</Badge>
                <span>
                  Review and edit the generated draft. Select which fields to apply to the event. Existing content is preserved for unselected fields.
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="text-xs shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Start Over
              </Button>
            </div>

            {errorMsg && (
              <Alert variant="error" title="Error" role="alert">
                {errorMsg}
              </Alert>
            )}

            {/* Field 1: Title Suggestion */}
            {rawGeneratedContent?.titleSuggestion && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyTitle}
                      onChange={(e) => setApplyTitle(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Update Event Title</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyText('title', draftTitle)}
                    className="text-xs text-slate-500 h-6 px-2"
                  >
                    {copiedField === 'title' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  maxLength={255}
                  disabled={!applyTitle}
                  className={!applyTitle ? 'bg-slate-50 text-slate-400' : ''}
                />
              </div>
            )}

            {/* Field 2: Event Description */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyDescription}
                    onChange={(e) => setApplyDescription(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Apply Event Overview & Description</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyText('desc', draftDescription)}
                  className="text-xs text-slate-500 h-6 px-2"
                >
                  {copiedField === 'desc' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <Textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={5}
                disabled={!applyDescription}
                className={!applyDescription ? 'bg-slate-50 text-slate-400' : ''}
              />
              <p className="text-[11px] text-slate-500">
                Maps directly to the event description in ManageX.
              </p>
            </div>

            {/* Field 3: Participant Instructions (Rules, Guidelines, FAQs) */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-2 bg-white">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyInstructions}
                    onChange={(e) => setApplyInstructions(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Apply Participant Instructions (Guidelines, Rules & FAQs)</span>
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyText('instructions', draftInstructions)}
                  className="text-xs text-slate-500 h-6 px-2"
                >
                  {copiedField === 'instructions' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <Textarea
                value={draftInstructions}
                onChange={(e) => setDraftInstructions(e.target.value)}
                rows={6}
                disabled={!applyInstructions}
                className={!applyInstructions ? 'bg-slate-50 text-slate-400' : ''}
              />
              <p className="text-[11px] text-slate-500">
                Formatted into markdown and stored in Participant Instructions.
              </p>
            </div>

            {/* Collapsible raw FAQs & Rules for manual reference */}
            {rawGeneratedContent?.faqs && rawGeneratedContent.faqs.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-medium text-slate-700">
                    <HelpCircle className="h-4 w-4 text-slate-500" />
                    <span>Generated FAQs Reference ({rawGeneratedContent.faqs.length} items)</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleCopyText(
                        'faqs',
                        rawGeneratedContent.faqs
                          .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
                          .join('\n\n')
                      )
                    }
                    className="text-xs text-slate-500 h-6 px-2"
                  >
                    {copiedField === 'faqs' ? 'Copied' : 'Copy FAQs'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleSaveToEvent(false)}
                disabled={isSaving || (!applyTitle && !applyDescription && !applyInstructions)}
              >
                {isSaving ? (
                  <span className="flex items-center gap-1.5">
                    <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    Saving Changes...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Apply Selected Content to Event
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Conflict Resolution Step */}
        {step === 'conflict' && conflictEvent && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Concurrent Modification Detected</p>
                <p>
                  This event was updated by another user or session while you were working on the AI draft. Review the differences below before choosing whether to overwrite.
                </p>
              </div>
            </div>

            {errorMsg && (
              <Alert variant="error" title="Error" role="alert">
                {errorMsg}
              </Alert>
            )}

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {applyTitle && (
                <div className="border border-slate-200 rounded-lg p-2.5 text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">Title Conflict:</span>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                        Current in Database:
                      </span>
                      {conflictEvent.title}
                    </div>
                    <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-900">
                      <span className="text-[10px] font-bold text-amber-600 uppercase block mb-0.5">
                        Your Proposed Draft:
                      </span>
                      {draftTitle}
                    </div>
                  </div>
                </div>
              )}

              {applyDescription && (
                <div className="border border-slate-200 rounded-lg p-2.5 text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">Description Conflict:</span>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                        Current in Database:
                      </span>
                      <p className="whitespace-pre-wrap">{conflictEvent.description || '(Empty)'}</p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-900">
                      <span className="text-[10px] font-bold text-amber-600 uppercase block mb-0.5">
                        Your Proposed Draft:
                      </span>
                      <p className="whitespace-pre-wrap">{draftDescription || '(Empty)'}</p>
                    </div>
                  </div>
                </div>
              )}

              {applyInstructions && (
                <div className="border border-slate-200 rounded-lg p-2.5 text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">Instructions Conflict:</span>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div className="p-2 bg-slate-50 rounded border border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                        Current in Database:
                      </span>
                      <p className="whitespace-pre-wrap">{conflictEvent.participantInstructions || '(Empty)'}</p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-900">
                      <span className="text-[10px] font-bold text-amber-600 uppercase block mb-0.5">
                        Your Proposed Draft:
                      </span>
                      <p className="whitespace-pre-wrap">{draftInstructions || '(Empty)'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep('review')}
                disabled={isSaving}
              >
                Back to Review
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleSaveToEvent(true)}
                  disabled={isSaving}
                >
                  {isSaving ? 'Overwriting...' : 'Overwrite with My Draft'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

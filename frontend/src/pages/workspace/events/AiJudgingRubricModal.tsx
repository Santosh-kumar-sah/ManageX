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
  Check,
  AlertTriangle,
  RotateCcw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

export interface GeneratedCriterionItem {
  name: string;
  description?: string;
  maxScore: number;
  orderIndex: number;
  scoringGuidance?: string;
}

export interface GenerateJudgingRubricApiResponse {
  isDraft: boolean;
  eventId: string;
  roundId?: string | null;
  rubricTitle: string;
  criteria: GeneratedCriterionItem[];
  usage?: {
    totalTokens: number;
    estimatedCostUsd?: number;
  };
}

export interface EditableCriterionDraft {
  tempId: string;
  name: string;
  description: string;
  maxScore: number;
  saved?: boolean;
}

export interface AiJudgingRubricModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  roundId?: string | null;
  roundName?: string | null;
  onCriteriaCreated: () => Promise<void> | void;
}

export function mergeScoringGuidance(description?: string, scoringGuidance?: string): string {
  const cleanDesc = description?.trim() || '';
  const cleanGuidance = scoringGuidance?.trim() || '';

  if (!cleanGuidance) {
    return cleanDesc;
  }

  if (!cleanDesc) {
    return `Scoring Guidance:\n${cleanGuidance}`;
  }

  return `${cleanDesc}\n\nScoring Guidance:\n${cleanGuidance}`;
}

export function AiJudgingRubricModal({
  isOpen,
  onClose,
  orgId,
  eventId,
  roundId,
  roundName,
  onCriteriaCreated,
}: AiJudgingRubricModalProps) {
  // Steps: 'input' | 'review' | 'confirm'
  const [step, setStep] = useState<'input' | 'review' | 'confirm'>('input');

  // Input state
  const [trackInput, setTrackInput] = useState('');
  const [tracks, setTracks] = useState<string[]>([]);
  const [criteriaCount, setCriteriaCount] = useState<number>(4);
  const [focusAreaInput, setFocusAreaInput] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  // Processing state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [partialSaveInfo, setPartialSaveInfo] = useState<{
    savedCount: number;
    failedName: string;
    errorMessage: string;
  } | null>(null);

  // Review draft state
  const [rubricTitle, setRubricTitle] = useState('');
  const [criteriaList, setCriteriaList] = useState<EditableCriterionDraft[]>([]);

  // Reset helper
  const handleReset = () => {
    setStep('input');
    setErrorMsg(null);
    setPartialSaveInfo(null);
    setTracks([]);
    setTrackInput('');
    setCriteriaCount(4);
    setFocusAreas([]);
    setFocusAreaInput('');
    setAdditionalInstructions('');
    setCriteriaList([]);
    setRubricTitle('');
  };

  // Add Track
  const handleAddTrack = () => {
    const trimmed = trackInput.trim();
    if (!trimmed) return;
    if (tracks.length >= 5) {
      setErrorMsg('Maximum 5 competition tracks allowed.');
      return;
    }
    if (tracks.includes(trimmed)) return;
    setTracks([...tracks, trimmed]);
    setTrackInput('');
    setErrorMsg(null);
  };

  const handleRemoveTrack = (index: number) => {
    setTracks(tracks.filter((_, i) => i !== index));
  };

  // Add Focus Area
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

  // Step 1: Generate Rubric via AI
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPartialSaveInfo(null);
    setIsGenerating(true);

    try {
      const payload = {
        tracks: tracks.length > 0 ? tracks : undefined,
        criteriaCount: Number(criteriaCount) || 4,
        focusAreas: focusAreas.length > 0 ? focusAreas : undefined,
        additionalInstructions: additionalInstructions.trim() || undefined,
      };

      const queryParam = roundId ? `?roundId=${encodeURIComponent(roundId)}` : '';
      const response = await apiClient<GenerateJudgingRubricApiResponse>(
        `/organisations/${orgId}/events/${eventId}/ai/rubrics${queryParam}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const generatedCriteria = response.data?.criteria;
      if (!generatedCriteria || !Array.isArray(generatedCriteria) || generatedCriteria.length === 0) {
        throw new Error('AI response did not return any criteria.');
      }

      setRubricTitle(response.data?.rubricTitle || 'Generated Rubric');

      const mappedDrafts: EditableCriterionDraft[] = generatedCriteria.map((c, idx) => ({
        tempId: `draft-crit-${Date.now()}-${idx}`,
        name: c.name || `Criterion ${idx + 1}`,
        description: mergeScoringGuidance(c.description, c.scoringGuidance),
        maxScore: Number.isInteger(Number(c.maxScore)) && c.maxScore > 0 && c.maxScore <= 100
          ? Number(c.maxScore)
          : 100,
        saved: false,
      }));

      setCriteriaList(mappedDrafts);
      setStep('review');
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.code === 'SCORING_ALREADY_STARTED') {
          setErrorMsg('Judging scoring has already started for this event/round. Rubrics cannot be modified.');
        } else if (err.code === 'EVENT_TERMINAL') {
          setErrorMsg('Cannot generate rubrics for completed or cancelled events.');
        } else if (err.code === 'AI_QUOTA_EXCEEDED') {
          setErrorMsg('Monthly AI quota exceeded. Please upgrade your organisation tier.');
        } else if (err.code === 'AI_PROVIDER_UNCONFIGURED') {
          setErrorMsg('AI service is currently unconfigured on the server.');
        } else {
          setErrorMsg(err.message || 'Failed to generate judging rubric.');
        }
      } else {
        setErrorMsg(err.message || 'An unexpected error occurred during generation.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Criteria Editing Helpers
  const handleUpdateCriterion = (tempId: string, updates: Partial<EditableCriterionDraft>) => {
    setCriteriaList((prev) =>
      prev.map((c) => (c.tempId === tempId ? { ...c, ...updates } : c))
    );
  };

  const handleDeleteCriterion = (tempId: string) => {
    if (criteriaList.length <= 1) {
      setErrorMsg('Rubric must contain at least one criterion.');
      return;
    }
    setCriteriaList((prev) => prev.filter((c) => c.tempId !== tempId));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setCriteriaList((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= criteriaList.length - 1) return;
    setCriteriaList((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleAddCustomCriterion = () => {
    if (criteriaList.length >= 15) {
      setErrorMsg('Maximum 15 criteria allowed in a rubric.');
      return;
    }
    const newDraft: EditableCriterionDraft = {
      tempId: `custom-crit-${Date.now()}`,
      name: '',
      description: '',
      maxScore: 100,
      saved: false,
    };
    setCriteriaList((prev) => [...prev, newDraft]);
    setErrorMsg(null);
  };

  // Step 2 & 3: Save Criteria Sequentially with Finding-01 Retry Protection
  const handleSaveCriteria = async () => {
    setErrorMsg(null);
    setPartialSaveInfo(null);

    // Validation pre-flight
    for (let i = 0; i < criteriaList.length; i++) {
      const c = criteriaList[i];
      if (!c.name.trim() || c.name.trim().length < 2) {
        setErrorMsg(`Criterion #${i + 1} name must be at least 2 characters.`);
        setStep('review');
        return;
      }
      if (c.name.trim().length > 120) {
        setErrorMsg(`Criterion #${i + 1} name cannot exceed 120 characters.`);
        setStep('review');
        return;
      }
      if (!Number.isInteger(Number(c.maxScore)) || c.maxScore < 1 || c.maxScore > 100) {
        setErrorMsg(`Criterion #${i + 1} max score must be an integer between 1 and 100.`);
        setStep('review');
        return;
      }
    }

    setIsSaving(true);
    let successfullySavedCount = 0;
    const remainingCriteria = [...criteriaList];

    try {
      while (remainingCriteria.length > 0) {
        const currentCrit = remainingCriteria[0];

        const payload = {
          name: currentCrit.name.trim(),
          description: currentCrit.description.trim() || undefined,
          maxScore: Number(currentCrit.maxScore),
          orderIndex: successfullySavedCount,
          roundId: roundId || undefined,
        };

        try {
          await apiClient(`/organisations/${orgId}/events/${eventId}/criteria`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });

          // Successfully persisted: Remove from unsaved list immediately
          successfullySavedCount += 1;
          remainingCriteria.shift();
          setCriteriaList([...remainingCriteria]);
        } catch (itemErr: any) {
          // Record partial failure details
          const errMsg =
            itemErr instanceof ApiError
              ? itemErr.message
              : itemErr?.message || 'Failed to save criterion.';

          setPartialSaveInfo({
            savedCount: successfullySavedCount,
            failedName: currentCrit.name,
            errorMessage: errMsg,
          });

          // Remain on review step so user can edit and retry remaining
          setStep('review');
          setIsSaving(false);
          return;
        }
      }

      // All criteria saved successfully
      await onCriteriaCreated();
      onClose();
    } catch (unexpectedErr: any) {
      setErrorMsg(unexpectedErr.message || 'An unexpected error occurred during save.');
      setStep('review');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="AI Judging Rubric Assistant" className="max-w-2xl">
      <div className="space-y-4">
        {/* Step 1: Input Tracks & Focus Areas */}
        {step === 'input' && (
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900">
              <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>
                {roundName
                  ? `Generate a balanced, objective rubric for round "${roundName}". Criteria conform to straight sum scoring (1–100) per ManageX policy.`
                  : 'Generate a balanced, objective judging rubric and evaluation criteria conforming to straight sum scoring (1–100).'}
              </span>
            </div>

            {errorMsg && (
              <Alert variant="error" title="Error" role="alert">
                {errorMsg}
              </Alert>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Competition Tracks (Optional, max 5)
              </label>
              <div className="flex gap-2">
                <Input
                  value={trackInput}
                  onChange={(e) => setTrackInput(e.target.value)}
                  placeholder="e.g. Developer Tools, Web3, Social Impact"
                  maxLength={100}
                  disabled={isGenerating || tracks.length >= 5}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTrack();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddTrack}
                  disabled={!trackInput.trim() || tracks.length >= 5 || isGenerating}
                >
                  Add
                </Button>
              </div>

              {tracks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tracks.map((track, idx) => (
                    <Badge key={idx} variant="brand" className="flex items-center gap-1 text-xs">
                      {track}
                      <button
                        type="button"
                        onClick={() => handleRemoveTrack(idx)}
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
                Number of Criteria to Generate (2 to 10)
              </label>
              <Input
                type="number"
                min={2}
                max={10}
                value={criteriaCount}
                onChange={(e) => setCriteriaCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
                disabled={isGenerating}
              />
              <p className="text-[11px] text-slate-500 mt-0.5">ManageX recommends 3 to 5 criteria for hackathons.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Evaluation Focus Areas (Optional, max 5)
              </label>
              <div className="flex gap-2">
                <Input
                  value={focusAreaInput}
                  onChange={(e) => setFocusAreaInput(e.target.value)}
                  placeholder="e.g. Architectural Robustness, UI Polish"
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
                placeholder="Specific guidance (e.g. penalize non-working demos, reward open-source contributions)..."
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
                    Generating Rubric...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Generate Rubric
                  </span>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* Step 2: Review & Edit Draft Criteria */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Badge variant="warning">{rubricTitle || 'Draft Rubric'}</Badge>
                <span>
                  Review the proposed criteria below. Scoring guidance has been consolidated into the description. You can edit names, scores, and reorder before saving.
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

            {partialSaveInfo && (
              <Alert variant="warning" title="Partial Save Notice" role="alert">
                <p className="text-xs">
                  Successfully created <strong>{partialSaveInfo.savedCount}</strong> criteria before hitting an error on "
                  <strong>{partialSaveInfo.failedName}</strong>": {partialSaveInfo.errorMessage}
                </p>
                <p className="text-xs mt-1">
                  The {criteriaList.length} criteria remaining below have NOT been saved. Edit and click save to retry without duplicates.
                </p>
              </Alert>
            )}

            {errorMsg && (
              <Alert variant="error" title="Validation Error" role="alert">
                {errorMsg}
              </Alert>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {criteriaList.map((crit, index) => (
                <div
                  key={crit.tempId}
                  className="border border-slate-200 rounded-lg p-3 bg-white space-y-2 relative shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                      <Input
                        value={crit.name}
                        onChange={(e) => handleUpdateCriterion(crit.tempId, { name: e.target.value })}
                        placeholder="Criterion name (e.g. Technical Innovation)"
                        maxLength={120}
                        className="text-xs font-semibold text-slate-800 h-8 flex-1"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <span>Max Score:</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={crit.maxScore}
                          onChange={(e) =>
                            handleUpdateCriterion(crit.tempId, {
                              maxScore: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                            })
                          }
                          className="w-16 h-8 text-xs text-center"
                        />
                      </div>

                      {/* Reorder and Delete Controls */}
                      <div className="flex items-center gap-1 border-l border-slate-100 pl-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="h-7 w-7 p-0"
                          title="Move Up"
                        >
                          <ArrowUp className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === criteriaList.length - 1}
                          className="h-7 w-7 p-0"
                          title="Move Down"
                        >
                          <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCriterion(crit.tempId)}
                          disabled={criteriaList.length <= 1}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                          title="Remove Criterion"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-0.5">
                      Description & Scoring Guidance
                    </label>
                    <Textarea
                      value={crit.description}
                      onChange={(e) => handleUpdateCriterion(crit.tempId, { description: e.target.value })}
                      rows={3}
                      className="text-xs"
                      placeholder="Detailed evaluation guidance..."
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomCriterion}
                disabled={criteriaList.length >= 15}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Criterion
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setStep('confirm')}
                  disabled={criteriaList.length === 0}
                >
                  <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Review & Save Criteria ({criteriaList.length})
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Explicit Confirmation Modal Step */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Confirm Judging Rubric Creation</p>
                <p>
                  You are about to add <strong>{criteriaList.length}</strong> scoring criteria to{' '}
                  {roundName ? `round "${roundName}"` : 'this event'}.
                </p>
                <p className="mt-1 text-slate-600">
                  Note: Under ManageX event policy (PRD EVT-008), criteria cannot be added or deleted once scoring has commenced.
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {criteriaList.map((c, i) => (
                <div key={c.tempId} className="p-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-400 mr-2">#{i + 1}</span>
                    <span className="font-semibold text-slate-800">{c.name}</span>
                  </div>
                  <Badge variant="brand">Max Score: {c.maxScore}</Badge>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStep('review')}
                disabled={isSaving}
              >
                Back to Editing
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSaveCriteria}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-1.5">
                      <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                      Saving Criteria...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4" />
                      Confirm & Create Criteria
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

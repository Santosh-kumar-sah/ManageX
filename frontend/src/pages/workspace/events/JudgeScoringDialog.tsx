import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { apiClient, ApiError } from '@/api/client';
import { ExternalLink, GitBranch, Globe } from 'lucide-react';
import {
  EvaluationSession,
  EvaluationSessionWork,
  SubmitSessionScoresPayload,
  SubmitSessionScoresResponse,
} from '@/types/events';

type SessionRequest = typeof apiClient;

export async function getJudgeEvaluationSessionWork(
  orgId: string,
  eventId: string,
  roundId: string,
  sessionId: string,
  request: SessionRequest = apiClient
) {
  return request<EvaluationSessionWork>(
    `/organisations/${orgId}/events/${eventId}/rounds/${roundId}/evaluation/sessions/${sessionId}/work`
  );
}

export async function submitJudgeEvaluationSessionScores(
  orgId: string,
  eventId: string,
  roundId: string,
  sessionId: string,
  payload: SubmitSessionScoresPayload,
  request: SessionRequest = apiClient
) {
  return request<SubmitSessionScoresResponse>(
    `/organisations/${orgId}/events/${eventId}/rounds/${roundId}/evaluation/sessions/${sessionId}/scores`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export interface JudgeScoringDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  eventId: string;
  roundId: string;
  session: EvaluationSession | null;
  onScoresSubmitted?: () => void;
  request?: SessionRequest;
  initialWork?: EvaluationSessionWork | null;
  initialLoading?: boolean;
}

export function JudgeScoringDialog({
  isOpen,
  onClose,
  orgId,
  eventId,
  roundId,
  session,
  onScoresSubmitted,
  request = apiClient,
  initialWork = null,
  initialLoading,
}: JudgeScoringDialogProps) {
  const [isLoading, setIsLoading] = useState(
    initialLoading ?? Boolean(isOpen && session && !initialWork)
  );
  const [work, setWork] = useState<EvaluationSessionWork | null>(initialWork);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scoresMap, setScoresMap] = useState<Record<string, string>>(() => {
    if (initialWork?.scores) {
      const map: Record<string, string> = {};
      for (const item of initialWork.scores) {
        if (item.score !== undefined && item.score !== null) {
          map[item.criterionId] = String(item.score);
        }
      }
      return map;
    }
    return {};
  });
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>(() => {
    if (initialWork?.scores) {
      const map: Record<string, string> = {};
      for (const item of initialWork.scores) {
        if (item.feedback) {
          map[item.criterionId] = item.feedback;
        }
      }
      return map;
    }
    return {};
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fetchWork = useCallback(async () => {
    if (!session || !orgId || !eventId || !roundId) return;

    setIsLoading(true);
    setLoadError(null);
    setSubmitError(null);
    setSubmitSuccess(false);
    setValidationErrors({});

    try {
      const res = await getJudgeEvaluationSessionWork(
        orgId,
        eventId,
        roundId,
        session.id,
        request
      );

      const workData = res.data;
      if (!workData) {
        throw new Error('No evaluation work returned for this session.');
      }

      setWork(workData);

      // Pre-populate existing scores if available
      const initialScores: Record<string, string> = {};
      const initialFeedback: Record<string, string> = {};

      if (Array.isArray(workData.scores)) {
        for (const item of workData.scores) {
          if (item.score !== undefined && item.score !== null) {
            initialScores[item.criterionId] = String(item.score);
          }
          if (item.feedback) {
            initialFeedback[item.criterionId] = item.feedback;
          }
        }
      }

      setScoresMap(initialScores);
      setFeedbackMap(initialFeedback);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 403) {
          setLoadError('You are not assigned to this evaluation session or your assignment has been revoked.');
        } else if (err.message.includes('EVALUATION_SESSION_INACTIVE')) {
          setLoadError('Scores cannot be submitted because this evaluation session is inactive or cancelled.');
        } else if (err.message.includes('SESSION_SUBMISSION_INVALID')) {
          setLoadError('This evaluation session does not have a compatible submission ready for scoring.');
        } else {
          setLoadError(err.message || 'Unable to load evaluation criteria and submission.');
        }
      } else {
        setLoadError('Unable to load evaluation session work. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [eventId, orgId, request, roundId, session]);

  useEffect(() => {
    if (isOpen && session) {
      if (!initialWork) {
        fetchWork();
      }
    } else {
      if (!initialWork) {
        setWork(null);
        setScoresMap({});
        setFeedbackMap({});
      }
      setValidationErrors({});
      setLoadError(null);
      setSubmitError(null);
      setSubmitSuccess(false);
      setIsSubmitting(false);
    }
  }, [isOpen, session, fetchWork, initialWork]);

  const hasExistingScores = useMemo(() => {
    return Boolean(work?.scores && work.scores.length > 0);
  }, [work]);

  const { totalCalculatedScore, totalMaxPossibleScore } = useMemo(() => {
    if (!work || !Array.isArray(work.criteria)) {
      return { totalCalculatedScore: 0, totalMaxPossibleScore: 0 };
    }
    let currentTotal = 0;
    let maxTotal = 0;
    for (const crit of work.criteria) {
      maxTotal += crit.maxScore;
      const val = Number(scoresMap[crit.id]);
      if (!isNaN(val) && isFinite(val) && val >= 0 && val <= crit.maxScore) {
        currentTotal += val;
      }
    }
    return {
      totalCalculatedScore: Math.round(currentTotal * 100) / 100,
      totalMaxPossibleScore: maxTotal,
    };
  }, [work, scoresMap]);

  const handleScoreChange = (criterionId: string, value: string) => {
    setScoresMap((prev) => ({ ...prev, [criterionId]: value }));
    if (validationErrors[criterionId]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[criterionId];
        return next;
      });
    }
    if (submitError) setSubmitError(null);
    if (submitSuccess) setSubmitSuccess(false);
  };

  const handleFeedbackChange = (criterionId: string, value: string) => {
    setFeedbackMap((prev) => ({ ...prev, [criterionId]: value }));
    if (submitSuccess) setSubmitSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!work || isSubmitting || !session) return;

    // 1. Validate required fields and score bounds before submission
    const errors: Record<string, string> = {};
    for (const crit of work.criteria) {
      const raw = scoresMap[crit.id];
      if (raw === undefined || raw === null || raw.trim() === '') {
        errors[crit.id] = `Score is required for "${crit.name}".`;
        continue;
      }
      const num = Number(raw);
      if (isNaN(num) || !isFinite(num)) {
        errors[crit.id] = `Score for "${crit.name}" must be a valid number.`;
      } else if (num < 0) {
        errors[crit.id] = `Score for "${crit.name}" cannot be negative.`;
      } else if (num > crit.maxScore) {
        errors[crit.id] = `Score for "${crit.name}" cannot exceed ${crit.maxScore}.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setSubmitError('Please correct the score errors indicated below before submitting.');
      return;
    }

    // 2. Prepare payload
    const payload: SubmitSessionScoresPayload = {
      scores: work.criteria.map((crit) => ({
        criterionId: crit.id,
        score: Number(scoresMap[crit.id]),
        feedback: feedbackMap[crit.id]?.trim() || null,
      })),
    };

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await submitJudgeEvaluationSessionScores(
        orgId,
        eventId,
        roundId,
        session.id,
        payload,
        request
      );

      const responseData = res.data;
      if (responseData?.success) {
        setSubmitSuccess(true);
        // Refresh local work scores record to reflect saved status
        if (responseData.scores) {
          setWork((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              scores: responseData.scores.map((s) => ({
                criterionId: s.criterionId,
                score: s.score,
                feedback: s.feedback,
                updatedAt: new Date().toISOString(),
              })),
            };
          });
        }
        if (onScoresSubmitted) {
          onScoresSubmitted();
        }
      } else {
        throw new Error('Score submission did not return success confirmation.');
      }
    } catch (err) {
      // Preserve entered scoresMap and feedbackMap so the judge does not lose their typed evaluation
      if (err instanceof ApiError) {
        if (err.message.includes('ROUND_ADVANCEMENT_LOCKED')) {
          setSubmitError('Cannot submit or modify scores for a round that has already concluded and advanced.');
        } else if (err.message.includes('JUDGING_NOT_ACTIVE')) {
          setSubmitError('Scoring is not active for this event.');
        } else if (err.statusCode === 403) {
          setSubmitError('You are not authorized to score this evaluation session.');
        } else {
          setSubmitError(err.message || 'Failed to submit evaluation scores.');
        }
      } else {
        setSubmitError('Failed to submit evaluation scores. Please check your connection and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const dialogTitle = session ? `Evaluate: ${session.teamName}` : 'Evaluation Session';
  const dialogDescription = session
    ? `Panel: ${session.panelName} · Slot ${session.slotIndex + 1}`
    : 'Assigned evaluation scoring';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={dialogTitle}
      description={dialogDescription}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* Load error state */}
        {loadError && (
          <Alert variant="error" title="Unable to open evaluation session">
            <div className="space-y-3">
              <p className="text-xs text-slate-700">{loadError}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={fetchWork}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* Loading skeleton state */}
        {isLoading && (
          <div className="space-y-4 py-2" data-testid="scoring-loading-skeleton">
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="space-y-3 pt-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <p className="text-xs text-slate-500 animate-pulse">
              Loading submission and evaluation criteria...
            </p>
          </div>
        )}

        {/* Ready scoring content */}
        {!isLoading && !loadError && work && (
          <div className="space-y-5">
            {/* Permitted Team & Submission Information */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {work.session.submission?.title || 'No submission title recorded'}
                </h3>
                <Badge variant="brand" className="text-xs">
                  Team: {work.session.teamName}
                </Badge>
              </div>
              {work.session.submission?.description && (
                <p className="text-xs text-slate-600 line-clamp-3">
                  {work.session.submission.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                {work.session.submission?.repositoryUrl && (
                  <a
                    href={work.session.submission.repositoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    <span>Repository</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {work.session.submission?.demoUrl && (
                  <a
                    href={work.session.submission.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span>Live Demo</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {!work.session.submission?.repositoryUrl && !work.session.submission?.demoUrl && (
                  <span className="text-slate-400 italic">No repository or demo URL provided</span>
                )}
              </div>
            </div>

            {/* Previously submitted notice */}
            {hasExistingScores && !submitSuccess && (
              <Alert variant="info" title="Existing evaluation found">
                <p className="text-xs">
                  Your previously submitted scores are displayed below. You can modify them and re-submit at any time before the round is completed.
                </p>
              </Alert>
            )}

            {/* Evaluation Criteria Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                {work.criteria.map((criterion) => {
                  const scoreVal = scoresMap[criterion.id] ?? '';
                  const feedbackVal = feedbackMap[criterion.id] ?? '';
                  const fieldError = validationErrors[criterion.id];

                  return (
                    <div
                      key={criterion.id}
                      className="rounded-md border border-slate-200 bg-white p-4 space-y-3 transition-colors hover:border-slate-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900">
                            {criterion.name}
                          </h4>
                          {criterion.description && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {criterion.description}
                            </p>
                          )}
                        </div>
                        <Badge variant="neutral" className="shrink-0 text-xs font-mono">
                          Max: {criterion.maxScore} pts
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div className="sm:col-span-1">
                          <FormField
                            label={`Score (0–${criterion.maxScore})`}
                            required
                            error={fieldError}
                            htmlFor={`score-${criterion.id}`}
                          >
                            <Input
                              id={`score-${criterion.id}`}
                              type="number"
                              min="0"
                              max={criterion.maxScore}
                              step="any"
                              disabled={isSubmitting}
                              value={scoreVal}
                              hasError={Boolean(fieldError)}
                              onChange={(e) => handleScoreChange(criterion.id, e.target.value)}
                              aria-label={`Score for ${criterion.name}`}
                              placeholder={`0–${criterion.maxScore}`}
                            />
                          </FormField>
                        </div>
                        <div className="sm:col-span-2">
                          <FormField
                            label="Private Notes / Feedback (optional)"
                            htmlFor={`feedback-${criterion.id}`}
                          >
                            <Textarea
                              id={`feedback-${criterion.id}`}
                              disabled={isSubmitting}
                              rows={2}
                              value={feedbackVal}
                              onChange={(e) => handleFeedbackChange(criterion.id, e.target.value)}
                              aria-label={`Feedback for ${criterion.name}`}
                              placeholder="Private notes (never shared with participants)"
                              className="text-xs"
                            />
                          </FormField>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total calculated score banner */}
              <div className="flex items-center justify-between rounded-md bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-800">
                <span>Total Score:</span>
                <span className="font-mono text-base font-bold text-slate-900">
                  {totalCalculatedScore} / {totalMaxPossibleScore} pts
                </span>
              </div>

              {/* Submission error message banner */}
              {submitError && (
                <Alert variant="error" title="Submission failed">
                  <p className="text-xs">{submitError}</p>
                </Alert>
              )}

              {/* Submission success message banner */}
              {submitSuccess && (
                <Alert variant="success" title="Scores submitted successfully">
                  <p className="text-xs">
                    Your evaluation scores have been recorded. You can update them before the round concludes or close this view.
                  </p>
                </Alert>
              )}

              {/* Form Action Controls */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  {submitSuccess ? 'Close' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || isLoading}
                >
                  {isSubmitting
                    ? 'Submitting scores...'
                    : submitSuccess
                    ? 'Update Scores'
                    : 'Submit Scores'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </Dialog>
  );
}

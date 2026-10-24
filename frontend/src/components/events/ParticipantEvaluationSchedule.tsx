import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Video,
  ExternalLink,
  RotateCw,
  AlertCircle,
  Users,
  Presentation,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { EvaluationSession, EvaluationSessionStatus } from '@/types/events';

export interface ParticipantEvaluationScheduleProps {
  eventId: string;
  roundId: string;
  roundName?: string;
  roundNumber?: number;
  teamId?: string | null;
  teamName?: string | null;
  timezone?: string;
  className?: string;
  initialSession?: EvaluationSession | null;
  showEmptyState?: boolean;
  onSessionLoaded?: (session: EvaluationSession | null) => void;
}

const STATUS_CONFIG: Record<
  EvaluationSessionStatus,
  { label: string; variant: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' }
> = {
  scheduled: { label: 'Scheduled', variant: 'brand' },
  in_progress: { label: 'In Progress', variant: 'success' },
  rescheduled: { label: 'Rescheduled', variant: 'warning' },
  completed: { label: 'Completed', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  no_show: { label: 'No Show', variant: 'danger' },
};

export const ParticipantEvaluationSchedule: React.FC<ParticipantEvaluationScheduleProps> = ({
  eventId,
  roundId,
  roundName,
  roundNumber,
  teamId: _teamId,
  teamName,
  timezone = 'UTC',
  className = '',
  initialSession,
  showEmptyState = true,
  onSessionLoaded,
}) => {
  const [session, setSession] = useState<EvaluationSession | null>(initialSession ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(initialSession === undefined);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSession = useCallback(
    async (manualRefresh = false) => {
      if (!eventId || !roundId) return;

      if (manualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const res = await apiClient<{ session: EvaluationSession | null }>(
          `/events/${eventId}/rounds/${roundId}/evaluation/my-session`
        );
        const fetchedSession = res.data?.session || null;
        setSession(fetchedSession);
        onSessionLoaded?.(fetchedSession);
      } catch (err) {
        if (err instanceof ApiError) {
          // If 404 or 403, handle gracefully without blowing up
          if (err.statusCode === 404) {
            setSession(null);
          } else {
            setErrorMessage(err.message || 'Failed to load evaluation appointment.');
          }
        } else {
          setErrorMessage('Unable to connect and load evaluation appointment.');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [eventId, roundId, onSessionLoaded]
  );

  useEffect(() => {
    if (initialSession === undefined) {
      fetchSession();
    }
  }, [fetchSession, initialSession]);

  const formatDateTimeRange = (startIso: string | null, endIso: string | null) => {
    if (!startIso) return 'Time TBA';
    try {
      const startDate = new Date(startIso);
      const datePart = startDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone,
      });
      const startTime = startDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

      if (!endIso) {
        return `${datePart} at ${startTime} (${timezone})`;
      }

      const endDate = new Date(endIso);
      const endTime = endDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

      return `${datePart} · ${startTime} – ${endTime} (${timezone})`;
    } catch {
      return `${startIso} – ${endIso || ''}`;
    }
  };

  const formatUnlockTime = (unlockIso: string | null) => {
    if (!unlockIso) return 'shortly before session start';
    try {
      const d = new Date(unlockIso);
      return d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });
    } catch {
      return unlockIso;
    }
  };

  if (isLoading) {
    return (
      <div
        className={`p-4 rounded-lg border border-slate-200 bg-white space-y-3 ${className}`}
        data-testid="participant-schedule-loading"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className={className} data-testid="participant-schedule-error">
        <Alert variant="error" className="py-2.5">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 px-2"
              onClick={() => fetchSession(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (!session) {
    if (!showEmptyState) return null;

    return (
      <div
        className={`p-3.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${className}`}
        data-testid="participant-schedule-empty"
      >
        <div className="flex items-center gap-2">
          <Presentation className="h-4 w-4 text-slate-400 shrink-0" />
          <span>
            {roundName ? `Round ${roundNumber || ''} (${roundName})` : 'Evaluation schedule'}: No
            session appointment published yet.
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs h-7 px-2 text-slate-500 hover:text-slate-800 self-end sm:self-auto gap-1.5"
          onClick={() => fetchSession(true)}
          disabled={isRefreshing}
          aria-label="Refresh schedule"
        >
          <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Checking...' : 'Refresh'}</span>
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_CONFIG[session.status] || {
    label: session.status,
    variant: 'neutral' as const,
  };
  const isCancelled = session.status === 'cancelled' || session.status === 'no_show';
  const hasMeetingLink = Boolean(session.meetingUrl);

  return (
    <Card
      className={`border border-border p-4 bg-white shadow-xs space-y-3.5 ${className}`}
      data-testid="participant-schedule-card"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-brand-50 text-brand-700">
            <Presentation className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Evaluation Appointment
            </h4>
            {roundName && (
              <p className="text-[11px] text-slate-500">
                Round {roundNumber || ''}: {roundName}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge variant={statusMeta.variant} className="capitalize text-xs font-semibold">
            {statusMeta.label}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 w-7 p-0 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
            onClick={() => fetchSession(true)}
            disabled={isRefreshing}
            title="Refresh evaluation schedule"
            aria-label="Refresh evaluation schedule"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Appointment Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-surface-subtle p-3 rounded-lg border border-border">
        {/* Date and Time */}
        <div className="flex items-start gap-2.5">
          <Calendar className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold text-slate-900 block">Appointment Time</span>
            <span className="text-slate-600 leading-relaxed">
              {formatDateTimeRange(session.startsAt, session.endsAt)}
            </span>
          </div>
        </div>

        {/* Panel & Slot */}
        <div className="flex items-start gap-2.5">
          <Users className="h-4 w-4 text-brand-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold text-slate-900 block">Evaluation Panel</span>
            <span className="text-slate-600">
              {session.panelName || `Panel ${session.panelNumber || 1}`}
              {session.slotIndex !== undefined && session.slotIndex !== null && (
                <span className="text-slate-500 block text-[11px]">
                  Slot #{session.slotIndex + 1}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Team Context Note */}
      <div className="text-[11px] text-slate-500 flex items-center justify-between">
        <span>
          Team:{' '}
          <span className="font-medium text-slate-700">
            {session.teamName || teamName || 'Your Team'}
          </span>
        </span>
        {session.status === 'in_progress' && (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Session is Live Now
          </span>
        )}
      </div>

      {/* Meeting Access / Link Status */}
      {!isCancelled ? (
        <div className="pt-1">
          {hasMeetingLink ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 text-xs">
              <div className="flex items-center gap-2 text-emerald-900 font-medium">
                <Video className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Evaluation meeting link is active and ready for your team.</span>
              </div>
              <a
                href={session.meetingUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button size="sm" variant="primary" className="text-xs gap-1.5 w-full sm:w-auto">
                  <Video className="h-3.5 w-3.5" />
                  <span>Join Evaluation Meeting</span>
                  <ExternalLink className="h-3 w-3 ml-0.5" />
                </Button>
              </a>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-indigo-50/60 border border-indigo-200 text-xs text-indigo-900">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-brand-600 shrink-0" />
                <div>
                  <span className="font-semibold block text-indigo-950">
                    Meeting link will unlock 10 minutes prior to session
                  </span>
                  <span className="text-indigo-800 text-[11px]">
                    Available at:{' '}
                    <span className="font-medium">
                      {formatUnlockTime(session.meetingLinkAvailableAt)} ({timezone})
                    </span>
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 px-2.5 bg-white border-indigo-300 text-indigo-900 hover:bg-indigo-50 shrink-0 gap-1.5"
                onClick={() => fetchSession(true)}
                disabled={isRefreshing}
                aria-label="Check meeting link availability"
              >
                <RotateCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Checking...' : 'Check Link'}</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
          <span>
            This evaluation session has been marked as{' '}
            <span className="font-semibold capitalize">{session.status.replace('_', ' ')}</span>.
            Please contact the event organisers if you require assistance.
          </span>
        </div>
      )}
    </Card>
  );
};

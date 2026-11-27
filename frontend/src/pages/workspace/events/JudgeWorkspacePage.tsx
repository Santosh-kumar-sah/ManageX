import './events.css';
import { sessionStatusLabels } from './sessionStatusLabels';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { apiClient, ApiError } from '@/api/client';
import { EvaluationSession, EvaluationSessionStatus } from '@/types/events';
import {
  JudgeScoringDialog,
  getJudgeEvaluationSessionWork,
  submitJudgeEvaluationSessionScores,
} from './JudgeScoringDialog';

export { getJudgeEvaluationSessionWork, submitJudgeEvaluationSessionScores };

type SessionRequest = typeof apiClient;

export async function listJudgeEvaluationSessions(
  orgId: string,
  eventId: string,
  roundId: string,
  request: SessionRequest = apiClient
) {
  return request<{ sessions: EvaluationSession[] }>(
    `/organisations/${orgId}/events/${eventId}/rounds/${roundId}/evaluation/sessions`
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusVariant(status: EvaluationSessionStatus) {
  if (status === 'completed') return 'success' as const;
  if (status === 'cancelled' || status === 'no_show') return 'danger' as const;
  return 'brand' as const;
}

export function JudgeWorkspacePage() {
  const { orgId: routeOrgId, eventId: routeEventId, roundId: routeRoundId } =
    useParams<{ orgId: string; eventId: string; roundId: string }>();
  const [searchParams] = useSearchParams();
  const orgId = routeOrgId || searchParams.get('orgId') || '';
  const eventId = routeEventId || searchParams.get('eventId') || '';
  const roundId = routeRoundId || searchParams.get('roundId') || '';
  const [sessions, setSessions] = useState<EvaluationSession[]>([]);
  const [scoringSession, setScoringSession] = useState<EvaluationSession | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(orgId && eventId && roundId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!orgId || !eventId || !roundId) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listJudgeEvaluationSessions(orgId, eventId, roundId);
      setSessions(response.data?.sessions || []);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Unable to load assigned evaluation sessions.');
    } finally {
      setIsLoading(false);
    }
  }, [eventId, orgId, roundId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const sessionGroups = useMemo(
    () => ({
      upcoming: sessions.filter((session) => ['scheduled', 'in_progress'].includes(session.status)),
      past: sessions.filter((session) => ['completed', 'no_show', 'cancelled'].includes(session.status)),
    }),
    [sessions]
  );

  if (!orgId || !eventId || !roundId) {
    return (
      <Card className="mx-events mx-judge-intro">
        <CardHeader>
          <h1 className="mx-event-title">Judge workspace</h1>
          <CardDescription>
            Accept your judge invitation, then open the round link from your event organiser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            Your invitation gives you access to the sessions assigned to your panel. Ask the organiser for the round link if you need it again.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-events space-y-6">
      <header className="mx-event-heading">
        <div>
          <h1 className="mx-event-title">Judge workspace</h1>
          <p className="mt-1 text-sm text-slate-500">Open your assigned sessions to review entries and record scores.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoading}>Refresh</Button>
      </header>

      {errorMessage && (
        <Alert variant="error" title="Unable to load sessions">
          <div className="space-y-2">
            <p>{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={loadSessions}>Retry</Button>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : errorMessage ? null : sessions.length === 0 ? (
        <EmptyState title="No assigned evaluation sessions" description="Assigned sessions will appear here when the organiser publishes or updates the evaluation schedule." />
      ) : (
        <>
          <SessionGroup
            title="Upcoming sessions"
            sessions={sessionGroups.upcoming}
            onSelectSession={setScoringSession}
          />
          <SessionGroup
            title="Past sessions"
            sessions={sessionGroups.past}
            onSelectSession={setScoringSession}
          />
        </>
      )}
      <JudgeScoringDialog
        isOpen={Boolean(scoringSession)}
        onClose={() => setScoringSession(null)}
        orgId={orgId}
        eventId={eventId}
        roundId={roundId}
        session={scoringSession}
        onScoresSubmitted={loadSessions}
      />
    </div>
  );
}

function SessionGroup({
  title,
  sessions,
  onSelectSession,
}: {
  title: string;
  sessions: EvaluationSession[];
  onSelectSession: (session: EvaluationSession) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>

      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()}`} description="There are no sessions in this group." />
        ) : (
          <ul className="mx-judge-sessions">
            {sessions.map(session => (
              <li key={session.id}>
                <div>
                  <h3>{session.teamName}</h3>
                  <p>{session.panelName}</p>
                </div>
                <div>
                  <time dateTime={session.startsAt}>{formatDate(session.startsAt)}</time>
                  <p>to <time dateTime={session.endsAt}>{formatDate(session.endsAt)}</time></p>
                </div>
                <div>
                  <Badge variant={statusVariant(session.status)}>{sessionStatusLabels[session.status]}</Badge>
                  {session.meetingUrl ? (
                    <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" className="mx-event-link">
                      Open meeting
                    </a>
                  ) : (
                    <p>Meeting link available {session.meetingLinkAvailableAt ? formatDate(session.meetingLinkAvailableAt) : 'when released'}</p>
                  )}
                </div>
                {session.status === 'cancelled' || session.status === 'no_show' ? (
                  <span className="text-sm text-slate-500">No evaluation</span>
                ) : (
                  <Button size="sm" variant={session.status === 'completed' ? 'outline' : 'primary'}
                    onClick={() => onSelectSession(session)}
                    aria-label={`${session.status === 'completed' ? 'Review scores' : 'Score submission'} for ${session.teamName}`}>
                    {session.status === 'completed' ? 'Review scores' : 'Score submission'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

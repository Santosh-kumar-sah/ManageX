import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
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
      <Card className="mx-auto max-w-2xl p-8">
        <CardHeader>
          <CardTitle>Judge workspace</CardTitle>
          <CardDescription>
            Open the evaluation workspace link provided by the event organiser after accepting your invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info">
            Your accepted invitation is scoped to an evaluation panel. No organisation-wide access or event discovery is granted.
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Judge workspace</h1>
          <p className="mt-1 text-sm text-slate-500">Your assigned evaluation sessions only.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadSessions} disabled={isLoading}>Refresh</Button>
      </div>

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
      ) : sessions.length === 0 ? (
        <EmptyState title="No assigned evaluation sessions" description="Assigned sessions will appear here when the organiser publishes or updates the evaluation schedule." />
      ) : (
        <>
          <SessionGroup
            title="Upcoming and active"
            sessions={sessionGroups.upcoming}
            onSelectSession={setScoringSession}
          />
          <SessionGroup
            title="Past sessions"
            sessions={sessionGroups.past}
            onSelectSession={setScoringSession}
          />
          <JudgeScoringDialog
            isOpen={Boolean(scoringSession)}
            onClose={() => setScoringSession(null)}
            orgId={orgId}
            eventId={eventId}
            roundId={roundId}
            session={scoringSession}
            onScoresSubmitted={loadSessions}
          />
        </>
      )}
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
        <CardDescription>Only sessions assigned to your accepted evaluation panel are shown.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()}`} description="There are no sessions in this group." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Panel</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Meeting</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">{session.teamName}</TableCell>
                    <TableCell>{session.panelName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(session.startsAt)}
                      <br />
                      <span className="text-xs text-slate-500">to {formatDate(session.endsAt)}</span>
                    </TableCell>
                    <TableCell><Badge variant={statusVariant(session.status)}>{session.status}</Badge></TableCell>
                    <TableCell>
                      {session.meetingUrl ? (
                        <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                          Open meeting
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Available {session.meetingLinkAvailableAt ? formatDate(session.meetingLinkAvailableAt) : 'when released'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {session.status === 'cancelled' || session.status === 'no_show' ? (
                        <span className="text-xs text-slate-400 italic">No evaluation</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={session.status === 'completed' ? 'outline' : 'primary'}
                          onClick={() => onSelectSession(session)}
                          aria-label={`Score submission for ${session.teamName}`}
                        >
                          {session.status === 'completed' ? 'Review scores' : 'Score submission'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Gavel,
  Mail,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
} from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  EvaluationConfigurationResponse,
  EvaluationMode,
  EvaluationPanel,
  EvaluationSession,
  EvaluationSessionStatus,
  TeamItem,
} from '@/types/events';

interface MemberOption {
  userId: string;
  fullName: string;
  email: string;
  status: string;
}

interface InvitationNotice {
  id: string;
  panelId: string;
  invitedEmail: string;
  expiresAt: string;
}

type EvaluationRequest = typeof apiClient;

export async function generateEvaluationSchedule(basePath: string, startsAt: string, overwriteExisting = false, request: EvaluationRequest = apiClient) {
  return request(`${basePath}/schedule/generate`, {
    method: 'POST',
    body: JSON.stringify({ startsAt, overwriteExisting }),
  });
}

export async function cancelEvaluationSession(basePath: string, sessionId: string, cancellationReason: string | null, request: EvaluationRequest = apiClient) {
  return request(`${basePath}/sessions/${sessionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason }),
  });
}

export async function publishEvaluationSchedule(basePath: string, action: 'publish' | 'unpublish', request: EvaluationRequest = apiClient) {
  return request(`${basePath}/${action}`, { method: 'POST' });
}

export async function completeEvaluationRequest(basePath: string, request: EvaluationRequest = apiClient) {
  return request(`${basePath}/complete`, { method: 'POST' });
}

export async function rescheduleEvaluationSession(
  basePath: string,
  sessionId: string,
  input: { startsAt: string; endsAt: string; panelId?: string | null; meetingUrl?: string | null },
  request: EvaluationRequest = apiClient
) {
  return request(`${basePath}/sessions/${sessionId}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

const sessionStatuses: EvaluationSessionStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
];

function formatDate(value: string | null | undefined, timeZone?: string) {
  if (!value) return 'Not set';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timeZone || undefined,
      timeZoneName: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function EvaluationPage({ initialLoading = true }: { initialLoading?: boolean } = {}) {
  const { orgId, eventId, roundId } = useParams<{ orgId: string; eventId: string; roundId: string }>();
  const { activeDetails } = useOrg();
  const [configuration, setConfiguration] = useState<EvaluationConfigurationResponse | null>(null);
  const [panels, setPanels] = useState<EvaluationPanel[]>([]);
  const [sessions, setSessions] = useState<EvaluationSession[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPanel, setFilterPanel] = useState('');
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showPanelDialog, setShowPanelDialog] = useState(false);
  const [showSessionDialog, setShowSessionDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [editingPanel, setEditingPanel] = useState<EvaluationPanel | null>(null);
  const [panelToDelete, setPanelToDelete] = useState<EvaluationPanel | null>(null);
  const [sessionToCancel, setSessionToCancel] = useState<EvaluationSession | null>(null);
  const [sessionToReschedule, setSessionToReschedule] = useState<EvaluationSession | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState<'publish' | 'unpublish' | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [invitations, setInvitations] = useState<InvitationNotice[]>([]);

  const permissions = activeDetails?.membership?.permissions || [];
  const canView = permissions.includes('event.evaluation.view');
  const canManage = permissions.includes('event.evaluation.manage');
  const canManageJudges = permissions.includes('event.evaluation.judge.manage');
  const canManageSchedule = permissions.includes('event.evaluation.schedule.manage');
  const canPublish = permissions.includes('event.evaluation.schedule.publish');
  const basePath =
    orgId && eventId && roundId
      ? `/organisations/${orgId}/events/${eventId}/rounds/${roundId}/evaluation`
      : null;

  const [configForm, setConfigForm] = useState({
    evaluationMode: 'submission_based' as EvaluationMode,
    sessionDurationMinutes: 15,
    bufferMinutes: 3,
    judgesPerPanel: 2,
    evaluationsPerTeam: 1,
    scheduleStartsAt: '',
    scheduleEndsAt: '',
    defaultMeetingUrl: '',
  });
  const [panelForm, setPanelForm] = useState({ name: '', meetingUrl: '', notes: '' });
  const [sessionForm, setSessionForm] = useState({
    panelId: '',
    teamId: '',
    submissionId: '',
    startsAt: '',
    endsAt: '',
    meetingUrl: '',
    slotIndex: 0,
    notes: '',
  });
  const [inviteForm, setInviteForm] = useState({ panelId: '', email: '' });
  const [judgeForm, setJudgeForm] = useState<Record<string, string>>({});
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleOverwrite, setScheduleOverwrite] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleForm, setRescheduleForm] = useState({ panelId: '', startsAt: '', endsAt: '', meetingUrl: '' });

  const fetchData = useCallback(async () => {
    if (!basePath || !orgId || !eventId) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const [configRes, panelRes, sessionRes, memberRes, teamRes] = await Promise.all([
        apiClient<EvaluationConfigurationResponse>(basePath),
        apiClient<{ panels: EvaluationPanel[] }>(`${basePath}/panels`),
        apiClient<{ sessions: EvaluationSession[] }>(`${basePath}/sessions`, {
          params: { status: filterStatus || undefined, panelId: filterPanel || undefined },
        }),
        apiClient<{ members: MemberOption[] }>(`/organisations/${orgId}/members`),
        apiClient<{ teams: TeamItem[] }>(`/organisations/${orgId}/events/${eventId}/teams`),
      ]);
      setConfiguration(configRes.data || null);
      setPanels(panelRes.data?.panels || []);
      setSessions(sessionRes.data?.sessions || []);
      setMembers((memberRes.data?.members || []).filter((member) => member.status === 'active'));
      setTeams(teamRes.data?.teams || []);
      const evaluation = configRes.data?.evaluation;
      if (evaluation) {
        setConfigForm({
          evaluationMode: evaluation.evaluationMode,
          sessionDurationMinutes: evaluation.sessionDurationMinutes,
          bufferMinutes: evaluation.bufferMinutes,
          judgesPerPanel: evaluation.judgesPerPanel,
          evaluationsPerTeam: evaluation.evaluationsPerTeam,
          scheduleStartsAt: evaluation.scheduleStartsAt?.slice(0, 16) || '',
          scheduleEndsAt: evaluation.scheduleEndsAt?.slice(0, 16) || '',
          defaultMeetingUrl: evaluation.defaultMeetingUrl || '',
        });
        setScheduleStart(evaluation.scheduleStartsAt?.slice(0, 16) || '');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to load evaluation data.'));
    } finally {
      setIsLoading(false);
    }
  }, [basePath, eventId, filterPanel, filterStatus, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredSessions = useMemo(() => sessions, [sessions]);

  function clearMessages() {
    setMutationError(null);
    setSuccessMessage(null);
  }

  async function runMutation(action: () => Promise<void>, success: string) {
    try {
      setIsMutating(true);
      clearMessages();
      await action();
      setSuccessMessage(success);
      await fetchData();
    } catch (error) {
      setMutationError(getErrorMessage(error, 'The requested evaluation change could not be completed.'));
    } finally {
      setIsMutating(false);
    }
  }

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(basePath, {
        method: configuration?.configured ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...configForm,
          scheduleStartsAt: configForm.scheduleStartsAt ? new Date(configForm.scheduleStartsAt).toISOString() : null,
          scheduleEndsAt: configForm.scheduleEndsAt ? new Date(configForm.scheduleEndsAt).toISOString() : null,
          defaultMeetingUrl: configForm.defaultMeetingUrl || null,
        }),
      });
      setShowConfigDialog(false);
    }, 'Evaluation configuration saved.');
  }

  async function savePanel(event: FormEvent) {
    event.preventDefault();
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(
        editingPanel ? `${basePath}/panels/${editingPanel.id}` : `${basePath}/panels`,
        {
          method: editingPanel ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: panelForm.name,
            meetingUrl: panelForm.meetingUrl || null,
            notes: panelForm.notes || null,
          }),
        }
      );
      setShowPanelDialog(false);
      setEditingPanel(null);
    }, editingPanel ? 'Panel updated.' : 'Panel created.');
  }

  async function deletePanel() {
    if (!basePath || !panelToDelete) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/panels/${panelToDelete.id}`, { method: 'DELETE' });
      setPanelToDelete(null);
    }, 'Panel deleted.');
  }

  async function assignJudge(panel: EvaluationPanel) {
    if (!basePath || !judgeForm[panel.id]) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/panels/${panel.id}/judges`, {
        method: 'POST',
        body: JSON.stringify({ judgeUserId: judgeForm[panel.id] }),
      });
      setJudgeForm((current) => ({ ...current, [panel.id]: '' }));
    }, 'Judge assigned.');
  }

  async function removeJudge(panel: EvaluationPanel, judgeUserId: string) {
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/panels/${panel.id}/judges/${judgeUserId}`, { method: 'DELETE' });
    }, 'Judge removed from panel.');
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault();
    if (!basePath) return;
    await runMutation(async () => {
      const response = await apiClient<{ invitation: InvitationNotice }>(`${basePath}/judge-invitations`, {
        method: 'POST',
        body: JSON.stringify(inviteForm),
      });
      if (response.data?.invitation) setInvitations((current) => [response.data!.invitation, ...current]);
      setShowInviteDialog(false);
      setInviteForm({ panelId: '', email: '' });
    }, 'Invitation sent. A resend replaces the previous pending invitation.');
  }

  async function revokeInvitation(invitation: InvitationNotice) {
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/judge-invitations/${invitation.id}`, { method: 'DELETE' });
      setInvitations((current) => current.filter((item) => item.id !== invitation.id));
    }, 'Invitation revoked.');
  }

  async function createSession(event: FormEvent) {
    event.preventDefault();
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          ...sessionForm,
          submissionId: sessionForm.submissionId || null,
          meetingUrl: sessionForm.meetingUrl || null,
          startsAt: new Date(sessionForm.startsAt).toISOString(),
          endsAt: new Date(sessionForm.endsAt).toISOString(),
        }),
      });
      setShowSessionDialog(false);
    }, 'Evaluation session created.');
  }

  async function generateSchedule() {
    if (!basePath || !scheduleStart) return;
    await runMutation(async () => {
      await generateEvaluationSchedule(basePath, new Date(scheduleStart).toISOString(), scheduleOverwrite);
      setConfirmOverwrite(false);
    }, 'Evaluation schedule generated.');
  }

  async function updateSessionStatus(session: EvaluationSession, status: EvaluationSessionStatus) {
    if (!basePath) return;
    await runMutation(async () => {
      await apiClient(`${basePath}/sessions/${session.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    }, 'Session status updated.');
  }

  async function cancelSession() {
    if (!basePath || !sessionToCancel) return;
    await runMutation(async () => {
      await cancelEvaluationSession(basePath, sessionToCancel.id, cancelReason || null);
      setSessionToCancel(null);
      setCancelReason('');
    }, 'Session cancelled.');
  }

  async function publishSchedule(action: 'publish' | 'unpublish') {
    if (!basePath) return;
    await runMutation(async () => {
      await publishEvaluationSchedule(basePath, action);
      setConfirmPublish(null);
    }, action === 'publish' ? 'Evaluation schedule published.' : 'Evaluation schedule unpublished.');
  }

  async function completeEvaluation() {
    if (!basePath) return;
    await runMutation(async () => {
      await completeEvaluationRequest(basePath);
      setConfirmComplete(false);
    }, 'Evaluation marked complete. Results and round advancement remain unchanged.');
  }

  function openPanel(panel?: EvaluationPanel) {
    setEditingPanel(panel || null);
    setPanelForm({
      name: panel?.name || '',
      meetingUrl: panel?.meetingUrl || '',
      notes: '',
    });
    setShowPanelDialog(true);
  }

  function openReschedule(session: EvaluationSession) {
    setSessionToReschedule(session);
    setRescheduleForm({
      panelId: session.panelId,
      startsAt: session.startsAt.slice(0, 16),
      endsAt: session.endsAt.slice(0, 16),
      meetingUrl: session.meetingUrl || '',
    });
  }

  async function saveReschedule(event: FormEvent) {
    event.preventDefault();
    if (!basePath || !sessionToReschedule) return;
    await runMutation(async () => {
      await rescheduleEvaluationSession(basePath, sessionToReschedule.id, {
        startsAt: new Date(rescheduleForm.startsAt).toISOString(),
        endsAt: new Date(rescheduleForm.endsAt).toISOString(),
        panelId: rescheduleForm.panelId || null,
        meetingUrl: rescheduleForm.meetingUrl || null,
      });
      setSessionToReschedule(null);
    }, 'Evaluation session rescheduled.');
  }

  if (!basePath) {
    return <Alert variant="error">The event round could not be identified.</Alert>;
  }

  if (!canView && !canManage && !canManageJudges && !canManageSchedule && !canPublish) {
    return (
      <Card className="p-8 text-center">
        <CardTitle>Evaluation access restricted</CardTitle>
        <CardDescription className="mt-2">You do not have permission to view this evaluation.</CardDescription>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to={`/app/organisations/${orgId}/events/${eventId}`} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to event
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Evaluation &amp; Judging</h1>
          <p className="mt-1 text-sm text-slate-500">
            Round {configuration?.roundNumber ?? '—'} · {configuration?.roundName ?? 'Evaluation configuration'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
      {mutationError && <Alert variant="error">{mutationError}</Alert>}
      {successMessage && <Alert variant="success">{successMessage}</Alert>}

      {isLoading ? (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between border-b border-slate-100">
              <div>
                <CardTitle className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-brand-600" /> Round evaluation configuration</CardTitle>
                <CardDescription className="mt-2">Evaluation is optional per round and does not publish results or advance the round.</CardDescription>
              </div>
              {canManage && (
                <Button size="sm" onClick={() => setShowConfigDialog(true)}>
                  {configuration?.configured ? 'Edit configuration' : 'Configure evaluation'}
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-5">
              {!configuration?.configured || !configuration.evaluation ? (
                <EmptyState title="Evaluation is not configured" description="Create a round evaluation to manage panels and appointments." />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                  <div><span className="text-xs text-slate-500">Mode</span><p className="font-semibold text-slate-900">{configuration.evaluation.evaluationMode.replace('_', ' ')}</p></div>
                  <div><span className="text-xs text-slate-500">Status</span><p><Badge variant={configuration.evaluation.status === 'published' ? 'success' : 'brand'}>{configuration.evaluation.status}</Badge></p></div>
                  <div><span className="text-xs text-slate-500">Session</span><p className="font-semibold text-slate-900">{configuration.evaluation.sessionDurationMinutes}m + {configuration.evaluation.bufferMinutes}m buffer</p></div>
                  <div><span className="text-xs text-slate-500">Coverage</span><p className="font-semibold text-slate-900">{configuration.evaluation.evaluationsPerTeam} evaluation(s) per team</p></div>
                  <div><span className="text-xs text-slate-500">Panels</span><p className="font-semibold text-slate-900">{configuration.evaluation.panelsCount}</p></div>
                  <div><span className="text-xs text-slate-500">Sessions</span><p className="font-semibold text-slate-900">{configuration.evaluation.sessionsCount}</p></div>
                  <div className="sm:col-span-2"><span className="text-xs text-slate-500">Schedule window</span><p className="font-semibold text-slate-900">{formatDate(configuration.evaluation.scheduleStartsAt)} – {formatDate(configuration.evaluation.scheduleEndsAt)}</p></div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between border-b border-slate-100">
              <div><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-brand-600" /> Evaluation panels</CardTitle><CardDescription className="mt-2">Panel assignments synchronize only evaluation-generated legacy assignments.</CardDescription></div>
              {canManageJudges && <Button size="sm" onClick={() => openPanel()}><Plus className="h-4 w-4" /> Add panel</Button>}
            </CardHeader>
            <CardContent className="pt-5">
              {panels.length === 0 ? <EmptyState title="No panels configured" description="Create a panel before generating an evaluation schedule." /> : (
                <div className="space-y-4">
                  {panels.map((panel) => (
                    <div key={panel.id} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><div className="flex items-center gap-2"><Badge variant="neutral">Panel {panel.panelNumber}</Badge><h3 className="font-semibold text-slate-900">{panel.name}</h3></div><p className="mt-1 text-xs text-slate-500">{panel.meetingUrl || 'No panel meeting link configured'}</p></div>
                        {canManageJudges && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openPanel(panel)}>Edit</Button><Button size="sm" variant="destructive" onClick={() => setPanelToDelete(panel)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button></div>}
                      </div>
                      <div className="mt-4 space-y-2">
                        {panel.judges.map((judge) => <div key={judge.judgeUserId} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm"><span>{judge.judgeName}{judge.judgeEmail ? ` · ${judge.judgeEmail}` : ''}</span>{canManageJudges && <Button size="sm" variant="ghost" onClick={() => removeJudge(panel, judge.judgeUserId)}>Remove</Button>}</div>)}
                        {canManageJudges && <div className="flex gap-2"><Select value={judgeForm[panel.id] || ''} onChange={(event) => setJudgeForm((current) => ({ ...current, [panel.id]: event.target.value }))}><option value="">Select active user to assign</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.fullName} · {member.email}</option>)}</Select><Button size="sm" onClick={() => assignJudge(panel)} disabled={!judgeForm[panel.id] || isMutating}>Assign</Button></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between border-b border-slate-100">
              <div><CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-600" /> Session schedule</CardTitle><CardDescription className="mt-2">Schedule publication is separate from result publication.</CardDescription></div>
              <div className="flex flex-wrap gap-2">{canManageSchedule && <Button size="sm" onClick={() => setShowSessionDialog(true)} disabled={!configuration?.configured}><Plus className="h-4 w-4" /> Add session</Button>}{canManageSchedule && <Button size="sm" variant="outline" onClick={() => scheduleOverwrite ? setConfirmOverwrite(true) : generateSchedule()} disabled={!configuration?.configured || !scheduleStart || isMutating}>Generate schedule</Button>}</div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row"><FormField label="Schedule start" htmlFor="schedule-start" helperText="Uses the configured duration, buffer, panels, and team coverage."><Input id="schedule-start" type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></FormField><FormField label="Status filter" htmlFor="session-status"><Select id="session-status" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}><option value="">All statuses</option>{sessionStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</Select></FormField><FormField label="Panel filter" htmlFor="session-panel"><Select id="session-panel" value={filterPanel} onChange={(event) => setFilterPanel(event.target.value)}><option value="">All panels</option>{panels.map((panel) => <option key={panel.id} value={panel.id}>Panel {panel.panelNumber}: {panel.name}</option>)}</Select></FormField><label className="flex items-center gap-2 self-end pb-2 text-xs text-slate-600"><input type="checkbox" checked={scheduleOverwrite} onChange={(event) => setScheduleOverwrite(event.target.checked)} /> Replace scheduled sessions</label></div>
              {filteredSessions.length === 0 ? <EmptyState title="No evaluation sessions" description="Create a session manually or generate a schedule after panels and teams are ready." /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Panel</TableHead><TableHead>Time</TableHead><TableHead>Status</TableHead><TableHead>Meeting</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{filteredSessions.map((session) => <TableRow key={session.id}><TableCell className="font-medium">{session.teamName}</TableCell><TableCell>{session.panelName}</TableCell><TableCell className="whitespace-nowrap">{formatDate(session.startsAt)}<br /><span className="text-xs text-slate-500">to {formatDate(session.endsAt)}</span></TableCell><TableCell><Badge variant={session.status === 'completed' ? 'success' : session.status === 'cancelled' ? 'danger' : 'brand'}>{session.status}</Badge></TableCell><TableCell>{session.meetingUrl ? <a href={session.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Open link</a> : 'Not set'}</TableCell><TableCell><div className="flex flex-wrap gap-1">{canManageSchedule && !['completed', 'cancelled'].includes(session.status) && <><Select aria-label={`Update status for ${session.teamName}`} value={session.status} onChange={(event) => updateSessionStatus(session, event.target.value as EvaluationSessionStatus)}><option value={session.status}>{session.status}</option>{sessionStatuses.filter((status) => status !== session.status).map((status) => <option key={status} value={status}>{status}</option>)}</Select><Button size="sm" variant="outline" onClick={() => openReschedule(session)}>Reschedule</Button><Button size="sm" variant="destructive" onClick={() => setSessionToCancel(session)}>Cancel</Button></>}</div></TableCell></TableRow>)}</TableBody></Table></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Gavel className="h-4 w-4 text-brand-600" /> Invitations and completion</CardTitle><CardDescription className="mt-2">Judges need a verified account with the invited email. Acceptance does not create organisation membership.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {canManageJudges && <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)}><Mail className="h-4 w-4" /> Invite judge</Button>}
              {invitations.length > 0 && <div className="space-y-2">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>{invitation.invitedEmail} · expires {formatDate(invitation.expiresAt)}</span>{canManageJudges && <Button size="sm" variant="ghost" onClick={() => revokeInvitation(invitation)}>Revoke</Button>}</div>)}</div>}
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">Complete evaluation</p><p className="text-xs text-slate-500">All sessions must be terminal, criteria and required compatible submissions must exist, and required scores must be complete.</p></div>{canManage && <Button onClick={() => setConfirmComplete(true)} disabled={configuration?.evaluation?.status === 'completed' || isMutating}><CheckCircle2 className="h-4 w-4" /> Mark complete</Button>}</div>
              {canPublish && <div className="flex gap-2 border-t border-slate-100 pt-4"><Button size="sm" onClick={() => setConfirmPublish('publish')} disabled={configuration?.evaluation?.status === 'published'}>Publish schedule</Button><Button size="sm" variant="outline" onClick={() => setConfirmPublish('unpublish')} disabled={configuration?.evaluation?.status !== 'published'}>Unpublish schedule</Button></div>}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog isOpen={showConfigDialog} onClose={() => setShowConfigDialog(false)} title={configuration?.configured ? 'Edit evaluation configuration' : 'Configure evaluation'}>
        <form onSubmit={saveConfiguration} className="space-y-4">
          <FormField label="Evaluation mode" htmlFor="evaluation-mode" helperText="Live showcase and hybrid modes retain the existing scoring workflow."><Select id="evaluation-mode" value={configForm.evaluationMode} onChange={(event) => setConfigForm({ ...configForm, evaluationMode: event.target.value as EvaluationMode })}><option value="submission_based">Submission based</option><option value="live_showcase">Live showcase</option><option value="hybrid">Hybrid</option></Select></FormField>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Session duration (minutes)" htmlFor="duration"><Input id="duration" type="number" min={5} max={180} value={configForm.sessionDurationMinutes} onChange={(event) => setConfigForm({ ...configForm, sessionDurationMinutes: Number(event.target.value) })} /></FormField><FormField label="Transition buffer (minutes)" htmlFor="buffer"><Input id="buffer" type="number" min={0} max={60} value={configForm.bufferMinutes} onChange={(event) => setConfigForm({ ...configForm, bufferMinutes: Number(event.target.value) })} /></FormField><FormField label="Judges per panel" htmlFor="judges"><Input id="judges" type="number" min={1} max={20} value={configForm.judgesPerPanel} onChange={(event) => setConfigForm({ ...configForm, judgesPerPanel: Number(event.target.value) })} /></FormField><FormField label="Evaluations per team" htmlFor="evaluations"><Input id="evaluations" type="number" min={1} max={10} value={configForm.evaluationsPerTeam} onChange={(event) => setConfigForm({ ...configForm, evaluationsPerTeam: Number(event.target.value) })} /></FormField></div>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Schedule starts" htmlFor="schedule-starts"><Input id="schedule-starts" type="datetime-local" value={configForm.scheduleStartsAt} onChange={(event) => setConfigForm({ ...configForm, scheduleStartsAt: event.target.value })} /></FormField><FormField label="Schedule ends" htmlFor="schedule-ends"><Input id="schedule-ends" type="datetime-local" value={configForm.scheduleEndsAt} onChange={(event) => setConfigForm({ ...configForm, scheduleEndsAt: event.target.value })} /></FormField></div>
          <FormField label="Default meeting URL" htmlFor="default-meeting-url"><Input id="default-meeting-url" type="url" value={configForm.defaultMeetingUrl} onChange={(event) => setConfigForm({ ...configForm, defaultMeetingUrl: event.target.value })} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowConfigDialog(false)}>Cancel</Button><Button type="submit" isLoading={isMutating}>Save configuration</Button></div>
        </form>
      </Dialog>

      <Dialog isOpen={showPanelDialog} onClose={() => setShowPanelDialog(false)} title={editingPanel ? 'Edit evaluation panel' : 'Create evaluation panel'}>
        <form onSubmit={savePanel} className="space-y-4"><FormField label="Panel name" htmlFor="panel-name" required><Input id="panel-name" required value={panelForm.name} onChange={(event) => setPanelForm({ ...panelForm, name: event.target.value })} /></FormField><FormField label="Meeting URL" htmlFor="panel-url"><Input id="panel-url" type="url" value={panelForm.meetingUrl} onChange={(event) => setPanelForm({ ...panelForm, meetingUrl: event.target.value })} /></FormField><FormField label="Notes" htmlFor="panel-notes"><Textarea id="panel-notes" value={panelForm.notes} onChange={(event) => setPanelForm({ ...panelForm, notes: event.target.value })} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowPanelDialog(false)}>Cancel</Button><Button type="submit" isLoading={isMutating}>Save panel</Button></div></form>
      </Dialog>

      <Dialog isOpen={showInviteDialog} onClose={() => setShowInviteDialog(false)} title="Invite evaluation judge" description="The invitation contains a single-use secret delivered by email. This page never displays it.">
        <form onSubmit={createInvitation} className="space-y-4"><FormField label="Panel" htmlFor="invite-panel" required><Select id="invite-panel" required value={inviteForm.panelId} onChange={(event) => setInviteForm({ ...inviteForm, panelId: event.target.value })}><option value="">Select a panel</option>{panels.map((panel) => <option key={panel.id} value={panel.id}>Panel {panel.panelNumber}: {panel.name}</option>)}</Select></FormField><FormField label="Judge email" htmlFor="invite-email" required helperText="The judge must accept with an authenticated, verified account using this email."><Input id="invite-email" type="email" required value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button><Button type="submit" isLoading={isMutating}>Send invitation</Button></div></form>
      </Dialog>

      <Dialog isOpen={showSessionDialog} onClose={() => setShowSessionDialog(false)} title="Create evaluation session">
        <form onSubmit={createSession} className="space-y-4"><FormField label="Panel" htmlFor="session-panel-create" required><Select id="session-panel-create" required value={sessionForm.panelId} onChange={(event) => setSessionForm({ ...sessionForm, panelId: event.target.value })}><option value="">Select a panel</option>{panels.map((panel) => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</Select></FormField><FormField label="Team" htmlFor="session-team" required><Select id="session-team" required value={sessionForm.teamId} onChange={(event) => setSessionForm({ ...sessionForm, teamId: event.target.value })}><option value="">Select a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField label="Starts" htmlFor="session-start" required><Input id="session-start" type="datetime-local" required value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} /></FormField><FormField label="Ends" htmlFor="session-end" required><Input id="session-end" type="datetime-local" required value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} /></FormField></div><FormField label="Meeting URL" htmlFor="session-url"><Input id="session-url" type="url" value={sessionForm.meetingUrl} onChange={(event) => setSessionForm({ ...sessionForm, meetingUrl: event.target.value })} /></FormField><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowSessionDialog(false)}>Cancel</Button><Button type="submit" isLoading={isMutating}>Create session</Button></div></form>
      </Dialog>

      <ConfirmDialog isOpen={Boolean(panelToDelete)} onClose={() => setPanelToDelete(null)} onConfirm={deletePanel} title="Delete evaluation panel?" description="This may be rejected when the panel has related schedule data. Existing manual judge assignments are not managed by this action." confirmLabel="Delete panel" variant="destructive" isLoading={isMutating} />
      <Dialog isOpen={Boolean(sessionToCancel)} onClose={() => setSessionToCancel(null)} title="Cancel evaluation session?" description="The session record and audit history are preserved.">
        <div className="space-y-4">
          <FormField label="Cancellation reason" htmlFor="cancellation-reason" helperText="This reason is recorded in the audit history.">
            <Textarea id="cancellation-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSessionToCancel(null)} disabled={isMutating}>Keep session</Button>
            <Button variant="destructive" onClick={cancelSession} isLoading={isMutating}>Cancel session</Button>
          </div>
        </div>
      </Dialog>
      <Dialog isOpen={Boolean(sessionToReschedule)} onClose={() => setSessionToReschedule(null)} title="Reschedule evaluation session?" description="The server will validate panel, team, and schedule conflicts before updating this session.">
        <form onSubmit={saveReschedule} className="space-y-4">
          <FormField label="Panel" htmlFor="reschedule-panel" required><Select id="reschedule-panel" required value={rescheduleForm.panelId} onChange={(event) => setRescheduleForm({ ...rescheduleForm, panelId: event.target.value })}><option value="">Select a panel</option>{panels.map((panel) => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</Select></FormField>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Starts" htmlFor="reschedule-starts" required><Input id="reschedule-starts" required type="datetime-local" value={rescheduleForm.startsAt} onChange={(event) => setRescheduleForm({ ...rescheduleForm, startsAt: event.target.value })} /></FormField><FormField label="Ends" htmlFor="reschedule-ends" required><Input id="reschedule-ends" required type="datetime-local" value={rescheduleForm.endsAt} onChange={(event) => setRescheduleForm({ ...rescheduleForm, endsAt: event.target.value })} /></FormField></div>
          <FormField label="Meeting URL" htmlFor="reschedule-meeting-url"><Input id="reschedule-meeting-url" type="url" value={rescheduleForm.meetingUrl} onChange={(event) => setRescheduleForm({ ...rescheduleForm, meetingUrl: event.target.value })} /></FormField>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setSessionToReschedule(null)}>Keep schedule</Button><Button type="submit" isLoading={isMutating}>Save reschedule</Button></div>
        </form>
      </Dialog>
      <ConfirmDialog isOpen={confirmOverwrite} onClose={() => setConfirmOverwrite(false)} onConfirm={generateSchedule} title="Replace scheduled sessions?" description="Overwrite will replace existing scheduled sessions for this evaluation. Completed and cancelled history is not treated as ordinary editable schedule data." confirmLabel="Generate and replace" variant="destructive" isLoading={isMutating} />
      <ConfirmDialog isOpen={Boolean(confirmPublish)} onClose={() => setConfirmPublish(null)} onConfirm={() => confirmPublish && publishSchedule(confirmPublish)} title={confirmPublish === 'publish' ? 'Publish evaluation schedule?' : 'Unpublish evaluation schedule?'} description={confirmPublish === 'publish' ? 'Participants will see permitted sessions according to the backend release rules.' : 'Unpublishing hides participant sessions and meeting links.'} confirmLabel={confirmPublish === 'publish' ? 'Publish schedule' : 'Unpublish schedule'} isLoading={isMutating} />
      <ConfirmDialog isOpen={confirmComplete} onClose={() => setConfirmComplete(false)} onConfirm={completeEvaluation} title="Complete evaluation?" description="The server will verify terminal sessions, criteria, compatible submissions, and required scores. This does not publish results or advance the round." confirmLabel="Complete evaluation" isLoading={isMutating} />
    </div>
  );
}

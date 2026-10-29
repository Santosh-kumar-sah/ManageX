import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Calendar,
  Clock,
  MapPin,
  Globe,
  Users,
  CheckCircle2,
  AlertCircle,
  Building2,
  Code2,
  ArrowLeft,
  Share2,
  Crown,
  LogOut,
  PlusCircle,
  UserPlus,
  ExternalLink,
  FileText,
  Trash2,
  Trophy,
  Mail,
  Key,
  Presentation,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import {
  EventItem,
  RegistrationItem,
  TeamItem,
  TeamInvitation,
  MyPendingInvitation,
  SubmissionItem,
  EventResultItem,
  EventRound,
} from '@/types/events';
import { ParticipantEvaluationSchedule } from '@/components/events/ParticipantEvaluationSchedule';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';

export function PublicEventDetailPage({
  initialEvent = null,
  initialRegistration = null,
  initialMyTeam = null,
  initialTeams = [],
  initialSubmission = null,
  initialResults = [],
  initialPendingInvites = [],
  initialRounds = [],
  initialLoading = true,
}: {
  initialEvent?: EventItem | null;
  initialRegistration?: RegistrationItem | null;
  initialMyTeam?: TeamItem | null;
  initialTeams?: TeamItem[];
  initialSubmission?: SubmissionItem | null;
  initialResults?: EventResultItem[];
  initialPendingInvites?: MyPendingInvitation[];
  initialRounds?: EventRound[];
  initialLoading?: boolean;
} = {}) {
  const { eventId } = useParams<{ eventId: string }>();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [event, setEvent] = useState<EventItem | null>(initialEvent);
  const [registration, setRegistration] = useState<RegistrationItem | null>(initialRegistration);
  const [teams, setTeams] = useState<TeamItem[]>(initialTeams);
  const [myTeam, setMyTeam] = useState<TeamItem | null>(initialMyTeam);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [teamActionSuccess, setTeamActionSuccess] = useState<string | null>(null);
  const [showLeaveTeamConfirm, setShowLeaveTeamConfirm] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [joiningTeamId, setJoiningTeamId] = useState<string | null>(null);

  // Invitations State (EVT-006, ADR-007)
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [myPendingInvites, setMyPendingInvites] = useState<MyPendingInvitation[]>(initialPendingInvites);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [showTokenAcceptModal, setShowTokenAcceptModal] = useState(false);
  const [acceptTokenInput, setAcceptTokenInput] = useState('');
  const [isAcceptingToken, setIsAcceptingToken] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [generatedTokenNotice, setGeneratedTokenNotice] = useState<string | null>(null);

  // Submissions State (EVT-007)
  const [mySubmission, setMySubmission] = useState<SubmissionItem | null>(initialSubmission);
  const [isLoadingSubmission, setIsLoadingSubmission] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [subTitle, setSubTitle] = useState(initialSubmission?.title || '');
  const [subDesc, setSubDesc] = useState(initialSubmission?.description || '');
  const [subRepoUrl, setSubRepoUrl] = useState(initialSubmission?.repositoryUrl || '');
  const [subDemoUrl, setSubDemoUrl] = useState(initialSubmission?.demoUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

  // Results State (EVT-009)
  const [publicResults, setPublicResults] = useState<EventResultItem[]>(initialResults);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  // Rounds State (EVT-010 / Phase 4D)
  const [eventRounds, setEventRounds] = useState<EventRound[]>(initialRounds);
  const [isLoadingRounds, setIsLoadingRounds] = useState(false);

  const [isLoading, setIsLoading] = useState(initialEvent ? false : initialLoading);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 1. Fetch public event details
  const fetchEventDetails = useCallback(async () => {
    if (!eventId) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await apiClient<{ event: EventItem }>(`/events/${eventId}`);
      if (res.data?.event) {
        setEvent(res.data.event);
      } else {
        setErrorMessage('Event not found or is not publicly accessible.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load event details. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  // 2. Fetch authenticated user's registration status
  const fetchRegistrationStatus = useCallback(async (orgId: string, evtId: string) => {
    if (!isAuthenticated) {
      setRegistration(null);
      return;
    }

    try {
      setIsStatusLoading(true);
      const res = await apiClient<{ registration: RegistrationItem | null }>(
        `/organisations/${orgId}/events/${evtId}/my-registration`
      );
      setRegistration(res.data?.registration || null);
    } catch {
      // If fetching status fails (e.g. not registered), set null
      setRegistration(null);
    } finally {
      setIsStatusLoading(false);
    }
  }, [isAuthenticated]);

  const isHackathon = event?.eventType === 'hackathon';

  const fetchTeams = useCallback(async (orgId: string, evtId: string) => {
    try {
      setIsLoadingTeams(true);
      const res = await apiClient<{ teams: TeamItem[] }>(
        `/organisations/${orgId}/events/${evtId}/teams`
      );
      if (res.data?.teams) {
        setTeams(res.data.teams);
      }
    } catch {
      // silently handle
    } finally {
      setIsLoadingTeams(false);
    }
  }, []);

  const fetchMyTeam = useCallback(async (orgId: string, evtId: string) => {
    if (!isAuthenticated) {
      setMyTeam(null);
      return;
    }
    try {
      const res = await apiClient<{ team: TeamItem | null }>(
        `/organisations/${orgId}/events/${evtId}/my-team`
      );
      setMyTeam(res.data?.team || null);
    } catch {
      setMyTeam(null);
    }
  }, [isAuthenticated]);

  const fetchTeamInvitations = useCallback(async (orgId: string, evtId: string, teamId: string) => {
    try {
      const res = await apiClient<{ invitations: TeamInvitation[] }>(
        `/organisations/${orgId}/events/${evtId}/teams/${teamId}/invites`
      );
      if (res.data?.invitations) {
        setTeamInvitations(res.data.invitations);
      }
    } catch {
      // not owner or error
    }
  }, []);

  const fetchMyPendingInvites = useCallback(async (orgId: string, evtId: string) => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient<{ invitations: MyPendingInvitation[] }>(
        `/organisations/${orgId}/events/${evtId}/my-team-invitations`
      );
      if (res.data?.invitations) {
        setMyPendingInvites(res.data.invitations);
      }
    } catch {
      // silently handle
    }
  }, [isAuthenticated]);

  const fetchMySubmission = useCallback(async (orgId: string, evtId: string) => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingSubmission(true);
      const res = await apiClient<{ submission: SubmissionItem | null }>(
        `/organisations/${orgId}/events/${evtId}/my-submission`
      );
      if (res.data?.submission) {
        setMySubmission(res.data.submission);
        setSubTitle(res.data.submission.title);
        setSubDesc(res.data.submission.description || '');
        setSubRepoUrl(res.data.submission.repositoryUrl || '');
        setSubDemoUrl(res.data.submission.demoUrl || '');
      } else {
        setMySubmission(null);
      }
    } catch {
      setMySubmission(null);
    } finally {
      setIsLoadingSubmission(false);
    }
  }, [isAuthenticated]);

  const fetchPublicResults = useCallback(async (evtId: string) => {
    try {
      setIsLoadingResults(true);
      const res = await apiClient<{ results: EventResultItem[] }>(`/events/${evtId}/results`);
      if (res.data?.results) {
        setPublicResults(res.data.results);
      }
    } catch {
      // results not published or error
    } finally {
      setIsLoadingResults(false);
    }
  }, []);

  const fetchEventRounds = useCallback(async (evtId: string) => {
    try {
      setIsLoadingRounds(true);
      const res = await apiClient<{ rounds: EventRound[] }>(`/events/${evtId}/rounds`);
      if (res.data?.rounds) {
        setEventRounds(res.data.rounds);
      }
    } catch {
      // silently handle
    } finally {
      setIsLoadingRounds(false);
    }
  }, []);

  useEffect(() => {
    fetchEventDetails();
  }, [fetchEventDetails]);

  useEffect(() => {
    if (event?.organisationId && event?.id) {
      fetchRegistrationStatus(event.organisationId, event.id);
      if (isHackathon) {
        fetchTeams(event.organisationId, event.id);
        fetchMyTeam(event.organisationId, event.id);
        fetchMyPendingInvites(event.organisationId, event.id);
        fetchEventRounds(event.id);
      }
      fetchMySubmission(event.organisationId, event.id);
      if (event.resultsPublishedAt) {
        fetchPublicResults(event.id);
      }
    }
  }, [
    event?.organisationId,
    event?.id,
    event?.resultsPublishedAt,
    isHackathon,
    fetchRegistrationStatus,
    fetchTeams,
    fetchMyTeam,
    fetchMyPendingInvites,
    fetchEventRounds,
    fetchMySubmission,
    fetchPublicResults,
  ]);

  useEffect(() => {
    if (event?.organisationId && event?.id && myTeam?.id) {
      const isOwner =
        myTeam.createdById === user?.id ||
        myTeam.members?.some((m) => m.userId === user?.id && m.isOwner);
      if (isOwner) {
        fetchTeamInvitations(event.organisationId, event.id, myTeam.id);
      }
    }
  }, [event?.organisationId, event?.id, myTeam, user?.id, fetchTeamInvitations]);

  // 3. Register Handler
  async function handleRegister() {
    if (!event) return;
    setIsActionLoading(true);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      const res = await apiClient<{ registration: RegistrationItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/register`,
        {
          method: 'POST',
          body: JSON.stringify({ customAnswers: {} }),
        }
      );

      if (res.data?.registration) {
        setRegistration(res.data.registration);
        setActionSuccessMessage('Successfully registered for this event!');
        if (isHackathon) {
          fetchMyTeam(event.organisationId, event.id);
          fetchTeams(event.organisationId, event.id);
          fetchMyPendingInvites(event.organisationId, event.id);
        }
        fetchMySubmission(event.organisationId, event.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActionErrorMessage(err.message);
      } else {
        setActionErrorMessage('Failed to complete registration. Please try again.');
      }
    } finally {
      setIsActionLoading(false);
    }
  }

  // 4. Withdraw Handler
  async function handleWithdraw() {
    if (!event) return;
    setIsActionLoading(true);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      const res = await apiClient<{ registration: RegistrationItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/withdraw`,
        {
          method: 'POST',
        }
      );

      if (res.data?.registration) {
        setRegistration(res.data.registration);
        setActionSuccessMessage('Your registration has been withdrawn.');
        setShowWithdrawConfirm(false);
        if (isHackathon) {
          fetchMyTeam(event.organisationId, event.id);
          fetchTeams(event.organisationId, event.id);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActionErrorMessage(err.message);
      } else {
        setActionErrorMessage('Failed to withdraw registration. Please try again.');
      }
    } finally {
      setIsActionLoading(false);
    }
  }

  // 5. Team Handlers (Phase 6C-1)
  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !newTeamName.trim()) return;

    setIsCreatingTeam(true);
    setTeamActionError(null);
    setTeamActionSuccess(null);

    try {
      const res = await apiClient<{ team: TeamItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/teams`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTeamName.trim(),
            description: newTeamDesc.trim() || undefined,
          }),
        }
      );

      if (res.data?.team) {
        setMyTeam(res.data.team);
        setTeamActionSuccess(`Team "${res.data.team.name}" created successfully!`);
        setShowCreateTeamModal(false);
        setNewTeamName('');
        setNewTeamDesc('');
        fetchTeams(event.organisationId, event.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to create team. Please try again.');
      }
    } finally {
      setIsCreatingTeam(false);
    }
  }

  async function handleJoinTeam(teamId: string) {
    if (!event) return;

    setJoiningTeamId(teamId);
    setTeamActionError(null);
    setTeamActionSuccess(null);

    try {
      await apiClient<{ message: string; teamId: string }>(
        `/organisations/${event.organisationId}/events/${event.id}/teams/${teamId}/join`,
        {
          method: 'POST',
        }
      );

      setTeamActionSuccess('Joined team successfully!');
      fetchMyTeam(event.organisationId, event.id);
      fetchTeams(event.organisationId, event.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to join team. Please try again.');
      }
    } finally {
      setJoiningTeamId(null);
    }
  }

  async function handleLeaveTeam() {
    if (!event || !myTeam) return;

    setIsLeavingTeam(true);
    setTeamActionError(null);
    setTeamActionSuccess(null);

    try {
      await apiClient(
        `/organisations/${event.organisationId}/events/${event.id}/teams/${myTeam.id}/leave`,
        {
          method: 'POST',
        }
      );

      setMyTeam(null);
      setShowLeaveTeamConfirm(false);
      setTeamActionSuccess('You have left the team.');
      fetchTeams(event.organisationId, event.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to leave team. Please try again.');
      }
    } finally {
      setIsLeavingTeam(false);
    }
  }

  // 6. Invitation Handlers (Phase 6C-2)
  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !myTeam || !inviteEmail.trim()) return;

    setIsInviting(true);
    setTeamActionError(null);
    setTeamActionSuccess(null);
    setGeneratedTokenNotice(null);

    try {
      const res = await apiClient<{ invitation: { token: string; email: string; expiresAt: string } }>(
        `/organisations/${event.organisationId}/events/${event.id}/teams/${myTeam.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email: inviteEmail.trim() }),
        }
      );

      if (res.data?.invitation) {
        setTeamActionSuccess(`Invitation sent to ${res.data.invitation.email}!`);
        if (res.data.invitation.token) {
          setGeneratedTokenNotice(res.data.invitation.token);
        }
        setShowInviteModal(false);
        setInviteEmail('');
        fetchTeamInvitations(event.organisationId, event.id, myTeam.id);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to send team invitation.');
      }
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRevokeInvite(invitationId: string) {
    if (!event || !myTeam) return;

    setRevokingInviteId(invitationId);
    setTeamActionError(null);
    setTeamActionSuccess(null);

    try {
      await apiClient(
        `/organisations/${event.organisationId}/events/${event.id}/teams/${myTeam.id}/invites/${invitationId}`,
        {
          method: 'DELETE',
        }
      );

      setTeamActionSuccess('Invitation revoked successfully.');
      fetchTeamInvitations(event.organisationId, event.id, myTeam.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to revoke invitation.');
      }
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function handleAcceptToken(token: string) {
    if (!event || !token.trim()) return;

    setIsAcceptingToken(true);
    setTeamActionError(null);
    setTeamActionSuccess(null);

    try {
      await apiClient(
        `/organisations/${event.organisationId}/events/${event.id}/team-invites/${token.trim()}/accept`,
        {
          method: 'POST',
        }
      );

      setTeamActionSuccess('Successfully joined team from invitation!');
      setShowTokenAcceptModal(false);
      setAcceptTokenInput('');
      fetchMyTeam(event.organisationId, event.id);
      fetchTeams(event.organisationId, event.id);
      fetchMyPendingInvites(event.organisationId, event.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      } else {
        setTeamActionError('Failed to accept invitation.');
      }
    } finally {
      setIsAcceptingToken(false);
    }
  }

  async function handleDeclineInvite(token: string) {
    if (!event || !token) return;

    try {
      await apiClient(
        `/organisations/${event.organisationId}/events/${event.id}/team-invites/${token}/reject`,
        {
          method: 'POST',
        }
      );

      setTeamActionSuccess('Invitation declined.');
      fetchMyPendingInvites(event.organisationId, event.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setTeamActionError(err.message);
      }
    }
  }

  // 7. Submission Handlers (Phase 6C-3)
  async function handleSaveSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!event || !subTitle.trim()) return;

    setIsSubmitting(true);
    setSubmissionError(null);
    setSubmissionSuccess(null);

    try {
      const res = await apiClient<{ submission: SubmissionItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/submissions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: subTitle.trim(),
            description: subDesc.trim() || undefined,
            repositoryUrl: subRepoUrl.trim() || undefined,
            demoUrl: subDemoUrl.trim() || undefined,
          }),
        }
      );

      if (res.data?.submission) {
        setMySubmission(res.data.submission);
        setSubmissionSuccess('Project submission saved successfully!');
        setShowSubmissionModal(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmissionError(err.message);
      } else {
        setSubmissionError('Failed to save project submission.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString?: string | null, tz?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })} ${tz || ''}`.trim();
    } catch {
      return '';
    }
  };

  // Registration window check
  const now = new Date();
  const regOpen = event?.registrationOpensAt ? new Date(event.registrationOpensAt) : null;
  const regClose = event?.registrationClosesAt
    ? new Date(event.registrationClosesAt)
    : event?.endAt
    ? new Date(event.endAt)
    : event?.startAt
    ? new Date(event.startAt)
    : null;

  const isRegistrationNotYetOpen = regOpen && now < regOpen;
  const isRegistrationClosed = regClose && now > regClose;
  const isEventOpenForRegistration =
    event?.status === 'published' && !isRegistrationNotYetOpen && !isRegistrationClosed;
  const isRegistered = registration?.status === 'registered';

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !event) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Alert variant="error" title="Event Unavailable">
          {errorMessage || 'The requested event could not be found or is not publicly published.'}
        </Alert>
        <div className="mt-6">
          <Link to="/events">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Events</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Back Navigation & Action Bar */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>All Events</span>
        </Link>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5 text-slate-400" />
          <span>{copiedLink ? 'Link Copied!' : 'Share Event'}</span>
        </button>
      </div>

      {/* Main Grid: Details (Left 2 cols) & Registration Card (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Event Metadata & Body */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isHackathon ? 'brand' : 'neutral'}>
                {isHackathon ? (
                  <span className="flex items-center gap-1">
                    <Code2 className="h-3 w-3" />
                    Hackathon
                  </span>
                ) : (
                  'General Event'
                )}
              </Badge>

              <Badge variant="success">Published</Badge>

              {event.organisation && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 ml-auto">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Hosted by {event.organisation.name}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {event.title}
            </h1>

            {/* Quick Meta Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-800">Event Schedule</div>
                  <div>
                    {formatDate(event.startAt)} – {formatDate(event.endAt)}
                  </div>
                  <div className="text-slate-500">
                    {formatTime(event.startAt, event.timezone)}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                {event.locationType === 'virtual' ? (
                  <Globe className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-800">
                    {event.locationType === 'virtual'
                      ? 'Virtual Event'
                      : event.locationType === 'hybrid'
                      ? 'Hybrid Format'
                      : 'In-Person Venue'}
                  </div>
                  <div className="text-slate-500">
                    {event.location || (event.locationType === 'virtual' ? 'Online meeting' : 'Venue TBA')}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* About / Description */}
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-border pb-3">
              About this Event
            </h2>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {event.description || 'No detailed description provided by the event host.'}
            </div>

            {(registration?.participantInstructions || event.participantInstructions) && registration?.status === 'registered' && (
              <div className="mt-6 pt-4 border-t border-border bg-slate-50 p-4 rounded-lg">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Instructions for Registered Participants
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {registration?.participantInstructions || event.participantInstructions}
                </p>
              </div>
            )}
          </Card>

          {/* Hackathon Details (If applicable) */}
          {isHackathon && (
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 border-b border-border pb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-brand-600" />
                <span>Hackathon Guidelines & Rules</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-surface-subtle border border-border">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-brand-600" />
                    <span>Team Composition</span>
                  </div>
                  <div className="text-slate-600">
                    Teams may range from{' '}
                    <span className="font-semibold text-slate-900">
                      {event.teamSizeMin || 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-slate-900">
                      {event.teamSizeMax || 4} members
                    </span>.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-subtle border border-border">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-brand-600" />
                    <span>Project Submissions</span>
                  </div>
                  <div className="text-slate-600">
                    {event.submissionOpensAt && event.submissionClosesAt ? (
                      <span>
                        Opens: {formatDate(event.submissionOpensAt)}
                        <br />
                        Closes: {formatDate(event.submissionClosesAt)}
                      </span>
                    ) : (
                      <span>Submissions accepted during the event window.</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Hackathon Teams (Phase 6C-1) */}
          {isHackathon && (
            <Card className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-5 w-5 text-brand-600" />
                    <span>Hackathon Teams</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Form teams of {event.teamSizeMin || 1} to {event.teamSizeMax || 4} members.
                  </p>
                </div>
                {isRegistered && !myTeam && isEventOpenForRegistration && (
                  <Button
                    size="sm"
                    variant="primary"
                    className="text-xs flex items-center gap-1.5"
                    onClick={() => {
                      setTeamActionError(null);
                      setShowCreateTeamModal(true);
                    }}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Create Team
                  </Button>
                )}
              </div>

              {teamActionSuccess && (
                <Alert variant="success" title="Success">
                  {teamActionSuccess}
                </Alert>
              )}

              {teamActionError && (
                <Alert variant="error" title="Team Error">
                  {teamActionError}
                </Alert>
              )}

              {/* View 1: Current User is in a Team */}
              {myTeam ? (
                <div className="p-4 rounded-lg border border-brand-200 bg-brand-50/20 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900">{myTeam.name}</h3>
                        <Badge variant="brand" className="text-xs">Your Team</Badge>
                        {(myTeam.createdById === user?.id || myTeam.members?.some(m => m.userId === user?.id && m.isOwner)) && (
                          <Badge variant="success" className="text-xs flex items-center gap-1">
                            <Crown className="h-3 w-3" />
                            Owner
                          </Badge>
                        )}
                        <Badge variant="neutral" className="text-xs">
                          {myTeam.members?.length || myTeam.memberCount} / {event.teamSizeMax || 4} Members
                        </Badge>
                      </div>
                      {myTeam.description && (
                        <p className="text-xs text-slate-600 mt-1">{myTeam.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(myTeam.createdById === user?.id || myTeam.members?.some(m => m.userId === user?.id && m.isOwner)) &&
                        (myTeam.members?.length || myTeam.memberCount) < (event.teamSizeMax || 4) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs flex items-center gap-1"
                            onClick={() => {
                              setGeneratedTokenNotice(null);
                              setShowInviteModal(true);
                            }}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Invite Member
                          </Button>
                        )}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs flex items-center gap-1"
                        onClick={() => setShowLeaveTeamConfirm(true)}
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Leave Team
                      </Button>
                    </div>
                  </div>

                  {/* Team Members List */}
                  <div className="pt-3 border-t border-brand-100">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Roster
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {myTeam.members && myTeam.members.length > 0 ? (
                        myTeam.members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between p-2.5 rounded-md bg-white border border-slate-200 text-xs shadow-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-semibold text-slate-900 truncate">
                                {member.user?.fullName || 'Participant'}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate font-mono">
                                {member.user?.email || member.userId}
                              </div>
                            </div>
                            {member.isOwner && (
                              <Badge variant="brand" className="text-[10px] shrink-0 flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                Owner
                              </Badge>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500 italic">No member details available.</p>
                      )}
                    </div>
                  </div>

                  {/* Sent Invitations (Visible to Team Owner) */}
                  {(myTeam.createdById === user?.id || myTeam.members?.some(m => m.userId === user?.id && m.isOwner)) && (
                    <div className="pt-3 border-t border-brand-100 space-y-2">
                      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                        Sent Invitations ({teamInvitations.length})
                      </div>
                      {generatedTokenNotice && (
                        <Alert variant="info" title="Invitation Token Generated">
                          <p className="font-mono text-xs select-all text-slate-800 break-all">{generatedTokenNotice}</p>
                          <p className="text-[11px] mt-1 text-slate-500">
                            Valid for 7 days. The invitee can join using this token.
                          </p>
                        </Alert>
                      )}
                      {teamInvitations.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No invitations sent yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {teamInvitations.map((inv) => (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between p-2.5 rounded bg-white border border-slate-200 text-xs"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-medium text-slate-800 block truncate">{inv.invitedEmail}</span>
                                <span className="text-[11px] text-slate-400 block">
                                  Expires {formatDate(inv.expiresAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  variant={
                                    inv.status === 'accepted'
                                      ? 'success'
                                      : inv.status === 'pending'
                                      ? 'brand'
                                      : 'neutral'
                                  }
                                  className="text-[10px] capitalize"
                                >
                                  {inv.status}
                                </Badge>
                                {inv.status === 'pending' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-[11px]"
                                    isLoading={revokingInviteId === inv.id}
                                    onClick={() => handleRevokeInvite(inv.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : !isRegistered ? (
                /* View 2: User is NOT registered */
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <p className="font-medium text-slate-800 mb-1">Registration Required for Teams</p>
                  <p>
                    You must register for this hackathon before creating or joining a team. Use the registration card on the right to sign up.
                  </p>
                </div>
              ) : (
                /* View 3: User IS registered, NOT in a team */
                <div className="space-y-4">
                  {/* Received Invitations Banner */}
                  {myPendingInvites.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 space-y-2">
                      <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                        <Mail className="h-4 w-4 text-indigo-600" />
                        <span>You Have Received Team Invitations</span>
                      </div>
                      <div className="space-y-2">
                        {myPendingInvites.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded bg-white border border-indigo-100"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{inv.teamName}</span>
                              <span className="text-slate-500 text-[11px] block">
                                Invited by {inv.invitedByName} · Expires {formatDate(inv.expiresAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                className="text-xs"
                                onClick={() => handleJoinTeam(inv.teamId)}
                              >
                                Join Team
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs text-slate-500 hover:text-slate-700"
                                onClick={() => handleDeclineInvite(inv.id)}
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-bold">You are not in a team yet.</span>
                      <p className="text-amber-800 text-[11px] mt-0.5">
                        Create a new team, join an open team below, or accept an invitation token.
                      </p>
                    </div>
                    {isEventOpenForRegistration && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs flex items-center gap-1"
                          onClick={() => {
                            setTeamActionError(null);
                            setShowTokenAcceptModal(true);
                          }}
                        >
                          <Key className="h-3.5 w-3.5" />
                          Accept Token
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          className="text-xs"
                          onClick={() => {
                            setTeamActionError(null);
                            setShowCreateTeamModal(true);
                          }}
                        >
                          Create Team
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Available Teams List */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                      Event Teams ({teams.length})
                    </h3>
                    {isLoadingTeams ? (
                      <div className="py-4 text-center space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : teams.length === 0 ? (
                      <div className="p-6 text-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500">
                        No teams have been formed yet. Be the first to create one!
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {teams.map((t) => {
                          const isFull = t.memberCount >= (event.teamSizeMax || 4);
                          const isJoiningThis = joiningTeamId === t.id;
                          return (
                            <div
                              key={t.id}
                              className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-semibold text-slate-900">{t.name}</h4>
                                  <Badge
                                    variant={isFull ? 'neutral' : 'success'}
                                    className="text-[10px]"
                                  >
                                    {t.memberCount} / {event.teamSizeMax || 4} Members
                                  </Badge>
                                  {isFull && (
                                    <Badge variant="warning" className="text-[10px]">
                                      Full
                                    </Badge>
                                  )}
                                </div>
                                {t.description && (
                                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.description}</p>
                                )}
                                {t.owner && (
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Owner: {t.owner.fullName || t.owner.email}
                                  </p>
                                )}
                              </div>
                              <div className="shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isFull || isJoiningThis || !isEventOpenForRegistration}
                                  isLoading={isJoiningThis}
                                  onClick={() => handleJoinTeam(t.id)}
                                  className="text-xs flex items-center gap-1.5"
                                >
                                  {!isFull && <UserPlus className="h-3.5 w-3.5" />}
                                  <span>{isFull ? 'Team Full' : 'Join Team'}</span>
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Project Submission Card (EVT-007) */}
          {isRegistered && (
            <Card className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-brand-600" />
                    <span>Project Submission</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Submit your project deliverable URLs before the submission deadline.
                  </p>
                </div>
                {(!event.submissionClosesAt || new Date() <= new Date(event.submissionClosesAt)) &&
                  ['published', 'in_progress'].includes(event.status) && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-xs flex items-center gap-1.5"
                      onClick={() => {
                        setSubmissionError(null);
                        setSubmissionSuccess(null);
                        setShowSubmissionModal(true);
                      }}
                    >
                      <PlusCircle className="h-4 w-4" />
                      {mySubmission ? 'Edit Submission' : 'Submit Project'}
                    </Button>
                  )}
              </div>

              {submissionSuccess && (
                <Alert variant="success" title="Success">
                  {submissionSuccess}
                </Alert>
              )}

              {submissionError && (
                <Alert variant="error" title="Submission Error">
                  {submissionError}
                </Alert>
              )}

              {isLoadingSubmission ? (
                <div className="py-4 text-center">
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : mySubmission ? (
                <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">{mySubmission.title}</h3>
                    <Badge variant="success" className="text-xs capitalize">
                      {mySubmission.status}
                    </Badge>
                  </div>

                  {mySubmission.description && (
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">
                      {mySubmission.description}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs">
                    {mySubmission.repositoryUrl ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <Code2 className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-slate-500 shrink-0">Repository:</span>
                        <a
                          href={mySubmission.repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-brand-600 hover:underline flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{mySubmission.repositoryUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-slate-400 italic">No repository URL provided.</div>
                    )}

                    {mySubmission.demoUrl ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-slate-500 shrink-0">Live Demo:</span>
                        <a
                          href={mySubmission.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-brand-600 hover:underline flex items-center gap-1 truncate"
                        >
                          <span className="truncate">{mySubmission.demoUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-slate-400 italic">No demo URL provided.</div>
                    )}
                  </div>

                  {mySubmission.submittedAt && (
                    <div className="text-[11px] text-slate-400 pt-1">
                      Submitted on {formatDate(mySubmission.submittedAt)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 text-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500 space-y-2">
                  <p>You have not submitted a project for this event yet.</p>
                  {(!event.submissionClosesAt || new Date() <= new Date(event.submissionClosesAt)) &&
                  ['published', 'in_progress'].includes(event.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSubmissionModal(true)}
                      className="text-xs"
                    >
                      Create Submission
                    </Button>
                  ) : (
                    <p className="text-amber-700 font-medium">Submissions are currently closed.</p>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Participant Evaluation Appointments (EVT-009 / Phase 4D) */}
          {isHackathon && isRegistered && myTeam && (isLoadingRounds || eventRounds.length > 0) && (
            <Card className="p-6 space-y-4" data-testid="participant-evaluation-section">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
                    <Presentation className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Evaluation Schedule</h2>
                    <p className="text-xs text-slate-500">
                      Live presentation appointments and judging panels scheduled for your team.
                    </p>
                  </div>
                </div>
              </div>

              {isLoadingRounds ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : (
                <div className="space-y-3">
                  {eventRounds.map((round) => (
                    <ParticipantEvaluationSchedule
                      key={round.id}
                      eventId={event.id}
                      roundId={round.id}
                      roundName={round.name}
                      roundNumber={round.roundNumber}
                      teamId={myTeam.id}
                      teamName={myTeam.name}
                      timezone={event.timezone}
                      showEmptyState={true}
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Published Results & Leaderboard (EVT-009) */}
          {event.resultsPublishedAt && (
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Official Results & Leaderboard</h2>
                    <p className="text-xs text-slate-500">
                      Calculated rankings and final aggregate scores published on {formatDate(event.resultsPublishedAt)}.
                    </p>
                  </div>
                </div>
                <Badge variant="brand" className="text-xs">
                  Official
                </Badge>
              </div>

              {isLoadingResults ? (
                <div className="py-4 space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : publicResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                  No submissions were scored for this event.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {publicResults.map((result) => {
                    const isTop1 = result.rank === 1;
                    const isTop2 = result.rank === 2;
                    const isTop3 = result.rank === 3;
                    return (
                      <div
                        key={result.submissionId}
                        className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isTop1
                            ? 'bg-amber-50/60 border-amber-300'
                            : isTop2
                            ? 'bg-slate-50 border-slate-300'
                            : isTop3
                            ? 'bg-orange-50/40 border-orange-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              isTop1
                                ? 'bg-amber-400 text-amber-950 shadow-xs'
                                : isTop2
                                ? 'bg-slate-300 text-slate-900'
                                : isTop3
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            #{result.rank}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                              <span className="truncate">{result.teamName || result.title}</span>
                              {result.teamName && (
                                <span className="text-xs text-slate-400 font-normal">({result.title})</span>
                              )}
                            </div>
                            {result.description && (
                              <p className="text-xs text-slate-500 line-clamp-1">{result.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 sm:self-center">
                          {result.demoUrl && (
                            <a
                              href={result.demoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-brand-600 hover:underline flex items-center gap-1"
                            >
                              <span>Demo</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <div className="text-right">
                            <span className="text-xs text-slate-500 block">Total Score</span>
                            <span className="text-sm font-bold text-slate-900">
                              {Number(result.totalScore).toFixed(1)} pts
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Right Column: Registration Card & Action Panel */}
        <div className="space-y-6">
          <Card className="p-6 shadow-card border-border sticky top-20">
            <CardHeader className="p-0 pb-4 border-b border-border">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center justify-between">
                <span>Participation</span>
                {event.capacity && (
                  <Badge variant="neutral" className="text-xs font-normal">
                    Capacity: {event.capacity}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0 pt-4 space-y-4">
              {/* Action feedback alerts */}
              {actionSuccessMessage && (
                <Alert variant="success" title="Success">
                  {actionSuccessMessage}
                </Alert>
              )}

              {actionErrorMessage && (
                <Alert variant="error" title="Registration Error">
                  {actionErrorMessage}
                </Alert>
              )}

              {/* Status Timeline */}
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-slate-500">Registration Opens</span>
                  <span className="font-medium text-slate-800">
                    {event.registrationOpensAt ? formatDate(event.registrationOpensAt) : 'Immediately'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-slate-500">Registration Closes</span>
                  <span className="font-medium text-slate-800">
                    {event.registrationClosesAt
                      ? formatDate(event.registrationClosesAt)
                      : event.endAt
                      ? formatDate(event.endAt)
                      : formatDate(event.startAt)}
                  </span>
                </div>
              </div>

              {/* Authentication / Registration State */}
              {isStatusLoading ? (
                <div className="py-6 text-center">
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !isAuthenticated ? (
                /* 1. Unauthenticated Visitor */
                <div className="space-y-3 pt-2">
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed border border-border">
                    <p className="font-semibold text-slate-800 mb-1">Authenticated Registration</p>
                    ManageX requires a verified account to register. Organisation membership is not required for public events.
                  </div>

                  <Link
                    to="/auth/login"
                    state={{ from: { pathname: location.pathname } }}
                    className="block w-full"
                  >
                    <Button className="w-full justify-center">
                      Sign in to Register
                    </Button>
                  </Link>

                  <div className="text-center text-xs text-slate-500 pt-1">
                    Don't have an account?{' '}
                    <Link to="/auth/register" className="text-brand-600 hover:underline font-medium">
                      Create an account
                    </Link>
                  </div>
                </div>
              ) : isRegistered ? (
                /* 2. Authenticated & Registered */
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-emerald-900">You Are Registered</h4>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Registered under{' '}
                          <span className="font-medium">{user?.email}</span>
                        </p>
                        {registration?.registeredAt && (
                          <p className="text-[11px] text-emerald-600 mt-1">
                            Registered on {formatDate(registration.registeredAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {!showWithdrawConfirm ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowWithdrawConfirm(true)}
                      className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                    >
                      Withdraw Registration
                    </Button>
                  ) : (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
                      <p className="text-xs text-rose-800">
                        Are you sure you want to withdraw from this event?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isActionLoading}
                          onClick={handleWithdraw}
                          className="flex-1"
                        >
                          {isActionLoading ? 'Withdrawing...' : 'Confirm Withdrawal'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowWithdrawConfirm(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* 3. Authenticated & Not Registered / Withdrawn */
                <div className="space-y-3 pt-2">
                  {registration?.status === 'withdrawn' && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                      You previously withdrew from this event. You can re-register while registration remains open.
                    </div>
                  )}

                  {!isEventOpenForRegistration ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Registration Closed</p>
                        <p className="mt-0.5">
                          {event.status !== 'published'
                            ? `Registration is closed because this event is currently ${event.status}.`
                            : isRegistrationNotYetOpen
                            ? `Registration opens on ${formatDate(event.registrationOpensAt)}.`
                            : 'Registration for this event is now closed.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRegister}
                      disabled={isActionLoading}
                      className="w-full justify-center"
                    >
                      {isActionLoading
                        ? 'Registering...'
                        : registration?.status === 'withdrawn'
                        ? 'Re-register for Event'
                        : 'Register for Event'}
                    </Button>
                  )}

                  <p className="text-center text-[11px] text-slate-500">
                    Logged in as <span className="font-medium text-slate-700">{user?.fullName || user?.email}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Team Dialog */}
      <Dialog
        isOpen={showCreateTeamModal}
        onClose={() => !isCreatingTeam && setShowCreateTeamModal(false)}
        title="Create Hackathon Team"
        description={`Create a new team for ${event?.title || 'this event'}. You will become the team owner.`}
      >
        <form onSubmit={handleCreateTeam} className="space-y-4">
          <FormField label="Team Name" required>
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="e.g. Cyber Innovators"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </FormField>

          <FormField label="Description (Optional)">
            <Textarea
              value={newTeamDesc}
              onChange={(e) => setNewTeamDesc(e.target.value)}
              placeholder="What problem is your team solving?"
              rows={3}
              maxLength={1000}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isCreatingTeam}
              onClick={() => setShowCreateTeamModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isCreatingTeam}
              disabled={!newTeamName.trim()}
            >
              Create Team
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Leave Team Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLeaveTeamConfirm}
        onClose={() => !isLeavingTeam && setShowLeaveTeamConfirm(false)}
        onConfirm={handleLeaveTeam}
        title="Leave Team"
        description="Are you sure you want to leave this team? If you are the owner and sole member, the team will be removed. If other members remain, ownership will transfer to the next member."
        confirmLabel="Leave Team"
        cancelLabel="Stay in Team"
        variant="destructive"
        isLoading={isLeavingTeam}
      />

      {/* Invite Member Dialog */}
      <Dialog
        isOpen={showInviteModal}
        onClose={() => !isInviting && setShowInviteModal(false)}
        title="Invite Team Member"
        description="Enter the email address of a registered participant. An invitation valid for 7 days will be created."
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          <FormField label="Participant Email" required>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="e.g. teammate@example.com"
              required
              autoFocus
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isInviting}
              onClick={() => setShowInviteModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isInviting}
              disabled={!inviteEmail.trim()}
            >
              Send Invitation
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Accept Invitation Token Dialog */}
      <Dialog
        isOpen={showTokenAcceptModal}
        onClose={() => !isAcceptingToken && setShowTokenAcceptModal(false)}
        title="Accept Team Invitation"
        description="Enter the 32-byte invitation token provided by the team owner to join their team."
      >
        <div className="space-y-4">
          <FormField label="Invitation Token" required>
            <Input
              value={acceptTokenInput}
              onChange={(e) => setAcceptTokenInput(e.target.value)}
              placeholder="Paste invitation token here..."
              required
              autoFocus
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isAcceptingToken}
              onClick={() => setShowTokenAcceptModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={isAcceptingToken}
              disabled={!acceptTokenInput.trim()}
              onClick={() => handleAcceptToken(acceptTokenInput)}
            >
              Join Team
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Submission Dialog */}
      <Dialog
        isOpen={showSubmissionModal}
        onClose={() => !isSubmitting && setShowSubmissionModal(false)}
        title={mySubmission ? 'Edit Project Submission' : 'Submit Project'}
        description={`Provide your project deliverable details for ${event?.title || 'this event'}.`}
      >
        <form onSubmit={handleSaveSubmission} className="space-y-4">
          <FormField label="Project Title" required>
            <Input
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              placeholder="e.g. Autonomous Defense Agent"
              required
              minLength={2}
              maxLength={255}
              autoFocus
            />
          </FormField>

          <FormField label="Project Description (Optional)">
            <Textarea
              value={subDesc}
              onChange={(e) => setSubDesc(e.target.value)}
              placeholder="Brief summary of your project, tech stack, and solution..."
              rows={3}
              maxLength={5000}
            />
          </FormField>

          <FormField label="Repository URL (Optional)">
            <Input
              type="url"
              value={subRepoUrl}
              onChange={(e) => setSubRepoUrl(e.target.value)}
              placeholder="https://github.com/..."
            />
          </FormField>

          <FormField label="Live Demo URL (Optional)">
            <Input
              type="url"
              value={subDemoUrl}
              onChange={(e) => setSubDemoUrl(e.target.value)}
              placeholder="https://..."
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => setShowSubmissionModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!subTitle.trim()}
            >
              {mySubmission ? 'Update Submission' : 'Submit Project'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

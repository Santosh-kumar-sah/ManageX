import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Pagination } from '@/components/ui/Pagination';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import {
  Clock,
  MapPin,
  Globe,
  Users,
  Code2,
  Play,
  CheckCircle,
  XCircle,
  Archive,
  Lock,
  ArrowLeft,
  Share2,
  UserCheck,
  UserX,
  Search,
  CalendarCheck,
  ExternalLink,
  PlusCircle,
  UserPlus,
  LogOut,
  FolderGit2,
  Send,
  Award,
  Gavel,
  Trophy,
  Trash2,
  Star,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import {
  EventItem,
  EventStatus,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_VARIANTS,
  ALLOWED_TRANSITIONS,
  RegistrationItem,
  TeamItem,
  SubmissionItem,
  ScoringCriterion,
  JudgeAssignment,
  JudgeWorkItem,
  EventResultsData,
} from '@/types/events';

interface ParticipantsResponse {
  participants: RegistrationItem[];
  summary: {
    activeRegistrations: number;
    capacity: number | null;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function EventDetailPage() {
  const { orgId, eventId } = useParams<{ orgId: string; eventId: string }>();
  const { user } = useAuth();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Phase 6B: Registration State
  const [myRegistration, setMyRegistration] = useState<RegistrationItem | null>(null);
  const [isRegLoading, setIsRegLoading] = useState(false);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Phase 6B: Participants Roster State (Staff)
  const [participants, setParticipants] = useState<RegistrationItem[]>([]);
  const [partSummary, setPartSummary] = useState<{ activeRegistrations: number; capacity: number | null }>({
    activeRegistrations: 0,
    capacity: null,
  });
  const [partPage, setPartPage] = useState(1);
  const [partTotalPages, setPartTotalPages] = useState(1);
  const [partTotalItems, setPartTotalItems] = useState(0);
  const [partSearch, setPartSearch] = useState('');
  const [partStatusFilter, setPartStatusFilter] = useState<'all' | 'registered' | 'withdrawn'>('all');
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);

  // Phase 6C: Hackathon Teams State
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [myTeam, setMyTeam] = useState<TeamItem | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  const [showLeaveTeamConfirm, setShowLeaveTeamConfirm] = useState(false);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);

  // Phase 6C: URL Submissions State
  const [mySubmission, setMySubmission] = useState<SubmissionItem | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [subRepoUrl, setSubRepoUrl] = useState('');
  const [subDemoUrl, setSubDemoUrl] = useState('');
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

  // Phase 6D: Judging, Criteria, Scores & Results State
  const [criteria, setCriteria] = useState<ScoringCriterion[]>([]);
  const [judgeAssignments, setJudgeAssignments] = useState<JudgeAssignment[]>([]);
  const [judgeWork, setJudgeWork] = useState<JudgeWorkItem[]>([]);
  const [eventResults, setEventResults] = useState<EventResultsData | null>(null);

  const [showAddCriterionModal, setShowAddCriterionModal] = useState(false);
  const [newCritName, setNewCritName] = useState('');
  const [newCritDesc, setNewCritDesc] = useState('');
  const [newCritMaxScore, setNewCritMaxScore] = useState(100);
  const [isCreatingCrit, setIsCreatingCrit] = useState(false);

  const [showAssignJudgeModal, setShowAssignJudgeModal] = useState(false);
  const [assignJudgeUserId, setAssignJudgeUserId] = useState('');
  const [assignSubmissionId, setAssignSubmissionId] = useState('');
  const [isAssigningJudge, setIsAssigningJudge] = useState(false);

  const [showScoreModal, setShowScoreModal] = useState(false);
  const [activeSubForScoring, setActiveSubForScoring] = useState<JudgeWorkItem | null>(null);
  const [scoreFormValues, setScoreFormValues] = useState<Record<string, { score: number; feedback: string }>>({});
  const [isSubmittingScores, setIsSubmittingScores] = useState(false);

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [isPublishingResults, setIsPublishingResults] = useState(false);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [isUnpublishingResults, setIsUnpublishingResults] = useState(false);

  const canManageStatus =
    activeDetails?.membership?.permissions?.includes('event.status.manage') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin' ||
    activeDetails?.membership?.role?.slug === 'event_admin';

  const canManageJudging =
    canManageStatus ||
    activeDetails?.membership?.permissions?.includes('event.result.publish') ||
    activeDetails?.membership?.permissions?.includes('event.edit');

  const canViewParticipants =
    canManageStatus ||
    activeDetails?.membership?.permissions?.includes('event.view') ||
    activeDetails?.membership?.role?.slug === 'event_staff';

  // 1. Fetch Event Details
  const fetchEvent = useCallback(async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await apiClient<{ event: EventItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}`
      );
      if (res.data?.event) {
        setEvent(res.data.event);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load event details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, eventId]);

  // 2. Fetch Own Registration Status
  const fetchMyRegistration = useCallback(async () => {
    if (!effectiveOrgId || !eventId || !user) return;

    try {
      setIsRegLoading(true);
      const res = await apiClient<{ registration: RegistrationItem | null }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/my-registration`
      );
      if (res.data) {
        setMyRegistration(res.data.registration);
      }
    } catch {
      setMyRegistration(null);
    } finally {
      setIsRegLoading(false);
    }
  }, [effectiveOrgId, eventId, user]);

  // 3. Fetch Participants Roster (Staff)
  const fetchParticipants = useCallback(
    async (page = 1, search = '', status = 'all') => {
      if (!effectiveOrgId || !eventId || !canViewParticipants) return;

      try {
        setIsLoadingParticipants(true);
        const queryParams = new URLSearchParams({
          page: String(page),
          limit: '10',
        });
        if (search) queryParams.set('search', search);
        if (status !== 'all') queryParams.set('status', status);

        const res = await apiClient<ParticipantsResponse>(
          `/organisations/${effectiveOrgId}/events/${eventId}/participants?${queryParams.toString()}`
        );

        if (res.data) {
          setParticipants(res.data.participants || []);
          if (res.data.summary) {
            setPartSummary(res.data.summary);
          }
          if (res.meta?.pagination) {
            setPartPage(res.meta.pagination.page);
            setPartTotalPages(res.meta.pagination.totalPages);
            setPartTotalItems(
              res.meta.pagination.totalItems ??
                (res.meta.pagination as unknown as { total: number }).total ??
                0
            );
          }
        }
      } catch (err) {
        console.error('Failed to load participants', err);
      } finally {
        setIsLoadingParticipants(false);
      }
    },
    [effectiveOrgId, eventId, canViewParticipants]
  );

  // 4. Fetch Hackathon Teams (Phase 6C)
  const fetchTeams = useCallback(async () => {
    if (!effectiveOrgId || !eventId || event?.eventType !== 'hackathon') return;

    try {
      const res = await apiClient<{ teams: TeamItem[] }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/teams`
      );
      if (res.data?.teams) {
        setTeams(res.data.teams);
        // Find if current user belongs to any team
        if (user) {
          const found = res.data.teams.find((t) =>
            t.createdById === user.id || t.members?.some((m) => m.userId === user.id)
          );
          if (found) {
            // Fetch detailed team with members
            const detailRes = await apiClient<{ team: TeamItem }>(
              `/organisations/${effectiveOrgId}/events/${eventId}/teams/${found.id}`
            );
            if (detailRes.data?.team) {
              setMyTeam(detailRes.data.team);
            } else {
              setMyTeam(found);
            }
          } else {
            setMyTeam(null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load hackathon teams', err);
    }
  }, [effectiveOrgId, eventId, event?.eventType, user]);

  // 5. Fetch Project Submission (Phase 6C)
  const fetchMySubmission = useCallback(async () => {
    if (!effectiveOrgId || !eventId || !user) return;

    try {
      const res = await apiClient<{ submission: SubmissionItem | null }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/my-submission`
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
    }
  }, [effectiveOrgId, eventId, user]);

  // Phase 6D: Fetch Criteria & Judge Assignments
  const fetchJudgingData = useCallback(async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      const [critRes, judgeRes] = await Promise.all([
        apiClient<{ criteria: ScoringCriterion[] }>(
          `/organisations/${effectiveOrgId}/events/${eventId}/criteria`
        ).catch(() => ({ data: { criteria: [] } })),
        apiClient<{ assignments: JudgeAssignment[] }>(
          `/organisations/${effectiveOrgId}/events/${eventId}/judges`
        ).catch(() => ({ data: { assignments: [] } })),
      ]);

      if (critRes.data?.criteria) {
        setCriteria(critRes.data.criteria);
      }
      if (judgeRes.data?.assignments) {
        setJudgeAssignments(judgeRes.data.assignments);
      }
    } catch (err) {
      console.error('Failed to load judging data', err);
    }
  }, [effectiveOrgId, eventId]);

  // Phase 6D: Fetch Judge Work
  const fetchJudgeWork = useCallback(async () => {
    if (!effectiveOrgId || !eventId || !user) return;

    try {
      const res = await apiClient<{ workItems: JudgeWorkItem[] }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/judge-work`
      );
      if (res.data?.workItems) {
        setJudgeWork(res.data.workItems);
      }
    } catch {
      setJudgeWork([]);
    }
  }, [effectiveOrgId, eventId, user]);

  // Phase 6D: Fetch Results
  const fetchEventResults = useCallback(async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      const res = await apiClient<EventResultsData>(
        `/organisations/${effectiveOrgId}/events/${eventId}/results`
      );
      if (res.data) {
        setEventResults(res.data);
      }
    } catch {
      setEventResults(null);
    }
  }, [effectiveOrgId, eventId]);

  useEffect(() => {
    fetchEvent();
    fetchMyRegistration();
    fetchMySubmission();
  }, [fetchEvent, fetchMyRegistration, fetchMySubmission]);

  useEffect(() => {
    if (event?.eventType === 'hackathon') {
      fetchTeams();
      fetchJudgingData();
      fetchJudgeWork();
      fetchEventResults();
    }
  }, [event?.eventType, fetchTeams, fetchJudgingData, fetchJudgeWork, fetchEventResults]);

  useEffect(() => {
    if (canViewParticipants && event) {
      fetchParticipants(partPage, partSearch, partStatusFilter);
    }
  }, [canViewParticipants, event, partPage, partStatusFilter, fetchParticipants, partSearch]);

  // Handle Add Criterion
  const handleCreateCriterion = async () => {
    if (!effectiveOrgId || !eventId || !newCritName.trim()) return;

    try {
      setIsCreatingCrit(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/criteria`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newCritName.trim(),
            description: newCritDesc.trim() || undefined,
            maxScore: Number(newCritMaxScore) || 100,
          }),
        }
      );

      setSuccessMsg('Scoring criterion added successfully!');
      setShowAddCriterionModal(false);
      setNewCritName('');
      setNewCritDesc('');
      setNewCritMaxScore(100);
      fetchJudgingData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to add scoring criterion.');
      }
    } finally {
      setIsCreatingCrit(false);
    }
  };

  // Handle Delete Criterion
  const handleDeleteCriterion = async (criterionId: string) => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/criteria/${criterionId}`,
        { method: 'DELETE' }
      );

      setSuccessMsg('Criterion deleted.');
      fetchJudgingData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to delete criterion.');
      }
    }
  };

  // Handle Assign Judge
  const handleAssignJudge = async () => {
    if (!effectiveOrgId || !eventId || !assignJudgeUserId.trim()) return;

    try {
      setIsAssigningJudge(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/judges`,
        {
          method: 'POST',
          body: JSON.stringify({
            judgeUserId: assignJudgeUserId.trim(),
            submissionId: assignSubmissionId.trim() || undefined,
          }),
        }
      );

      setSuccessMsg('Judge assigned successfully!');
      setShowAssignJudgeModal(false);
      setAssignJudgeUserId('');
      setAssignSubmissionId('');
      fetchJudgingData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to assign judge.');
      }
    } finally {
      setIsAssigningJudge(false);
    }
  };

  // Handle Remove Judge
  const handleRemoveJudge = async (assignmentId: string) => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/judges/${assignmentId}`,
        { method: 'DELETE' }
      );

      setSuccessMsg('Judge assignment removed.');
      fetchJudgingData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to remove judge assignment.');
      }
    }
  };

  // Handle Submit Scores
  const handleSubmitScores = async () => {
    if (!effectiveOrgId || !eventId || !activeSubForScoring) return;

    try {
      setIsSubmittingScores(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const scoresArray = Object.entries(scoreFormValues).map(([critId, val]) => ({
        criterionId: critId,
        score: Number(val.score),
        feedback: val.feedback || undefined,
      }));

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/submissions/${activeSubForScoring.submissionId}/scores`,
        {
          method: 'POST',
          body: JSON.stringify({ scores: scoresArray }),
        }
      );

      setSuccessMsg('Scores recorded successfully!');
      setShowScoreModal(false);
      setActiveSubForScoring(null);
      fetchJudgeWork();
      fetchEventResults();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to submit scores.');
      }
    } finally {
      setIsSubmittingScores(false);
    }
  };

  // Handle Publish Results
  const handlePublishResults = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsPublishingResults(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/publish-results`,
        { method: 'POST' }
      );

      setSuccessMsg('Event results published successfully! Participants and the public can now view the leaderboard.');
      setShowPublishConfirm(false);
      fetchEvent();
      fetchEventResults();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to publish results.');
      }
    } finally {
      setIsPublishingResults(false);
    }
  };

  // Handle Unpublish Results
  const handleUnpublishResults = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsUnpublishingResults(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/unpublish-results`,
        { method: 'POST' }
      );

      setSuccessMsg('Event results unpublished.');
      setShowUnpublishConfirm(false);
      fetchEvent();
      fetchEventResults();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to unpublish results.');
      }
    } finally {
      setIsUnpublishingResults(false);
    }
  };

  const handleStatusTransition = async (targetStatus: EventStatus) => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsUpdatingStatus(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiClient<{ event: EventItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ status: targetStatus }),
        }
      );

      if (res.data?.event) {
        setEvent(res.data.event);
        setSuccessMsg(
          `Event status successfully advanced to "${EVENT_STATUS_LABELS[targetStatus]}".`
        );
        if (canViewParticipants) {
          fetchParticipants(partPage, partSearch, partStatusFilter);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to advance event status.');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Phase 6B: Handle Register
  const handleRegister = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsSubmittingReg(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiClient<{ message?: string; registration: RegistrationItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/register`,
        {
          method: 'POST',
          body: JSON.stringify({ customAnswers: {} }),
        }
      );

      if (res.data?.registration) {
        setMyRegistration(res.data.registration);
        setSuccessMsg('You have successfully registered for this event!');
        if (canViewParticipants) {
          fetchParticipants(partPage, partSearch, partStatusFilter);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Registration failed. Please try again.');
      }
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Phase 6B: Handle Withdraw
  const handleWithdraw = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsSubmittingReg(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiClient<{ message?: string; registration: RegistrationItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/withdraw`,
        {
          method: 'POST',
        }
      );

      if (res.data?.registration) {
        setMyRegistration(res.data.registration);
        setSuccessMsg('Your registration has been successfully withdrawn.');
        setShowWithdrawConfirm(false);
        if (canViewParticipants) {
          fetchParticipants(partPage, partSearch, partStatusFilter);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to withdraw registration. Please try again.');
      }
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Phase 6C: Handle Create Team
  const handleCreateTeam = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsCreatingTeam(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiClient<{ team: TeamItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/teams`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTeamName,
            description: newTeamDesc,
          }),
        }
      );

      if (res.data?.team) {
        setMyTeam(res.data.team);
        setShowCreateTeamModal(false);
        setNewTeamName('');
        setNewTeamDesc('');
        setSuccessMsg(`Team "${res.data.team.name}" created successfully! You are now the team owner.`);
        fetchTeams();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to create team. Please try again.');
      }
    } finally {
      setIsCreatingTeam(false);
    }
  };

  // Phase 6C: Handle Invite Team Member
  const handleInviteMember = async () => {
    if (!effectiveOrgId || !eventId || !myTeam) return;

    try {
      setIsInviting(true);
      setErrorMsg(null);

      const res = await apiClient<{ invitation: { token: string; email: string; expiresAt: string } }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/teams/${myTeam.id}/invites`,
        {
          method: 'POST',
          body: JSON.stringify({ email: inviteEmail }),
        }
      );

      if (res.data?.invitation) {
        setGeneratedToken(res.data.invitation.token);
        setSuccessMsg(`Invitation sent to ${res.data.invitation.email}! Token valid for 7 days.`);
        setInviteEmail('');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to send team invitation.');
      }
    } finally {
      setIsInviting(false);
    }
  };

  // Phase 6C: Handle Leave Team
  const handleLeaveTeam = async () => {
    if (!effectiveOrgId || !eventId || !myTeam) return;

    try {
      setIsLeavingTeam(true);
      setErrorMsg(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/events/${eventId}/teams/${myTeam.id}/leave`,
        { method: 'POST' }
      );

      setMyTeam(null);
      setShowLeaveTeamConfirm(false);
      setSuccessMsg('You have successfully left the team.');
      fetchTeams();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to leave team.');
      }
    } finally {
      setIsLeavingTeam(false);
    }
  };

  // Phase 6C: Handle Submit Project
  const handleSubmitProject = async () => {
    if (!effectiveOrgId || !eventId) return;

    try {
      setIsSubmittingProject(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiClient<{ submission: SubmissionItem }>(
        `/organisations/${effectiveOrgId}/events/${eventId}/submissions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: subTitle,
            description: subDesc,
            repositoryUrl: subRepoUrl || undefined,
            demoUrl: subDemoUrl || undefined,
          }),
        }
      );

      if (res.data?.submission) {
        setMySubmission(res.data.submission);
        setShowSubmissionModal(false);
        setSuccessMsg('Project submission saved successfully!');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to save project submission.');
      }
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const formatDateTime = (isoString: string, timezone: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
        timeZoneName: 'short',
      }).format(date);
    } catch {
      return new Date(isoString).toLocaleString();
    }
  };

  // Effective Registration Window Evaluation (ADR-008)
  const computeRegistrationState = () => {
    if (!event) return { isOpen: false, reason: 'Loading...' };

    const now = Date.now();
    const effectiveOpensAt = event.registrationOpensAt
      ? new Date(event.registrationOpensAt).getTime()
      : new Date(event.createdAt).getTime();

    const effectiveClosesAt = event.registrationClosesAt
      ? new Date(event.registrationClosesAt).getTime()
      : new Date(event.startAt).getTime();

    if (event.status !== 'published') {
      return {
        isOpen: false,
        reason: `Registration not available (${EVENT_STATUS_LABELS[event.status]})`,
        effectiveOpensAt,
        effectiveClosesAt,
      };
    }

    if (now < effectiveOpensAt) {
      return {
        isOpen: false,
        reason: `Registration opens on ${formatDateTime(new Date(effectiveOpensAt).toISOString(), event.timezone)}`,
        effectiveOpensAt,
        effectiveClosesAt,
      };
    }

    if (now > effectiveClosesAt) {
      return {
        isOpen: false,
        reason: `Registration closed on ${formatDateTime(new Date(effectiveClosesAt).toISOString(), event.timezone)}`,
        effectiveOpensAt,
        effectiveClosesAt,
      };
    }

    const isFull =
      event.capacity !== null &&
      event.capacity !== undefined &&
      partSummary.capacity !== null &&
      partSummary.activeRegistrations >= event.capacity;

    if (isFull && (!myRegistration || myRegistration.status === 'withdrawn')) {
      return {
        isOpen: false,
        reason: 'Event has reached maximum capacity',
        effectiveOpensAt,
        effectiveClosesAt,
        isFull: true,
      };
    }

    return {
      isOpen: true,
      reason: 'Registration is open',
      effectiveOpensAt,
      effectiveClosesAt,
    };
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-brand-600 mb-2"></div>
        <p>Loading event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <Breadcrumbs
          items={[
            { label: 'Workspace', href: '/app' },
            { label: 'Events', href: `/app/organisations/${effectiveOrgId}/events` },
            { label: 'Not Found' },
          ]}
        />
        <Alert variant="error">
          Event not found or you do not have permission to view it.
        </Alert>
        <Link to={`/app/organisations/${effectiveOrgId}/events`}>
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Events
          </Button>
        </Link>
      </div>
    );
  }

  const allowedTransitions = ALLOWED_TRANSITIONS[event.status] || [];
  const regWindow = computeRegistrationState();
  const isTeamOwner = myTeam?.createdById === user?.id;

  return (
    <div className="space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Workspace', href: '/app' },
              {
                label: activeOrg?.name || 'Organisation',
                href: `/app/organisations/${effectiveOrgId}/events`,
              },
              { label: 'Events', href: `/app/organisations/${effectiveOrgId}/events` },
              { label: event.title },
            ]}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {event.title}
            </h1>
            <Badge variant={EVENT_STATUS_VARIANTS[event.status]}>
              {EVENT_STATUS_LABELS[event.status]}
            </Badge>
            <Badge variant="neutral" className="uppercase tracking-wider font-mono text-[10px]">
              {event.eventType === 'hackathon' ? 'Hackathon' : 'General Event'}
            </Badge>
            <span className="text-xs font-mono text-slate-400 capitalize">
              {event.visibility}
            </span>
          </div>
        </div>

        <Link to={`/app/organisations/${effectiveOrgId}/events`}>
          <Button variant="outline" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Events
          </Button>
        </Link>
      </div>

      {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
      {successMsg && <Alert variant="success">{successMsg}</Alert>}

      {/* Lifecycle Transitions Panel (Staff Only) */}
      {canManageStatus && (
        <Card className="border-brand-100 bg-brand-50/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Lifecycle State Machine</span>
              <span className="text-xs font-normal text-slate-500 font-mono">
                Current: <strong className="text-slate-800">{event.status}</strong>
              </span>
            </CardTitle>
            <CardDescription>
              Valid canonical transitions defined by PRD §7.2. Terminal states (completed, cancelled, archived) lock event editing.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap items-center gap-2">
              {allowedTransitions.length === 0 ? (
                <span className="text-xs text-slate-500 italic">
                  This event is in terminal state ({event.status}) and cannot be transitioned further.
                </span>
              ) : (
                allowedTransitions.map((targetStatus) => {
                  let icon = <Play className="h-3.5 w-3.5 mr-1" />;
                  let variant: 'primary' | 'outline' | 'destructive' = 'outline';

                  if (targetStatus === 'published') {
                    variant = 'primary';
                    icon = <Share2 className="h-3.5 w-3.5 mr-1" />;
                  } else if (targetStatus === 'in_progress') {
                    variant = 'primary';
                    icon = <Play className="h-3.5 w-3.5 mr-1" />;
                  } else if (targetStatus === 'completed') {
                    variant = 'outline';
                    icon = <CheckCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" />;
                  } else if (targetStatus === 'cancelled') {
                    variant = 'destructive';
                    icon = <XCircle className="h-3.5 w-3.5 mr-1" />;
                  } else if (targetStatus === 'archived') {
                    variant = 'outline';
                    icon = <Archive className="h-3.5 w-3.5 mr-1" />;
                  } else if (targetStatus === 'registration_closed') {
                    icon = <Lock className="h-3.5 w-3.5 mr-1 text-amber-600" />;
                  }

                  return (
                    <Button
                      key={targetStatus}
                      variant={variant}
                      size="sm"
                      disabled={isUpdatingStatus}
                      onClick={() => handleStatusTransition(targetStatus)}
                      className="flex items-center text-xs"
                    >
                      {icon}
                      Move to {EVENT_STATUS_LABELS[targetStatus]}
                    </Button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Event Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Description
                </h4>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {event.description || 'No description provided.'}
                </p>
              </div>

              {event.participantInstructions && (
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Participant Instructions
                  </h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {event.participantInstructions}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Phase 6C: Hackathon Teams (Only for Hackathons) */}
          {event.eventType === 'hackathon' && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-brand-600" />
                      <span>Hackathon Teams</span>
                    </CardTitle>
                    <CardDescription>
                      Form teams of {event.teamSizeMin || 1} to {event.teamSizeMax || 10} members.
                    </CardDescription>
                  </div>
                  {myRegistration?.status === 'registered' && !myTeam && (
                    <Button
                      size="sm"
                      variant="primary"
                      className="text-xs flex items-center gap-1.5"
                      onClick={() => setShowCreateTeamModal(true)}
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      Create Team
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Active User's Team Card */}
                {myTeam ? (
                  <div className="p-4 rounded-lg border border-brand-200 bg-brand-50/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{myTeam.name}</h4>
                          <Badge variant="brand" className="text-[10px]">Your Team</Badge>
                          {isTeamOwner && <Badge variant="success" className="text-[10px]">Team Owner</Badge>}
                        </div>
                        {myTeam.description && (
                          <p className="text-xs text-slate-600 mt-1">{myTeam.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isTeamOwner && (myTeam.memberCount < (event.teamSizeMax || 10)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs flex items-center gap-1.5"
                            onClick={() => {
                              setGeneratedToken(null);
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
                    <div className="pt-2 border-t border-brand-100">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Team Members ({myTeam.members?.length || myTeam.memberCount} / {event.teamSizeMax || 10})
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {myTeam.members?.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-2 p-2 rounded bg-white border border-slate-100 text-xs"
                          >
                            <Avatar name={member.user?.fullName || 'User'} size="sm" className="h-6 w-6" />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{member.user?.fullName}</div>
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                {member.user?.email}
                              </div>
                            </div>
                            {member.isOwner && (
                              <Badge variant="neutral" className="text-[9px]">Owner</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-3 px-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    {myRegistration?.status === 'registered' ? (
                      <p>You are not currently in a team. You can create a new team or ask an existing team owner to send you an invitation.</p>
                    ) : (
                      <p>Register for this hackathon to create or join a team.</p>
                    )}
                  </div>
                )}

                {/* All Teams Listing */}
                <div>
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    All Registered Teams ({teams.length})
                  </div>
                  {teams.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No teams registered yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {teams.map((t) => (
                        <div
                          key={t.id}
                          className="p-3 rounded border border-slate-200 bg-white hover:border-slate-300 transition-colors text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-medium text-slate-900">
                            <span>{t.name}</span>
                            <Badge variant="neutral" className="text-[10px]">
                              {t.memberCount} members
                            </Badge>
                          </div>
                          {t.description && (
                            <p className="text-slate-500 text-[11px] line-clamp-1">{t.description}</p>
                          )}
                          <div className="text-[10px] text-slate-400">
                            Created by {t.owner?.fullName || 'Owner'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase 6C: Project Submissions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-brand-600" />
                    <span>Project Submission</span>
                  </CardTitle>
                  <CardDescription>
                    URL-based project submission (GitHub repository & live demo URL).
                  </CardDescription>
                </div>
                {myRegistration?.status === 'registered' && (
                  <Button
                    size="sm"
                    variant={mySubmission ? 'outline' : 'primary'}
                    className="text-xs flex items-center gap-1.5"
                    onClick={() => setShowSubmissionModal(true)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {mySubmission ? 'Edit Submission' : 'Submit Project'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {mySubmission ? (
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">{mySubmission.title}</h4>
                    <Badge variant="success" className="text-[10px] capitalize">
                      {mySubmission.status}
                    </Badge>
                  </div>
                  {mySubmission.description && (
                    <p className="text-slate-600 text-xs whitespace-pre-wrap">{mySubmission.description}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                    {mySubmission.repositoryUrl && (
                      <div>
                        <span className="text-slate-400 text-[11px] block">Repository</span>
                        <a
                          href={mySubmission.repositoryUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline flex items-center gap-1 truncate font-mono text-[11px]"
                        >
                          <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{mySubmission.repositoryUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}
                    {mySubmission.demoUrl && (
                      <div>
                        <span className="text-slate-400 text-[11px] block">Live Demo</span>
                        <a
                          href={mySubmission.demoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline flex items-center gap-1 truncate font-mono text-[11px]"
                        >
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{mySubmission.demoUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-1">
                    Submitted on {formatDateTime(mySubmission.submittedAt, event.timezone)}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <FolderGit2 className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-slate-700">No project submitted yet.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {event.eventType === 'hackathon' && !myTeam
                      ? 'You must join or create a team before submitting your project.'
                      : 'Provide your GitHub repository and live demo link before the deadline.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Phase 6B: Event Staff Participants Roster */}
          {canViewParticipants && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-brand-600" />
                      <span>Participants Roster</span>
                    </CardTitle>
                    <CardDescription>
                      Staff overview of registered attendees and capacity status.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs font-normal">
                      Active: <strong className="ml-1 text-slate-900">{partSummary.activeRegistrations}</strong>
                      {event.capacity ? ` / ${event.capacity}` : ' (unlimited)'}
                    </Badge>
                  </div>
                </div>

                {/* Filter & Search Bar */}
                <div className="pt-3 flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search participant by name or email..."
                      value={partSearch}
                      onChange={(e) => {
                        setPartSearch(e.target.value);
                        setPartPage(1);
                      }}
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant={partStatusFilter === 'all' ? 'primary' : 'outline'}
                      size="sm"
                      className="text-xs h-9"
                      onClick={() => {
                        setPartStatusFilter('all');
                        setPartPage(1);
                      }}
                    >
                      All
                    </Button>
                    <Button
                      variant={partStatusFilter === 'registered' ? 'primary' : 'outline'}
                      size="sm"
                      className="text-xs h-9"
                      onClick={() => {
                        setPartStatusFilter('registered');
                        setPartPage(1);
                      }}
                    >
                      Active
                    </Button>
                    <Button
                      variant={partStatusFilter === 'withdrawn' ? 'primary' : 'outline'}
                      size="sm"
                      className="text-xs h-9"
                      onClick={() => {
                        setPartStatusFilter('withdrawn');
                        setPartPage(1);
                      }}
                    >
                      Withdrawn
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {isLoadingParticipants ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-brand-600 mb-2"></div>
                    <p>Loading participant roster...</p>
                  </div>
                ) : participants.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 rounded-md border border-dashed border-slate-200">
                    No participants found matching the current filters.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Participant</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Registered At</TableHead>
                          <TableHead>Reactivated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {participants.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <Avatar
                                  name={p.user?.fullName || 'User'}
                                  size="sm"
                                  className="h-7 w-7 text-xs"
                                />
                                <div>
                                  <div className="font-medium text-xs text-slate-900">
                                    {p.user?.fullName || 'Participant'}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono">
                                    {p.user?.email || p.userId}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={p.status === 'registered' ? 'success' : 'warning'}
                                className="text-[11px]"
                              >
                                {p.status === 'registered' ? 'Registered' : 'Withdrawn'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {formatDateTime(p.registeredAt, event.timezone)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                              {p.reactivatedAt ? (
                                <span className="text-emerald-700 font-medium">
                                  {formatDateTime(p.reactivatedAt, event.timezone)}
                                </span>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Pagination
                      page={partPage}
                      totalPages={partTotalPages}
                      totalItems={partTotalItems}
                      limit={10}
                      onPageChange={(newPage) => setPartPage(newPage)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Phase 6D: Hackathon Results & Leaderboard (EVT-009, ADR-009) */}
          {event.eventType === 'hackathon' && (
            <Card className="border-brand-200 shadow-xs">
              <CardHeader className="pb-3 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Hackathon Results & Leaderboard
                  </CardTitle>
                  <CardDescription>
                    Straight sum of criteria scores with shared ranks for ties (ADR-009).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {eventResults?.isPublished ? (
                    <Badge variant="success" className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Published
                    </Badge>
                  ) : (
                    <Badge variant="warning">Draft / Unpublished</Badge>
                  )}
                  {canManageJudging && (
                    eventResults?.isPublished ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowUnpublishConfirm(true)}
                        disabled={isUnpublishingResults}
                        className="text-xs text-slate-600"
                      >
                        Unpublish Results
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setShowPublishConfirm(true)}
                        disabled={!eventResults?.isPublishable || isPublishingResults}
                        title={
                          eventResults?.isPublishable
                            ? 'Publish official results'
                            : 'All assigned judges must complete scoring before publication'
                        }
                        className="text-xs flex items-center gap-1"
                      >
                        <Award className="h-3.5 w-3.5" />
                        Publish Results
                      </Button>
                    )
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {eventResults?.isPublished || canManageJudging ? (
                  !eventResults || eventResults.results.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      No submissions or evaluated projects recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Rank</TableHead>
                            <TableHead>Project / Submission</TableHead>
                            <TableHead>Team</TableHead>
                            <TableHead className="text-right">Total Score</TableHead>
                            <TableHead className="text-right">Links</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {eventResults.results.map((res) => (
                            <TableRow key={res.submissionId}>
                              <TableCell className="font-bold">
                                {res.rank === 1 ? (
                                  <span className="inline-flex items-center gap-1 text-amber-600 font-extrabold text-sm">
                                    <Trophy className="h-4 w-4" /> 1st
                                  </span>
                                ) : res.rank === 2 ? (
                                  <span className="inline-flex items-center gap-1 text-slate-600 font-bold text-sm">
                                    <Award className="h-4 w-4 text-slate-400" /> 2nd
                                  </span>
                                ) : res.rank === 3 ? (
                                  <span className="inline-flex items-center gap-1 text-amber-700 font-bold text-sm">
                                    <Award className="h-4 w-4 text-amber-700" /> 3rd
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-xs">#{res.rank}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">{res.title}</div>
                                {res.description && (
                                  <div className="text-xs text-slate-500 line-clamp-1">{res.description}</div>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-slate-700">
                                {res.teamName || 'Solo'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-slate-900">
                                {res.totalScore}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                <div className="flex justify-end gap-2">
                                  {res.repositoryUrl && (
                                    <a
                                      href={res.repositoryUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-brand-600 hover:underline inline-flex items-center gap-1"
                                    >
                                      Repo <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                  {res.demoUrl && (
                                    <a
                                      href={res.demoUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-brand-600 hover:underline inline-flex items-center gap-1"
                                    >
                                      Demo <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    Results are currently being evaluated and will be announced once judging concludes.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Phase 6D: Judge Evaluation Portal (for Assigned Judges) */}
          {event.eventType === 'hackathon' && judgeWork.length > 0 && (
            <Card className="border-brand-200 bg-brand-50/10 shadow-xs">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-brand-600" />
                    Judge Evaluation Work
                  </span>
                  <Badge variant="brand">{judgeWork.length} Assigned Project(s)</Badge>
                </CardTitle>
                <CardDescription>
                  Your assigned submissions for judging. Submit numerical criterion scores and optional feedback.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {judgeWork.map((work) => (
                    <div
                      key={work.submissionId}
                      className="p-3 bg-white rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm">{work.title}</span>
                          {work.isFullyEvaluated ? (
                            <Badge variant="success" className="text-[10px]">Evaluated</Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px]">Pending Evaluation</Badge>
                          )}
                        </div>
                        <div className="text-slate-500">Team: {work.teamName || 'Solo'}</div>
                        <div className="flex items-center gap-3 pt-1">
                          {work.repositoryUrl && (
                            <a
                              href={work.repositoryUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:underline flex items-center gap-1"
                            >
                              Code Repository <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {work.demoUrl && (
                            <a
                              href={work.demoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:underline flex items-center gap-1"
                            >
                              Live Demo <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      <Button
                        variant={work.isFullyEvaluated ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => {
                          setActiveSubForScoring(work);
                          const initial: Record<string, { score: number; feedback: string }> = {};
                          for (const crit of criteria) {
                            const existing = work.scores.find((s) => s.criterionId === crit.id);
                            initial[crit.id] = {
                              score: existing ? existing.score : 0,
                              feedback: existing?.feedback || '',
                            };
                          }
                          setScoreFormValues(initial);
                          setShowScoreModal(true);
                        }}
                        className="shrink-0 flex items-center gap-1.5"
                      >
                        <Star className="h-3.5 w-3.5" />
                        {work.isFullyEvaluated ? 'Edit Score' : 'Score Submission'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Phase 6D: Scoring Criteria & Judge Assignments (Management) */}
          {event.eventType === 'hackathon' && canManageJudging && (
            <Card className="border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gavel className="h-4 w-4 text-slate-700" />
                    Scoring Criteria & Judge Assignments
                  </CardTitle>
                  <CardDescription>
                    Configure evaluation criteria (1..100 max score) and assign judges to submissions.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddCriterionModal(true)}
                    className="flex items-center gap-1 text-xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add Criterion
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAssignJudgeModal(true)}
                    className="flex items-center gap-1 text-xs"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Assign Judge
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-6">
                {/* Criteria Table */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Scoring Criteria ({criteria.length})
                  </h4>
                  {criteria.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded text-center text-xs text-slate-500">
                      No criteria configured yet. Add criteria to enable judge evaluations.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Criterion Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Max Score</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {criteria.map((crit) => (
                          <TableRow key={crit.id}>
                            <TableCell className="font-medium text-slate-900">{crit.name}</TableCell>
                            <TableCell className="text-xs text-slate-500">{crit.description || '—'}</TableCell>
                            <TableCell className="text-right font-mono font-medium">{crit.maxScore}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDeleteCriterion(crit.id)}
                                className="h-7 px-2 text-xs"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {/* Judge Assignments */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Judge Assignments ({judgeAssignments.length})
                  </h4>
                  {judgeAssignments.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded text-center text-xs text-slate-500">
                      No judges assigned yet. Assign judges to evaluate hackathon submissions.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Judge Name / Email</TableHead>
                          <TableHead>Scope</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {judgeAssignments.map((ja) => (
                          <TableRow key={ja.id}>
                            <TableCell>
                              <div className="font-medium text-slate-900">{ja.judgeName || 'Judge'}</div>
                              <div className="text-xs text-slate-500 font-mono">{ja.judgeEmail}</div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">
                              {ja.submissionTitle ? `Specific: "${ja.submissionTitle}"` : 'All Event Submissions'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveJudge(ja.id)}
                                className="h-7 px-2 text-xs"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar: Registration & Details */}
        <div className="space-y-6">
          {/* Phase 6B: Registration & Participation Card */}
          <Card className="border-brand-200 shadow-xs">
            <CardHeader className="pb-3 bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-brand-600" />
                  Registration
                </span>
                <Badge
                  variant={
                    myRegistration?.status === 'registered'
                      ? 'success'
                      : myRegistration?.status === 'withdrawn'
                        ? 'warning'
                        : regWindow.isOpen
                          ? 'brand'
                          : 'neutral'
                  }
                >
                  {myRegistration?.status === 'registered'
                    ? 'Registered'
                    : myRegistration?.status === 'withdrawn'
                      ? 'Withdrawn'
                      : regWindow.isOpen
                        ? 'Open'
                        : 'Closed'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Registration Window Information */}
              <div className="space-y-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-md border border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Opens:</span>
                  <span className="font-medium text-slate-700">
                    {formatDateTime(
                      event.registrationOpensAt || event.createdAt,
                      event.timezone
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Closes:</span>
                  <span className="font-medium text-slate-700">
                    {formatDateTime(
                      event.registrationClosesAt || event.startAt,
                      event.timezone
                    )}
                  </span>
                </div>
                {event.capacity && (
                  <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                    <span className="text-slate-500">Capacity:</span>
                    <span className="font-medium text-slate-700">
                      {event.capacity} seats max
                    </span>
                  </div>
                )}
                {event.eventType === 'hackathon' && event.teamSizeMax && (
                  <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                    <span className="text-slate-500">Team Size:</span>
                    <span className="font-medium text-slate-700">
                      {event.teamSizeMin || 1} to {event.teamSizeMax} members
                    </span>
                  </div>
                )}
              </div>

              {/* User Participation Actions */}
              {isRegLoading ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  Checking registration status...
                </div>
              ) : myRegistration?.status === 'registered' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 p-3 rounded-md border border-emerald-200">
                    <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-semibold">You are registered!</p>
                      <p className="text-[11px] text-emerald-700">
                        Confirmed on {formatDateTime(myRegistration.registeredAt, event.timezone)}
                      </p>
                    </div>
                  </div>

                  {regWindow.isOpen ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full text-xs"
                      disabled={isSubmittingReg}
                      onClick={() => setShowWithdrawConfirm(true)}
                    >
                      <UserX className="h-3.5 w-3.5 mr-1.5" />
                      Withdraw Registration
                    </Button>
                  ) : (
                    <p className="text-[11px] text-slate-400 text-center italic">
                      Registration window has closed. Withdrawal is no longer available.
                    </p>
                  )}
                </div>
              ) : myRegistration?.status === 'withdrawn' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 p-3 rounded-md border border-amber-200">
                    <UserX className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-semibold">Registration Withdrawn</p>
                      <p className="text-[11px] text-amber-700">
                        You withdrew on {formatDateTime(myRegistration.withdrawnAt || myRegistration.updatedAt, event.timezone)}.
                      </p>
                    </div>
                  </div>

                  {regWindow.isOpen ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full text-xs"
                      isLoading={isSubmittingReg}
                      onClick={handleRegister}
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1.5" />
                      Re-register for Event
                    </Button>
                  ) : (
                    <p className="text-[11px] text-slate-400 text-center italic">
                      Registration window has closed. Re-registration is unavailable.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {regWindow.isOpen ? (
                    <Button
                      variant="primary"
                      className="w-full"
                      isLoading={isSubmittingReg}
                      onClick={handleRegister}
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Register for Event
                    </Button>
                  ) : (
                    <div className="text-center py-2">
                      <Button variant="outline" className="w-full text-xs text-slate-400" disabled>
                        {regWindow.reason}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule & Timezone Sidebar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Schedule & Timezone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-slate-800">Starts At</div>
                  <div>{formatDateTime(event.startAt, event.timezone)}</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-slate-100 pt-3">
                <Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-slate-800">Ends At</div>
                  <div>{formatDateTime(event.endAt, event.timezone)}</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-slate-100 pt-3">
                <Globe className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-slate-800">Primary Timezone</div>
                  <div className="font-mono text-slate-700">{event.timezone}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Venue & Location Sidebar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Venue & Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                {event.locationType === 'in_person' ? (
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                ) : (
                  <Globe className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className="font-medium text-slate-800 capitalize">
                    {event.locationType.replace('_', ' ')}
                  </div>
                  <div className="text-slate-700">
                    {event.location || (event.locationType === 'virtual' ? 'Virtual Meeting' : 'Venue TBD')}
                  </div>
                </div>
              </div>

              {event.virtualUrl && (
                <div className="border-t border-slate-100 pt-3">
                  <div className="font-medium text-slate-800 mb-1">Virtual Stream / Meeting</div>
                  <a
                    href={event.virtualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline break-all"
                  >
                    {event.virtualUrl}
                  </a>
                </div>
              )}

              {event.capacity && (
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                  <Users className="h-4 w-4 text-slate-400 shrink-0" />
                  <span>Maximum Capacity: <strong>{event.capacity}</strong> attendees</span>
                </div>
              )}

              {event.eventType === 'hackathon' && (
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-brand-700 font-medium">
                  <Code2 className="h-4 w-4 shrink-0" />
                  <span>Hackathon & Challenge Module</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog: Create Team */}
      <Dialog
        isOpen={showCreateTeamModal}
        onClose={() => setShowCreateTeamModal(false)}
        title="Create Hackathon Team"
        description={`Create a new team for ${event.title}. Max team size is ${event.teamSizeMax || 10} members.`}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Team Name</label>
            <Input
              placeholder="e.g. Cyber Innovators"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              disabled={isCreatingTeam}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Team Description (Optional)</label>
            <Textarea
              placeholder="Briefly describe what your team aims to build..."
              value={newTeamDesc}
              onChange={(e) => setNewTeamDesc(e.target.value)}
              disabled={isCreatingTeam}
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateTeamModal(false)}
              disabled={isCreatingTeam}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateTeam}
              isLoading={isCreatingTeam}
              disabled={!newTeamName.trim()}
            >
              Create Team
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog: Invite Team Member */}
      <Dialog
        isOpen={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setGeneratedToken(null);
        }}
        title="Invite Team Member"
        description={`Send a single-use invitation token to a registered participant. Valid for 7 days.`}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Participant Email</label>
            <Input
              placeholder="participant@example.com"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              disabled={isInviting}
            />
          </div>

          {generatedToken && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
              <span className="font-semibold text-slate-700 block">Invitation Token Generated:</span>
              <div className="font-mono text-[11px] bg-white p-2 rounded border border-slate-200 select-all break-all">
                {generatedToken}
              </div>
              <p className="text-[11px] text-slate-500">
                The invitee can accept this invitation using this token.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowInviteModal(false);
                setGeneratedToken(null);
              }}
              disabled={isInviting}
            >
              Close
            </Button>
            {!generatedToken && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleInviteMember}
                isLoading={isInviting}
                disabled={!inviteEmail.trim()}
              >
                Send Invite
              </Button>
            )}
          </div>
        </div>
      </Dialog>

      {/* Dialog: Submit / Edit Project */}
      <Dialog
        isOpen={showSubmissionModal}
        onClose={() => setShowSubmissionModal(false)}
        title={mySubmission ? 'Edit Project Submission' : 'Submit Hackathon Project'}
        description="Provide project details and URLs. Backend never fetches arbitrary URLs directly."
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Project Title *</label>
            <Input
              placeholder="e.g. DeepDefend AI Agent"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              disabled={isSubmittingProject}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Project Description</label>
            <Textarea
              placeholder="Explain what problem your project solves and its architecture..."
              value={subDesc}
              onChange={(e) => setSubDesc(e.target.value)}
              disabled={isSubmittingProject}
              rows={3}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Repository URL (GitHub / GitLab)</label>
            <Input
              placeholder="https://github.com/org/repo"
              value={subRepoUrl}
              onChange={(e) => setSubRepoUrl(e.target.value)}
              disabled={isSubmittingProject}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Live Demo / Video URL</label>
            <Input
              placeholder="https://my-demo-app.vercel.app"
              value={subDemoUrl}
              onChange={(e) => setSubDemoUrl(e.target.value)}
              disabled={isSubmittingProject}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSubmissionModal(false)}
              disabled={isSubmittingProject}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitProject}
              isLoading={isSubmittingProject}
              disabled={!subTitle.trim()}
            >
              {mySubmission ? 'Save Changes' : 'Submit Project'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Confirmation Dialog for Withdrawal */}
      <ConfirmDialog
        isOpen={showWithdrawConfirm}
        onClose={() => setShowWithdrawConfirm(false)}
        onConfirm={handleWithdraw}
        title="Withdraw Registration"
        description="Are you sure you want to withdraw your registration for this event? Your spot may be claimed by another participant if capacity is limited."
        confirmLabel="Yes, Withdraw"
        cancelLabel="Keep Registration"
        variant="destructive"
        isLoading={isSubmittingReg}
      />

      {/* Confirmation Dialog for Leaving Team */}
      <ConfirmDialog
        isOpen={showLeaveTeamConfirm}
        onClose={() => setShowLeaveTeamConfirm(false)}
        onConfirm={handleLeaveTeam}
        title="Leave Team"
        description="Are you sure you want to leave this team? If you are the owner and sole member, the team will be removed."
        confirmLabel="Leave Team"
        cancelLabel="Stay in Team"
        variant="destructive"
        isLoading={isLeavingTeam}
      />

      {/* Phase 6D Dialog: Add Scoring Criterion */}
      <Dialog
        isOpen={showAddCriterionModal}
        onClose={() => setShowAddCriterionModal(false)}
        title="Add Scoring Criterion"
        description="Define an evaluation criterion and its maximum point value (1..100) per EVT-008."
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Criterion Name *</label>
            <Input
              placeholder="e.g. Technical Execution, Innovation, UI/UX"
              value={newCritName}
              onChange={(e) => setNewCritName(e.target.value)}
              disabled={isCreatingCrit}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Description (Optional)</label>
            <Textarea
              placeholder="Guidance for judges when evaluating this criterion..."
              value={newCritDesc}
              onChange={(e) => setNewCritDesc(e.target.value)}
              disabled={isCreatingCrit}
              rows={2}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Maximum Score (1..100) *</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={newCritMaxScore}
              onChange={(e) => setNewCritMaxScore(Number(e.target.value))}
              disabled={isCreatingCrit}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddCriterionModal(false)}
              disabled={isCreatingCrit}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateCriterion}
              isLoading={isCreatingCrit}
              disabled={!newCritName.trim()}
            >
              Add Criterion
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Phase 6D Dialog: Assign Judge */}
      <Dialog
        isOpen={showAssignJudgeModal}
        onClose={() => setShowAssignJudgeModal(false)}
        title="Assign Judge"
        description="Assign an organisation member or event judge to evaluate hackathon submissions."
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Judge User ID (UUID) *</label>
            <Input
              placeholder="Enter active user UUID"
              value={assignJudgeUserId}
              onChange={(e) => setAssignJudgeUserId(e.target.value)}
              disabled={isAssigningJudge}
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Submission ID Scope (Optional)</label>
            <Input
              placeholder="Leave blank to assign to all submissions in this event"
              value={assignSubmissionId}
              onChange={(e) => setAssignSubmissionId(e.target.value)}
              disabled={isAssigningJudge}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAssignJudgeModal(false)}
              disabled={isAssigningJudge}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssignJudge}
              isLoading={isAssigningJudge}
              disabled={!assignJudgeUserId.trim()}
            >
              Assign Judge
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Phase 6D Dialog: Score Submission */}
      <Dialog
        isOpen={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        title={`Score Project: ${activeSubForScoring?.title || ''}`}
        description="Submit numerical evaluations for each criterion. Straight sum aggregation will be computed automatically."
      >
        <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
          {criteria.length === 0 ? (
            <div className="text-center py-4 text-slate-500">
              No scoring criteria configured for this event.
            </div>
          ) : (
            criteria.map((crit) => (
              <div key={crit.id} className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h5 className="font-semibold text-slate-900">{crit.name}</h5>
                    {crit.description && (
                      <p className="text-[11px] text-slate-500">{crit.description}</p>
                    )}
                  </div>
                  <Badge variant="neutral">Max: {crit.maxScore}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Score</label>
                    <Input
                      type="number"
                      min={0}
                      max={crit.maxScore}
                      value={scoreFormValues[crit.id]?.score ?? 0}
                      onChange={(e) =>
                        setScoreFormValues((prev) => ({
                          ...prev,
                          [crit.id]: {
                            score: Number(e.target.value),
                            feedback: prev[crit.id]?.feedback || '',
                          },
                        }))
                      }
                      disabled={isSubmittingScores}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-medium text-slate-600 block mb-1">Feedback / Notes</label>
                    <Input
                      placeholder="Optional evaluator comment"
                      value={scoreFormValues[crit.id]?.feedback || ''}
                      onChange={(e) =>
                        setScoreFormValues((prev) => ({
                          ...prev,
                          [crit.id]: {
                            score: prev[crit.id]?.score ?? 0,
                            feedback: e.target.value,
                          },
                        }))
                      }
                      disabled={isSubmittingScores}
                    />
                  </div>
                </div>
              </div>
            ))
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowScoreModal(false)}
              disabled={isSubmittingScores}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitScores}
              isLoading={isSubmittingScores}
              disabled={criteria.length === 0}
            >
              Submit Scores
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Phase 6D ConfirmDialog: Publish Results */}
      <ConfirmDialog
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        onConfirm={handlePublishResults}
        title="Publish Official Hackathon Results"
        description="Are you sure you want to publish the final results? Once published, ranked results will be visible to all event participants and visitors."
        confirmLabel="Publish Results"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={isPublishingResults}
      />

      {/* Phase 6D ConfirmDialog: Unpublish Results */}
      <ConfirmDialog
        isOpen={showUnpublishConfirm}
        onClose={() => setShowUnpublishConfirm(false)}
        onConfirm={handleUnpublishResults}
        title="Unpublish Hackathon Results"
        description="Are you sure you want to unpublish results? The leaderboard will return to draft state and hide rankings from participants and public visitors."
        confirmLabel="Unpublish"
        cancelLabel="Keep Published"
        variant="destructive"
        isLoading={isUnpublishingResults}
      />
    </div>
  );
}

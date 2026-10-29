import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { AiAgendaDraftModal } from './AiAgendaDraftModal';
import { AiNotesSummaryModal } from './AiNotesSummaryModal';
import { AiActionItemsModal } from './AiActionItemsModal';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Lock,
  Users,
  ListOrdered,
  FileText,
  Play,
  CheckCircle,
  XCircle,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  ExternalLink,
  UserPlus,
  Check,
  X,
  HelpCircle,
  Mail,
  CheckSquare,
  Save,
  ShieldAlert,
  Edit3,
  MessageSquare,
  CheckCheck,
  AlertTriangle,
  Sparkles,
  FolderKanban,
  FileDown,
} from 'lucide-react';
import { Toast, ToastContainer } from '@/components/ui/Toast';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import { useAuth } from '@/api/AuthContext';
import { EditMeetingDialog } from './EditMeetingDialog';
import {
  MeetingItem,
  MeetingAttendee,
  MeetingAgendaItem,
  MeetingNotes,
  MeetingDiscussionPoint,
  MeetingDecision,
  MeetingActionItem,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_VARIANTS,
  MEETING_ALLOWED_TRANSITIONS,
  RSVP_STATUS_LABELS,
  RSVP_STATUS_VARIANTS,
  ACTION_ITEM_STATUS_LABELS,
  ACTION_ITEM_STATUS_VARIANTS,
  ACTION_ITEM_PRIORITY_LABELS,
  ACTION_ITEM_PRIORITY_VARIANTS,
  ActionItemPriority,
  ActionItemStatus,
  RsvpStatus,
  AttendeeRole,
  getTimezoneLabel,
  isMeetingOverdue,
} from '@/types/meetings';

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'destructive';
  isLoading?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function getCompletionConfirmMessage(hasEmptyMom: boolean): string {
  if (hasEmptyMom) {
    return 'Are you sure you want to complete this meeting? Note: No discussion points, decisions, or notes have been recorded for this meeting. Once completed, minutes cannot be edited.';
  }
  return 'Are you sure you want to complete this meeting? It cannot be edited after completion.';
}

export interface MeetingDetailPageProps {
  initialMeeting?: MeetingItem | null;
  initialAttendees?: MeetingAttendee[];
  initialAgendaItems?: MeetingAgendaItem[];
  initialNotes?: MeetingNotes | null;
  initialDiscussionPoints?: MeetingDiscussionPoint[];
  initialDecisions?: MeetingDecision[];
  initialNotesForbidden?: boolean;
  initialActionItems?: MeetingActionItem[];
  initialLoading?: boolean;
  initialActiveTab?: 'agenda' | 'attendees' | 'minutes' | 'actions';
  initialConfirmState?: ConfirmState | null;
}

export function MeetingDetailPage({
  initialMeeting = null,
  initialAttendees = [],
  initialAgendaItems = [],
  initialNotes = null,
  initialDiscussionPoints = [],
  initialDecisions = [],
  initialNotesForbidden = false,
  initialActionItems = [],
  initialLoading,
  initialActiveTab = 'agenda',
  initialConfirmState = null,
}: MeetingDetailPageProps = {}) {
  const { orgId, meetingId } = useParams<{ orgId: string; meetingId: string }>();
  const { activeOrg, activeDetails } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [meeting, setMeeting] = useState<MeetingItem | null>(initialMeeting);
  const [attendees, setAttendees] = useState<MeetingAttendee[]>(initialAttendees);
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>(initialAgendaItems);
  const [isLoading, setIsLoading] = useState<boolean>(
    initialMeeting !== null ? (initialLoading ?? false) : (initialLoading ?? true)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'agenda' | 'attendees' | 'minutes' | 'actions'>(initialActiveTab);

  // Dialog states
  const [isAddAgendaOpen, setIsAddAgendaOpen] = useState(false);
  const [isAiAgendaOpen, setIsAiAgendaOpen] = useState(false);
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [isAiActionsOpen, setIsAiActionsOpen] = useState(false);
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaDescription, setAgendaDescription] = useState('');
  const [agendaDuration, setAgendaDuration] = useState<number | ''>('');
  const [agendaSubmitting, setAgendaSubmitting] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);

  const [isAddAttendeeOpen, setIsAddAttendeeOpen] = useState(false);
  const [attendeeType, setAttendeeType] = useState<'internal' | 'external'>('internal');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [attendeeRole, setAttendeeRole] = useState<AttendeeRole>('participant');
  const [attendeeSubmitting, setAttendeeSubmitting] = useState(false);
  const [attendeeError, setAttendeeError] = useState<string | null>(null);

  // Status transition states
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // RSVP update states
  const [isRsvping, setIsRsvping] = useState(false);

  // Notes states (MTG-005)
  const [notes, setNotes] = useState<MeetingNotes | null>(initialNotes);
  const [notesContent, setNotesContent] = useState(initialNotes?.content || '');
  const [notesForbidden, setNotesForbidden] = useState(initialNotesForbidden);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Structured MOM states (Discussion Points & Decisions)
  const [discussionPoints, setDiscussionPoints] = useState<MeetingDiscussionPoint[]>(initialDiscussionPoints);
  const [isAddDiscussionOpen, setIsAddDiscussionOpen] = useState(false);
  const [discussionTitle, setDiscussionTitle] = useState('');
  const [discussionBody, setDiscussionBody] = useState('');
  const [discussionSubmitting, setDiscussionSubmitting] = useState(false);
  const [discussionError, setDiscussionError] = useState<string | null>(null);

  const [editingDiscussionPoint, setEditingDiscussionPoint] = useState<MeetingDiscussionPoint | null>(null);
  const [editDiscussionTitle, setEditDiscussionTitle] = useState('');
  const [editDiscussionBody, setEditDiscussionBody] = useState('');
  const [editDiscussionSubmitting, setEditDiscussionSubmitting] = useState(false);
  const [editDiscussionError, setEditDiscussionError] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<MeetingDecision[]>(initialDecisions);
  const [isAddDecisionOpen, setIsAddDecisionOpen] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState('');
  const [decisionDetails, setDecisionDetails] = useState('');
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [editingDecision, setEditingDecision] = useState<MeetingDecision | null>(null);
  const [editDecisionTitle, setEditDecisionTitle] = useState('');
  const [editDecisionDetails, setEditDecisionDetails] = useState('');
  const [editDecisionSubmitting, setEditDecisionSubmitting] = useState(false);
  const [editDecisionError, setEditDecisionError] = useState<string | null>(null);

  const [momActionMessage, setMomActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isExporting, setIsExporting] = useState<'markdown' | 'pdf' | null>(null);

  // Action items states (MTG-006)
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>(initialActionItems);
  const [isAddActionOpen, setIsAddActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionAssigneeId, setActionAssigneeId] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [actionPriority, setActionPriority] = useState<ActionItemPriority>('medium');
  const [actionAgendaItemId, setActionAgendaItemId] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [actionDecisionId, setActionDecisionId] = useState('');
  const [lockedDecision, setLockedDecision] = useState<MeetingDecision | null>(null);
  const [promotingItem, setPromotingItem] = useState<MeetingActionItem | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  // Email invitation state (MTG-007)
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteStatusMessage, setInviteStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Meet sync & join states (Phase 1B.5)
  const [isJoining, setIsJoining] = useState(false);
  const [isRetryingSync, setIsRetryingSync] = useState(false);

  // Organisation members for searchable member picker
  const [orgMembers, setOrgMembers] = useState<Array<{ userId: string; fullName: string; email: string; status: string }>>([]);

  // Confirm dialog state (replaces window.confirm)
  const [isEditMeetingOpen, setIsEditMeetingOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(initialConfirmState);

  const isTerminal = meeting?.status === 'completed' || meeting?.status === 'cancelled' || meeting?.status === 'missed';

  // Dynamic recalculation when upcoming meeting end time passes (single-shot timer, zero polling, zero leaks)
  const [timeTick, setTimeTick] = useState(() => Date.now());
  useEffect(() => {
    if (!meeting?.endAt || isTerminal) {
      return;
    }
    const endMs = new Date(meeting.endAt).getTime();
    const diff = endMs - Date.now();
    if (diff > 0 && diff < 86400000) {
      const timer = setTimeout(() => {
        setTimeTick(Date.now());
      }, diff + 100);
      return () => clearTimeout(timer);
    }
  }, [meeting?.endAt, meeting?.status, isTerminal]);

  const isOverdue = isMeetingOverdue(meeting?.status, meeting?.endAt, timeTick);

  const isOrganiserOrManager = Boolean(
    meeting?.organiserId === user?.id ||
      activeDetails?.membership?.role?.slug === 'organisation_owner' ||
      activeDetails?.membership?.role?.slug === 'organisation_admin' ||
      activeDetails?.membership?.permissions?.includes('meeting.edit') ||
      activeDetails?.membership?.permissions?.includes('meeting.status.manage')
  );

  const canManageStatus =
    activeDetails?.membership?.permissions?.includes('meeting.status.manage') ||
    meeting?.organiserId === user?.id ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const canEditMeeting =
    !isTerminal &&
    (activeDetails?.membership?.permissions?.includes('meeting.edit') ||
      meeting?.organiserId === user?.id ||
      activeDetails?.membership?.role?.slug === 'organisation_owner' ||
      activeDetails?.membership?.role?.slug === 'organisation_admin');

  const canManageNotes =
    !isTerminal &&
    (meeting?.organiserId === user?.id ||
      activeDetails?.membership?.permissions?.includes('meeting.notes.edit') ||
      activeDetails?.membership?.permissions?.includes('meeting.notes.manage') ||
      activeDetails?.membership?.role?.slug === 'organisation_owner' ||
      activeDetails?.membership?.role?.slug === 'organisation_admin');

  const canManageActions =
    !isTerminal &&
    (meeting?.organiserId === user?.id ||
      activeDetails?.membership?.permissions?.includes('meeting.action.manage') ||
      activeDetails?.membership?.role?.slug === 'organisation_owner' ||
      activeDetails?.membership?.role?.slug === 'organisation_admin');

  // Action Items Metrics (Phase D - MTG-IMP-11)
  const totalMeetingActions = actionItems.length;
  const doneMeetingActions = actionItems.filter((i) => i.status === 'done').length;
  const cancelledMeetingActions = actionItems.filter((i) => i.status === 'cancelled').length;
  const actionableMeetingActions = Math.max(0, totalMeetingActions - cancelledMeetingActions);
  const actionableMeetingRate = actionableMeetingActions > 0
    ? Math.round((doneMeetingActions / actionableMeetingActions) * 1000) / 10
    : 0;

  // Load meeting, attendees, agenda, notes, and action items
  const fetchMeetingData = useCallback(async () => {
    if (!effectiveOrgId || !meetingId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      const [meetingRes, attendeesRes, agendaRes] = await Promise.all([
        apiClient<{ meeting: MeetingItem }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}`
        ),
        apiClient<{ attendees: MeetingAttendee[] }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/attendees`
        ),
        apiClient<{ agendaItems?: MeetingAgendaItem[]; agenda?: MeetingAgendaItem[] }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda`
        ),
      ]);

      if (meetingRes.data?.meeting) {
        setMeeting(meetingRes.data.meeting);
      }
      setAttendees(attendeesRes.data?.attendees || []);
      setAgendaItems(agendaRes.data?.agendaItems || agendaRes.data?.agenda || []);

      // Fetch confidential notes safely (MTG-005)
      try {
        const notesRes = await apiClient<{
          notes: MeetingNotes | null;
          discussionPoints?: MeetingDiscussionPoint[];
          decisions?: MeetingDecision[];
        }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/notes`
        );
        if (notesRes.data?.notes) {
          setNotes(notesRes.data.notes);
          setNotesContent(notesRes.data.notes.content);
        } else {
          setNotes(null);
          setNotesContent('');
        }
        setDiscussionPoints(notesRes.data?.discussionPoints || []);
        setDecisions(notesRes.data?.decisions || []);
        setNotesForbidden(false);
      } catch (nErr) {
        if (nErr instanceof ApiError && (nErr.statusCode === 403 || nErr.code === 'FORBIDDEN_NOTES_ACCESS')) {
          setNotesForbidden(true);
        }
      }

      // Fetch action items (MTG-006)
      try {
        const actionsRes = await apiClient<{ actionItems: MeetingActionItem[] }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items`
        );
        setActionItems(actionsRes.data?.actionItems || []);
      } catch {
        setActionItems([]);
      }

      // Fetch organisation members for searchable picker
      try {
        const membersRes = await apiClient<{ members: Array<{ userId: string; fullName: string; email: string; status: string }> }>(
          `/organisations/${effectiveOrgId}/members`
        );
        if (membersRes.data?.members) {
          setOrgMembers(membersRes.data.members.filter((m) => m.status === 'active'));
        }
      } catch {
        // Graceful fallback if user lacks members view permission
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load meeting details.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, meetingId]);

  useEffect(() => {
    if (!initialMeeting) {
      fetchMeetingData();
    }
  }, [fetchMeetingData, initialMeeting]);

  // Current user's attendee record
  const currentAttendee = attendees.find((a) => a.userId === user?.id);

  // Available organisation members not yet added as attendees
  const availableMembers = orgMembers.filter((m) => !attendees.some((a) => a.userId === m.userId));

  // Status transition handler
  const handleTransition = (newStatus: string) => {
    if (!effectiveOrgId || !meetingId) return;

    const isMomEmpty =
      discussionPoints.length === 0 &&
      decisions.length === 0 &&
      !notesContent.trim() &&
      (!notes?.content || !notes.content.trim());

    const confirmMessage =
      newStatus === 'cancelled'
        ? 'Are you sure you want to cancel this meeting? This is a terminal action.'
        : newStatus === 'completed'
        ? getCompletionConfirmMessage(isMomEmpty)
        : newStatus === 'missed'
        ? 'Are you sure you want to mark this meeting as missed? This indicates the scheduled meeting did not take place.'
        : `Are you sure you want to change the meeting status to ${newStatus}?`;

    setConfirmState({
      isOpen: true,
      title:
        newStatus === 'cancelled'
          ? 'Cancel Meeting'
          : newStatus === 'completed'
          ? 'Complete Meeting'
          : newStatus === 'missed'
          ? 'Mark Meeting as Missed'
          : 'Update Meeting Status',
      description: confirmMessage,
      confirmLabel:
        newStatus === 'cancelled'
          ? 'Cancel Meeting'
          : newStatus === 'missed'
          ? 'Mark as Missed'
          : 'Confirm',
      variant: newStatus === 'cancelled' || newStatus === 'missed' ? 'destructive' : 'primary',
      onConfirm: async () => {
        try {
          setIsTransitioning(true);
          setActionError(null);

          const res = await apiClient<{ meeting: MeetingItem }>(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/status`,
            {
              method: 'POST',
              body: JSON.stringify({ status: newStatus }),
            }
          );

          if (res.data?.meeting) {
            setMeeting(res.data.meeting);
          }
        } catch (err) {
          if (err instanceof ApiError) {
            setActionError(err.message);
          } else {
            setActionError('Failed to change meeting status.');
          }
        } finally {
          setIsTransitioning(false);
          setConfirmState(null);
        }
      },
    });
  };

  // RSVP handler
  const handleRsvp = async (status: RsvpStatus) => {
    if (!effectiveOrgId || !meetingId) return;

    try {
      setIsRsvping(true);
      setActionError(null);

      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/rsvp`,
        {
          method: 'POST',
          body: JSON.stringify({ rsvpStatus: status }),
        }
      );

      // Refresh attendees
      const res = await apiClient<{ attendees: MeetingAttendee[] }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/attendees`
      );
      setAttendees(res.data?.attendees || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to update RSVP.');
      }
    } finally {
      setIsRsvping(false);
    }
  };

  // Add Agenda Item
  const handleAddAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId) return;
    setAgendaError(null);

    if (!agendaTitle.trim()) {
      setAgendaError('Title is required.');
      return;
    }

    try {
      setAgendaSubmitting(true);

      const payload = {
        title: agendaTitle.trim(),
        description: agendaDescription.trim() || undefined,
        durationMinutes: agendaDuration ? Number(agendaDuration) : undefined,
      };

      const res = await apiClient<{ item: MeetingAgendaItem }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.item) {
        setAgendaItems((prev) => [...prev, res.data!.item]);
      }
      setIsAddAgendaOpen(false);
      setAgendaTitle('');
      setAgendaDescription('');
      setAgendaDuration('');
    } catch (err) {
      if (err instanceof ApiError) {
        setAgendaError(err.message);
      } else {
        setAgendaError('Failed to add agenda item.');
      }
    } finally {
      setAgendaSubmitting(false);
    }
  };

  // Delete Agenda Item
  const handleDeleteAgenda = (itemId: string) => {
    if (!effectiveOrgId || !meetingId) return;

    setConfirmState({
      isOpen: true,
      title: 'Delete Agenda Item',
      description: 'Are you sure you want to delete this agenda item? This action cannot be undone.',
      confirmLabel: 'Delete Item',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda/${itemId}`,
            { method: 'DELETE' }
          );

          setAgendaItems((prev) => prev.filter((i) => i.id !== itemId));
        } catch (err) {
          if (err instanceof ApiError) {
            setAgendaError(err.message);
          } else {
            setAgendaError('Failed to delete agenda item.');
          }
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  // Reorder Agenda Items
  const handleMoveAgenda = async (index: number, direction: 'up' | 'down') => {
    if (!effectiveOrgId || !meetingId) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= agendaItems.length) return;

    const newItems = [...agendaItems];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);

    // Build items with new order index
    const reorderedPayload = newItems.map((item, idx) => ({
      id: item.id,
      orderIndex: idx + 1,
    }));

    try {
      // Optimistic update
      setAgendaItems(
        newItems.map((item, idx) => ({ ...item, orderIndex: idx + 1 }))
      );

      const res = await apiClient<{ success?: boolean; agendaItems?: MeetingAgendaItem[]; agenda?: MeetingAgendaItem[] }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ items: reorderedPayload }),
        }
      );

      if (res.data?.agendaItems || res.data?.agenda) {
        setAgendaItems(res.data.agendaItems || res.data.agenda || []);
      }
    } catch (err) {
      // Revert on error
      fetchMeetingData();
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to reorder agenda items.');
      }
    }
  };

  // Add Attendee
  const handleAddAttendee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId) return;
    setAttendeeError(null);

    if (attendeeType === 'internal' && !selectedUserId.trim()) {
      setAttendeeError('User ID is required for internal attendee.');
      return;
    }

    if (attendeeType === 'external' && !externalEmail.trim()) {
      setAttendeeError('Email address is required for external attendee.');
      return;
    }

    try {
      setAttendeeSubmitting(true);

      const payload = {
        role: attendeeRole,
        ...(attendeeType === 'internal'
          ? { userId: selectedUserId.trim() }
          : { externalEmail: externalEmail.trim() }),
      };

      const res = await apiClient<{ attendee: MeetingAttendee }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/attendees`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.attendee) {
        setAttendees((prev) => [...prev, res.data!.attendee]);
      }
      setIsAddAttendeeOpen(false);
      setSelectedUserId('');
      setExternalEmail('');
      setAttendeeRole('participant');
    } catch (err) {
      if (err instanceof ApiError) {
        setAttendeeError(err.message);
      } else {
        setAttendeeError('Failed to add attendee.');
      }
    } finally {
      setAttendeeSubmitting(false);
    }
  };

  // Remove Attendee
  const handleRemoveAttendee = (attendeeId: string) => {
    if (!effectiveOrgId || !meetingId) return;

    setConfirmState({
      isOpen: true,
      title: 'Remove Attendee',
      description: 'Are you sure you want to remove this attendee from the meeting?',
      confirmLabel: 'Remove Attendee',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/attendees/${attendeeId}`,
            { method: 'DELETE' }
          );

          setAttendees((prev) => prev.filter((a) => a.id !== attendeeId));
        } catch (err) {
          if (err instanceof ApiError) {
            setErrorMsg(err.message);
          } else {
            setErrorMsg('Failed to remove attendee.');
          }
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  // Save Confidential Minutes (MTG-005, SEC-009 Optimistic Locking)
  const handleSaveNotesContent = async (newContent: string, expectedUpdatedAt?: string): Promise<boolean> => {
    if (!effectiveOrgId || !meetingId) return false;

    try {
      setIsSavingNotes(true);
      setNotesMessage(null);

      const requestBody: { content: string; expectedUpdatedAt?: string } = {
        content: newContent.trim(),
      };
      const versionToExpect = expectedUpdatedAt !== undefined ? expectedUpdatedAt : notes?.updatedAt;
      if (versionToExpect) {
        requestBody.expectedUpdatedAt = versionToExpect;
      }

      const res = await apiClient<{ notes: MeetingNotes }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/notes`,
        {
          method: 'PUT',
          body: JSON.stringify(requestBody),
        }
      );

      if (res.data?.notes) {
        setNotes(res.data.notes);
        setNotesContent(res.data.notes.content);
        setToast({ type: 'success', message: 'Confidential minutes saved successfully.' });
        return true;
      }
      return false;
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === 'CONCURRENT_MODIFICATION')) {
        // Crucial: preserve user's typed unsaved draft in notesContent without discarding!
        setNotesMessage({
          type: 'error',
          text: 'These notes were modified by another user while you were editing. Your unsaved changes are preserved below. Please copy your edits, reload to review the newer version, and merge your changes.',
        });
        setToast({
          type: 'error',
          message: 'Conflict: Meeting notes were updated by another user. Your edits have been preserved.',
        });
        throw err;
      } else {
        setNotesMessage({
          type: 'error',
          text: err instanceof ApiError ? err.message : 'Failed to save confidential minutes.',
        });
        throw err;
      }
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId || !notesContent.trim()) return;
    try {
      await handleSaveNotesContent(notesContent);
    } catch {
      // Error is caught and displayed by handleSaveNotesContent
    }
  };

  // ---------------------------------------------------------------------------
  // Structured MOM: Discussion Points Handlers
  // ---------------------------------------------------------------------------
  const handleAddDiscussionPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId) return;

    if (!discussionTitle.trim()) {
      setDiscussionError('Discussion point title is required.');
      return;
    }

    try {
      setDiscussionSubmitting(true);
      setDiscussionError(null);
      setMomActionMessage(null);

      const res = await apiClient<{ discussionPoint: MeetingDiscussionPoint }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/discussion-points`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: discussionTitle.trim(),
            body: discussionBody.trim(),
          }),
        }
      );

      if (res.data?.discussionPoint) {
        const point = res.data.discussionPoint;
        setDiscussionPoints((prev) => [...prev, point]);
        setIsAddDiscussionOpen(false);
        setDiscussionTitle('');
        setDiscussionBody('');
        setToast({ type: 'success', message: 'Discussion point added successfully.' });
      }
    } catch (err) {
      setDiscussionError(err instanceof ApiError ? err.message : 'Failed to add discussion point.');
    } finally {
      setDiscussionSubmitting(false);
    }
  };

  const handleEditDiscussionPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId || !editingDiscussionPoint) return;

    if (!editDiscussionTitle.trim()) {
      setEditDiscussionError('Discussion point title cannot be empty.');
      return;
    }

    try {
      setEditDiscussionSubmitting(true);
      setEditDiscussionError(null);
      setMomActionMessage(null);

      const res = await apiClient<{ discussionPoint: MeetingDiscussionPoint }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/discussion-points/${editingDiscussionPoint.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: editDiscussionTitle.trim(),
            body: editDiscussionBody.trim(),
          }),
        }
      );

      if (res.data?.discussionPoint) {
        const point = res.data.discussionPoint;
        setDiscussionPoints((prev) =>
          prev.map((p) => (p.id === editingDiscussionPoint.id ? point : p))
        );
        setEditingDiscussionPoint(null);
        setToast({ type: 'success', message: 'Discussion point updated.' });
      }
    } catch (err) {
      setEditDiscussionError(err instanceof ApiError ? err.message : 'Failed to update discussion point.');
    } finally {
      setEditDiscussionSubmitting(false);
    }
  };

  const handleDeleteDiscussionPoint = (point: MeetingDiscussionPoint) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Discussion Point',
      description: `Are you sure you want to delete discussion point "${point.title}"?`,
      confirmLabel: 'Delete Point',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/discussion-points/${point.id}`,
            { method: 'DELETE' }
          );
          setDiscussionPoints((prev) => prev.filter((p) => p.id !== point.id));
          setToast({ type: 'success', message: 'Discussion point deleted.' });
        } catch (err) {
          setErrorMsg(err instanceof ApiError ? err.message : 'Failed to delete discussion point.');
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleReorderDiscussionPoints = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= discussionPoints.length) return;

    const reordered = [...discussionPoints];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const prevPoints = discussionPoints;
    setDiscussionPoints(reordered);

    try {
      const itemIds = reordered.map((p) => p.id);
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/discussion-points/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ itemIds }),
        }
      );
    } catch (err) {
      setDiscussionPoints(prevPoints);
      setMomActionMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to reorder discussion points.',
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Structured MOM: Decisions Handlers
  // ---------------------------------------------------------------------------
  const handleAddDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId) return;

    if (!decisionTitle.trim()) {
      setDecisionError('Decision title is required.');
      return;
    }

    try {
      setDecisionSubmitting(true);
      setDecisionError(null);
      setMomActionMessage(null);

      const res = await apiClient<{ decision: MeetingDecision }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/decisions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: decisionTitle.trim(),
            details: decisionDetails.trim(),
          }),
        }
      );

      if (res.data?.decision) {
        const dec = res.data.decision;
        setDecisions((prev) => [...prev, dec]);
        setIsAddDecisionOpen(false);
        setDecisionTitle('');
        setDecisionDetails('');
        setToast({ type: 'success', message: 'Decision recorded successfully.' });
      }
    } catch (err) {
      setDecisionError(err instanceof ApiError ? err.message : 'Failed to record decision.');
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleEditDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId || !editingDecision) return;

    if (!editDecisionTitle.trim()) {
      setEditDecisionError('Decision title cannot be empty.');
      return;
    }

    try {
      setEditDecisionSubmitting(true);
      setEditDecisionError(null);
      setMomActionMessage(null);

      const res = await apiClient<{ decision: MeetingDecision }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/decisions/${editingDecision.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            title: editDecisionTitle.trim(),
            details: editDecisionDetails.trim(),
          }),
        }
      );

      if (res.data?.decision) {
        const dec = res.data.decision;
        setDecisions((prev) =>
          prev.map((d) => (d.id === editingDecision.id ? dec : d))
        );
        setEditingDecision(null);
        setToast({ type: 'success', message: 'Decision updated.' });
      }
    } catch (err) {
      setEditDecisionError(err instanceof ApiError ? err.message : 'Failed to update decision.');
    } finally {
      setEditDecisionSubmitting(false);
    }
  };

  const handleDeleteDecision = (decision: MeetingDecision) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Decision',
      description: `Are you sure you want to delete decision "${decision.title}"?`,
      confirmLabel: 'Delete Decision',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/decisions/${decision.id}`,
            { method: 'DELETE' }
          );
          setDecisions((prev) => prev.filter((d) => d.id !== decision.id));
          setToast({ type: 'success', message: 'Decision deleted.' });
        } catch (err) {
          setErrorMsg(err instanceof ApiError ? err.message : 'Failed to delete decision.');
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const handleReorderDecisions = async (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= decisions.length) return;

    const reordered = [...decisions];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const prevDecisions = decisions;
    setDecisions(reordered);

    try {
      const itemIds = reordered.map((d) => d.id);
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/decisions/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ itemIds }),
        }
      );
    } catch (err) {
      setDecisions(prevDecisions);
      setMomActionMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to reorder decisions.',
      });
    }
  };

  const handleCreateActionFromDecision = (decision: MeetingDecision) => {
    setActionTitle(decision.title);
    setActionDescription(decision.details || '');
    setActionDecisionId(decision.id);
    setLockedDecision(decision);
    setItemError(null);
    setIsAddActionOpen(true);
  };

  const openPromoteDialog = async (item: MeetingActionItem) => {
    setPromotingItem(item);
    setPromoteError(null);
    setSelectedProjectId('');
    setIsLoadingProjects(true);
    try {
      const res = await apiClient<{ projects: Array<{ id: string; name: string; status: string }> }>(
        `/organisations/${effectiveOrgId}/projects`
      );
      const activeProjects = (res.data?.projects || []).filter((p) => p.status !== 'archived');
      setProjects(activeProjects);
      if (activeProjects.length > 0) {
        setSelectedProjectId(activeProjects[0].id);
      }
    } catch (err) {
      setPromoteError(err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleConfirmPromote = async () => {
    if (!effectiveOrgId || !meetingId || !promotingItem || !selectedProjectId) return;
    try {
      setIsPromoting(true);
      setPromoteError(null);
      const res = await apiClient<{ actionItem: MeetingActionItem; task: any; alreadyPromoted: boolean }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items/${promotingItem.id}/promote-to-task`,
        {
          method: 'POST',
          body: JSON.stringify({ projectId: selectedProjectId }),
        }
      );
      if (res.data?.actionItem) {
        const updated = res.data.actionItem;
        setActionItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        setToast({
          type: 'success',
          message: res.data.alreadyPromoted
            ? 'Action item is already promoted to this project task.'
            : 'Action item promoted to Project Task successfully.',
        });
      }
      setPromotingItem(null);
    } catch (err) {
      setPromoteError(err instanceof ApiError ? err.message : 'Failed to promote action item.');
    } finally {
      setIsPromoting(false);
    }
  };

  // Add Action Item (MTG-006)
  const handleAddActionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId) return;

    if (!actionTitle.trim()) {
      setItemError('Action item title is required.');
      return;
    }
    if (!actionAssigneeId) {
      setItemError('Please select or specify an assignee.');
      return;
    }

    try {
      setActionSubmitting(true);
      setItemError(null);

      const payload: Record<string, unknown> = {
        title: actionTitle.trim(),
        description: actionDescription.trim() || undefined,
        assigneeId: actionAssigneeId,
        priority: actionPriority,
        dueDate: actionDueDate || undefined,
        agendaItemId: actionAgendaItemId || undefined,
        decisionId: actionDecisionId || undefined,
      };

      const res = await apiClient<{ actionItem: MeetingActionItem }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.actionItem) {
        const newItem = res.data.actionItem;
        setActionItems((prev) => [newItem, ...prev]);
        setIsAddActionOpen(false);
        setActionTitle('');
        setActionDescription('');
        setActionAssigneeId('');
        setActionDueDate('');
        setActionPriority('medium');
        setActionAgendaItemId('');
        setActionDecisionId('');
        setLockedDecision(null);
      }
    } catch (err) {
      setItemError(
        err instanceof ApiError ? err.message : 'Failed to create action item.'
      );
    } finally {
      setActionSubmitting(false);
    }
  };

  // Update Action Item Status (MTG-006)
  const handleUpdateActionStatus = async (itemId: string, newStatus: ActionItemStatus) => {
    if (!effectiveOrgId || !meetingId) return;

    try {
      const res = await apiClient<{ actionItem: MeetingActionItem }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items/${itemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (res.data?.actionItem) {
        const updatedItem = res.data.actionItem;
        setActionItems((prev) =>
          prev.map((item) => (item.id === itemId ? updatedItem : item))
        );
      }
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to update action item status.');
    }
  };

  // Delete Action Item (MTG-006)
  const handleDeleteActionItem = (itemId: string) => {
    if (!effectiveOrgId || !meetingId) return;

    setConfirmState({
      isOpen: true,
      title: 'Delete Action Item',
      description: 'Are you sure you want to delete this action item? This action cannot be undone.',
      confirmLabel: 'Delete Action Item',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items/${itemId}`,
            { method: 'DELETE' }
          );
          setActionItems((prev) => prev.filter((item) => item.id !== itemId));
        } catch (err) {
          setItemError(err instanceof ApiError ? err.message : 'Failed to delete action item.');
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  // Send Email Invitations (MTG-007)
  const handleSendInvitations = () => {
    if (!effectiveOrgId || !meetingId) return;

    setConfirmState({
      isOpen: true,
      title: 'Send Invitations',
      description: 'Send email invitations to all pending attendees for this meeting?',
      confirmLabel: 'Send Invitations',
      variant: 'primary',
      onConfirm: async () => {
        try {
          setIsSendingInvites(true);
          setInviteStatusMessage(null);

          const res = await apiClient<{ sentCount: number; failedCount: number }>(
            `/organisations/${effectiveOrgId}/meetings/${meetingId}/send-invites`,
            {
              method: 'POST',
              body: JSON.stringify({}),
            }
          );

          if (res.data) {
            setInviteStatusMessage({
              type: 'success',
              text: `Successfully dispatched ${res.data.sentCount} invitation(s).${
                res.data.failedCount > 0 ? ` (${res.data.failedCount} failed delivery)` : ''
              }`,
            });
          }
        } catch (err) {
          setInviteStatusMessage({
            type: 'error',
            text: err instanceof ApiError ? err.message : 'Failed to send invitations.',
          });
        } finally {
          setIsSendingInvites(false);
          setConfirmState(null);
        }
      },
    });
  };

  const handleJoinMeeting = async () => {
    if (!meeting || !effectiveOrgId) return;
    try {
      setIsJoining(true);
      const res = await apiClient<{ virtualUrl: string }>(
        `/organisations/${effectiveOrgId}/meetings/${meeting.id}/join`
      );
      if (res.data?.virtualUrl) {
        window.open(res.data.virtualUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setToast({ type: 'error', message: err.message });
      } else {
        setToast({ type: 'error', message: 'Failed to join meeting. Please try again.' });
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleRetrySync = async () => {
    if (!meeting || !effectiveOrgId) return;
    try {
      setIsRetryingSync(true);
      const res = await apiClient<{ meeting: MeetingItem }>(
        `/organisations/${effectiveOrgId}/meetings/${meeting.id}/sync-google`,
        { method: 'POST' }
      );
      if (res.data?.meeting) {
        setMeeting(res.data.meeting);
        setToast({ type: 'success', message: 'Google Meet link generated successfully.' });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setToast({ type: 'error', message: err.message });
      } else {
        setToast({ type: 'error', message: 'Failed to retry Google Meet sync.' });
      }
    } finally {
      setIsRetryingSync(false);
    }
  };

  // Export MOM in Markdown or PDF
  const handleExport = async (format: 'markdown' | 'pdf') => {
    if (!effectiveOrgId || !meetingId || isExporting) return;
    try {
      setIsExporting(format);
      setActionError(null);

      const response = await fetch(
        `/api/v1/organisations/${effectiveOrgId}/meetings/${meetingId}/export?format=${format}`,
        {
          method: 'GET',
          headers: {
            Accept: format === 'markdown' ? 'text/markdown' : 'application/pdf',
          },
          credentials: 'include',
        }
      );

      if (!response.ok) {
        let errText = `Export failed with status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.message) errText = errData.message;
        } catch {
          // fallback to default errText
        }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition');
      let filename = `meeting-${meetingId}-minutes.${format === 'markdown' ? 'md' : 'pdf'}`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setToast({
        message: `Meeting minutes exported as ${format === 'markdown' ? 'Markdown' : 'PDF'} successfully.`,
        type: 'success',
      });
    } catch (err: any) {
      setActionError(err.message || 'Failed to export meeting minutes.');
      setToast({
        message: err.message || 'Failed to export meeting minutes.',
        type: 'error',
      });
    } finally {
      setIsExporting(null);
    }
  };

  const formatMeetingDate = (isoString?: string, timezone?: string) => {
    if (!isoString) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(isoString));
    } catch {
      return new Date(isoString).toLocaleString();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 rounded" />
        <div className="h-36 bg-white border border-border rounded-lg" />
        <div className="h-64 bg-white border border-border rounded-lg" />
      </div>
    );
  }

  if (errorMsg || !meeting) {
    return (
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: 'Workspace', href: '/app' },
            { label: activeOrg?.name || 'Organisation', href: '/app' },
            { label: 'Meetings', href: `/app/organisations/${effectiveOrgId}/meetings` },
            { label: 'Error' },
          ]}
        />
        <Alert variant="error" title="Meeting Not Found or Access Denied">
          {errorMsg || 'Could not load meeting details.'}
        </Alert>
        <Button variant="outline" onClick={() => navigate(`/app/organisations/${effectiveOrgId}/meetings`)}>
          Back to Meetings
        </Button>
      </div>
    );
  }

  const allowedTransitions = MEETING_ALLOWED_TRANSITIONS[meeting.status] || [];
  const totalAgendaDuration = agendaItems.reduce(
    (sum, item) => sum + (item.durationMinutes || 0),
    0
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Meetings', href: `/app/organisations/${effectiveOrgId}/meetings` },
          { label: meeting.title },
        ]}
      />

      {actionError && (
        <Alert variant="error" title="Action Failed">
          {actionError}
        </Alert>
      )}

      {/* Terminal State Banner */}
      {isTerminal && (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 flex items-center justify-between text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-slate-500" />
            <span>
              This meeting is <strong>{meeting.status}</strong>. Per lifecycle rules, terminal meetings cannot be modified or transitioned.
            </span>
          </div>
        </div>
      )}

      {/* Overdue Warning Banner */}
      {isOverdue && !isTerminal && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between text-sm text-amber-800"
          data-testid="overdue-banner"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              This meeting's scheduled end time has passed. Please update the meeting status to complete it or mark it as missed.
            </span>
          </div>
        </div>
      )}

      {/* Meeting Header Card */}
      <Card className="shadow-xs">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={MEETING_STATUS_VARIANTS[meeting.status]}>
                  {MEETING_STATUS_LABELS[meeting.status] || meeting.status}
                </Badge>

                {isOverdue && (
                  <Badge variant="warning" className="flex items-center gap-1" data-testid="overdue-badge">
                    Overdue
                  </Badge>
                )}

                {meeting.visibility === 'attendees_only' ? (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Attendees Only
                  </Badge>
                ) : (
                  <Badge variant="neutral">Organisation Visible</Badge>
                )}

                <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" />
                  {getTimezoneLabel(meeting.timezone)}
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {meeting.title}
              </h1>

              {meeting.description && (
                <p className="text-sm text-slate-600 max-w-3xl whitespace-pre-line">
                  {meeting.description}
                </p>
              )}
            </div>

            {/* Header Action Buttons: Export & Lifecycle Controls */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* MOM Export Controls */}
              <div className="inline-flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-slate-50">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!isExporting}
                  onClick={() => handleExport('markdown')}
                  className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-indigo-600 hover:bg-white px-2 py-1 h-8"
                  data-testid="export-md-btn"
                  title="Export Minutes of Meeting as Markdown (.md)"
                >
                  <FileText className="h-3.5 w-3.5 text-indigo-600" />
                  {isExporting === 'markdown' ? 'Exporting...' : 'Export .MD'}
                </Button>
                <div className="h-4 w-px bg-slate-200" />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!isExporting}
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-rose-600 hover:bg-white px-2 py-1 h-8"
                  data-testid="export-pdf-btn"
                  title="Export Minutes of Meeting as PDF (.pdf)"
                >
                  <FileDown className="h-3.5 w-3.5 text-rose-600" />
                  {isExporting === 'pdf' ? 'Generating...' : 'Export PDF'}
                </Button>
              </div>

              {/* Lifecycle Status Transitions & Actions */}
              {((canManageStatus || canEditMeeting) && !isTerminal) && (
                <>
                  {canEditMeeting && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditMeetingOpen(true)}
                      className="flex items-center gap-1.5"
                      data-testid="edit-meeting-btn"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit Meeting
                    </Button>
                  )}

                  {canManageStatus && allowedTransitions.includes('in_progress') && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => handleTransition('in_progress')}
                      className="flex items-center gap-1.5"
                      data-testid="start-meeting-btn"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start Meeting
                    </Button>
                  )}

                  {canManageStatus && meeting.status === 'in_progress' && allowedTransitions.includes('completed') && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => handleTransition('completed')}
                      className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800"
                      data-testid="complete-meeting-btn"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Complete
                    </Button>
                  )}

                  {canManageStatus && meeting.status === 'scheduled' && isOverdue && allowedTransitions.includes('missed') && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => handleTransition('missed')}
                      className="flex items-center gap-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-300"
                      data-testid="mark-missed-btn"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Mark as Missed
                    </Button>
                  )}

                  {canManageStatus && allowedTransitions.includes('cancelled') && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTransitioning}
                      onClick={() => handleTransition('cancelled')}
                      className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                      data-testid="cancel-meeting-btn"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  )}

                  {meeting.status === 'scheduled' && canEditMeeting && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSendingInvites}
                      onClick={handleSendInvitations}
                      className="flex items-center gap-1.5"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {isSendingInvites ? 'Sending...' : 'Send Invitations'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {inviteStatusMessage && (
            <Alert variant={inviteStatusMessage.type === 'success' ? 'success' : 'error'}>
              {inviteStatusMessage.text}
            </Alert>
          )}

          {/* Google Meet Synchronization Banners (Phase 1B.5) */}
          {meeting.conferenceProvider === 'google_meet' && (
            <div className="space-y-2">
              {(meeting.googleSyncStatus === 'pending_create' || meeting.googleSyncStatus === 'pending_update') && (
                <div
                  className="flex items-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-900"
                  data-testid="sync-pending-banner"
                >
                  <div className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span>Generating Google Meet conferencing link...</span>
                </div>
              )}

              {(meeting.googleSyncStatus === 'failed_create' || meeting.googleSyncStatus === 'failed_reschedule') && (
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900"
                  data-testid="sync-failed-banner"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Google Meet synchronization failed</p>
                      <p className="text-amber-700 mt-0.5">
                        {meeting.googleSyncError || 'Unable to provision Google Meet conference link with Google Calendar.'}
                      </p>
                    </div>
                  </div>
                  {canEditMeeting && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isRetryingSync}
                      onClick={handleRetrySync}
                      className="shrink-0 bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                      data-testid="retry-sync-cta"
                    >
                      {isRetryingSync ? 'Retrying...' : 'Retry Link'}
                    </Button>
                  )}
                </div>
              )}

              {meeting.googleSyncStatus === 'abandoned' && (
                <div
                  className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900"
                  data-testid="sync-abandoned-banner"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Google Workspace connection expired or revoked</p>
                    <p className="text-amber-700 mt-0.5">
                      The organisation Google integration credentials must be re-authenticated in Settings &gt; Integrations.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timing & Location Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-sm">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Schedule
              </span>
              <div className="flex items-start gap-2 text-slate-700">
                <Calendar className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    {formatMeetingDate(meeting.startAt, meeting.timezone)}
                  </p>
                  <p className="text-xs text-slate-500">
                    to {formatMeetingDate(meeting.endAt, meeting.timezone)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Location & Access
              </span>
              <div className="flex items-start gap-2 text-slate-700">
                {meeting.locationType === 'virtual' ? (
                  <Video className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
                ) : (
                  <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-medium capitalize">{meeting.locationType.replace('_', ' ')}</p>
                  {meeting.location && (
                    <p className="text-xs text-slate-500">{meeting.location}</p>
                  )}
                  {meeting.virtualUrl && (
                    !isTerminal ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <a
                          href={meeting.virtualUrl}
                          onClick={(e) => {
                            e.preventDefault();
                            handleJoinMeeting();
                          }}
                          className={`text-xs text-brand-600 hover:underline flex items-center gap-1 font-medium text-left cursor-pointer ${
                            isJoining ? 'opacity-50 pointer-events-none' : ''
                          }`}
                          data-testid="join-meeting-cta"
                        >
                          {meeting.conferenceProvider === 'google_meet' ? 'Join Google Meet' : 'Join Virtual Meeting'}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {meeting.conferenceProvider === 'google_meet' && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
                            data-testid="google-meet-synced-badge"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Google Meet
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 space-y-0.5" data-testid="terminal-link-container">
                        <span
                          className="text-xs text-slate-400 flex items-center gap-1.5"
                          data-testid="inactive-join-notice"
                        >
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                          {meeting.status === 'cancelled'
                            ? 'Meeting cancelled · Link inactive'
                            : meeting.status === 'missed'
                            ? 'Meeting missed · Link inactive'
                            : 'Meeting ended · Link inactive'}
                        </span>
                        {isOrganiserOrManager && (
                          <p
                            className="text-[11px] text-slate-400 font-mono truncate max-w-xs select-all"
                            title={meeting.virtualUrl}
                            data-testid="historical-meeting-url"
                          >
                            Historical link: {meeting.virtualUrl}
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Organiser
              </span>
              <div className="flex items-center gap-2 text-slate-700">
                <Users className="h-4 w-4 text-slate-400 shrink-0" />
                <div>
                  <p className="font-medium">{meeting.organiserName || 'Organiser'}</p>
                  {meeting.organiserEmail && (
                    <p className="text-xs text-slate-500">{meeting.organiserEmail}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Current User RSVP Card (hidden for organiser; disabled for currently active response) */}
          {currentAttendee && meeting.organiserId !== user?.id && currentAttendee.role !== 'organiser' && (
            <div
              className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              data-testid="rsvp-controls"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-medium text-slate-700">Your RSVP Status:</span>
                <Badge variant={RSVP_STATUS_VARIANTS[currentAttendee.rsvpStatus]}>
                  {RSVP_STATUS_LABELS[currentAttendee.rsvpStatus] || currentAttendee.rsvpStatus}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={currentAttendee.rsvpStatus === 'accepted' ? 'primary' : 'outline'}
                  disabled={isRsvping || currentAttendee.rsvpStatus === 'accepted'}
                  onClick={() => handleRsvp('accepted')}
                  className="flex items-center gap-1 text-xs"
                  data-testid="rsvp-accept-btn"
                >
                  <Check className="h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant={currentAttendee.rsvpStatus === 'tentative' ? 'secondary' : 'outline'}
                  disabled={isRsvping || currentAttendee.rsvpStatus === 'tentative'}
                  onClick={() => handleRsvp('tentative')}
                  className="flex items-center gap-1 text-xs"
                  data-testid="rsvp-tentative-btn"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Tentative
                </Button>
                <Button
                  size="sm"
                  variant={currentAttendee.rsvpStatus === 'declined' ? 'destructive' : 'outline'}
                  disabled={isRsvping || currentAttendee.rsvpStatus === 'declined'}
                  onClick={() => handleRsvp('declined')}
                  className="flex items-center gap-1 text-xs"
                  data-testid="rsvp-decline-btn"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('agenda')}
            className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'agenda'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <ListOrdered className="h-4 w-4" />
            Agenda Items ({agendaItems.length})
          </button>

          <button
            onClick={() => setActiveTab('attendees')}
            className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'attendees'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <Users className="h-4 w-4" />
            Attendees ({attendees.length})
          </button>

          <button
            onClick={() => setActiveTab('minutes')}
            className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'minutes'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <FileText className="h-4 w-4" />
            Minutes & Notes {notes ? '(Saved)' : ''}
          </button>

          <button
            onClick={() => setActiveTab('actions')}
            className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-sm transition-all ${
              activeTab === 'actions'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            Action Items ({actionItems.length})
          </button>
        </nav>
      </div>

      {/* Tab 1: Agenda */}
      {activeTab === 'agenda' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {totalAgendaDuration > 0 && (
                <span>
                  Total planned duration: <strong>{totalAgendaDuration} minutes</strong>
                </span>
              )}
            </div>

            {canEditMeeting && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAiAgendaOpen(true)}
                  className="flex items-center gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                  data-testid="open-ai-agenda-btn"
                >
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  Generate with AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddAgendaOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Agenda Item
                </Button>
              </div>
            )}
          </div>

          {agendaItems.length === 0 ? (
            <Card className="border-dashed py-8 text-center">
              <CardContent className="space-y-2">
                <ListOrdered className="h-8 w-8 text-slate-400 mx-auto" />
                <CardTitle className="text-base">No Agenda Items Scheduled</CardTitle>
                <CardDescription>
                  Keep meetings focused and structured by scheduling ordered discussion items.
                </CardDescription>
                {canEditMeeting && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsAddAgendaOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add First Agenda Item
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {agendaItems.map((item, index) => (
                <Card key={item.id} className="shadow-xs hover:border-slate-300 transition-all">
                  <CardContent className="p-4 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-xs font-semibold text-slate-700 shrink-0">
                        {item.orderIndex}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-slate-900">
                            {item.title}
                          </h4>
                          {item.durationMinutes && (
                            <Badge variant="neutral" className="text-xs">
                              {item.durationMinutes} min
                            </Badge>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-xs text-slate-600 whitespace-pre-line">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {canEditMeeting && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleMoveAgenda(index, 'up')}
                          disabled={index === 0}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleMoveAgenda(index, 'down')}
                          disabled={index === agendaItems.length - 1}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAgenda(item.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-600 ml-1"
                          title="Delete Item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Attendees */}
      {activeTab === 'attendees' && (
        <div className="space-y-4">
          {(() => {
            const totalInvited = attendees.length;
            const confirmedCount = attendees.filter((a) => a.rsvpStatus === 'accepted').length;
            const pendingCount = attendees.filter((a) => a.rsvpStatus === 'pending').length;
            const tentativeCount = attendees.filter((a) => a.rsvpStatus === 'tentative').length;
            const declinedCount = attendees.filter((a) => a.rsvpStatus === 'declined').length;

            return (
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600" data-testid="attendee-summary">
                  <span className="font-medium text-slate-900">{totalInvited} invited</span>
                  {' · '}
                  <span className="font-medium text-emerald-700">{confirmedCount} confirmed</span>
                  {totalInvited > 0 && (
                    <span className="text-xs text-slate-500 ml-2">
                      ({pendingCount} pending{tentativeCount > 0 ? `, ${tentativeCount} tentative` : ''}{declinedCount > 0 ? `, ${declinedCount} declined` : ''})
                    </span>
                  )}
                </div>

                {canEditMeeting && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddAttendeeOpen(true)}
                    className="flex items-center gap-1.5"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Attendee
                  </Button>
                )}
              </div>
            );
          })()}

          <Card className="shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Attendee</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">RSVP Status</th>
                    <th className="px-6 py-3">Invited</th>
                    {canEditMeeting && <th className="px-6 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {attendees.length === 0 ? (
                    <tr>
                      <td colSpan={canEditMeeting ? 5 : 4} className="px-6 py-8 text-center text-sm text-slate-500">
                        No attendees invited yet.
                      </td>
                    </tr>
                  ) : (
                    attendees.map((attendee) => {
                      const isSoleOrganiser =
                        attendee.role === 'organiser' &&
                        attendee.userId === meeting?.organiserId;
                      const displayName =
                        attendee.fullName ||
                        attendee.userName ||
                        attendee.externalEmail ||
                        'Member';
                      const displayEmail =
                        attendee.email ||
                        attendee.userEmail ||
                        attendee.externalEmail ||
                        '';
                      const isExternal =
                        attendee.isExternal ||
                        (!attendee.userId && Boolean(attendee.externalEmail));

                      return (
                        <tr key={attendee.id} className="hover:bg-slate-50/50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">
                              {displayName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {displayEmail}
                              {isExternal && (
                                <span className="ml-1.5 text-amber-600 font-mono">(External)</span>
                              )}
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="capitalize text-slate-700 font-medium">
                              {attendee.role}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={RSVP_STATUS_VARIANTS[attendee.rsvpStatus]}>
                              {RSVP_STATUS_LABELS[attendee.rsvpStatus] || attendee.rsvpStatus}
                            </Badge>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                            {new Date(attendee.invitedAt).toLocaleDateString()}
                          </td>

                          {canEditMeeting && (
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              {isSoleOrganiser ? (
                                <span className="text-xs text-slate-400 italic">Organiser</span>
                              ) : (
                                <button
                                  onClick={() => handleRemoveAttendee(attendee.id)}
                                  className="text-slate-400 hover:text-red-600 p-1"
                                  title="Remove Attendee"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Structured Minutes of Meeting (MOM) (MTG-005) */}
      {activeTab === 'minutes' && (
        <div className="space-y-6">
          {notesForbidden ? (
            <Card className="border-amber-200 bg-amber-50/50 py-8 text-center">
              <CardContent className="space-y-3 max-w-md mx-auto">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <CardTitle className="text-base text-slate-900">
                  Confidential Minutes
                </CardTitle>
                <CardDescription className="text-slate-600">
                  Meeting minutes are restricted to organisers and authorised administrative roles. Attendee status alone does not grant access.
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* MOM Header Card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="h-5 w-5 text-brand-600" />
                    Meeting Minutes (MOM)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Structured minutes comprising discussion points, key decisions, action items, and additional notes.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {canManageNotes && meeting.status !== 'cancelled' && (
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setIsAiSummaryOpen(true)}
                      className="flex items-center gap-1.5 text-xs text-brand-700 border-brand-300 hover:bg-brand-50"
                      data-testid="open-ai-notes-summary-btn"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                      Summarize Notes with AI
                    </Button>
                  )}
                  {canManageNotes && meeting.status !== 'cancelled' ? (
                    <Badge variant="brand">Edit Mode</Badge>
                  ) : (
                    <Badge variant="neutral">View Only</Badge>
                  )}
                  {notes?.updatedAt && (
                    <span className="text-slate-400">
                      Last updated: {new Date(notes.updatedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {momActionMessage && (
                <Alert variant={momActionMessage.type === 'success' ? 'success' : 'error'}>
                  {momActionMessage.text}
                </Alert>
              )}

              {meeting.status === 'cancelled' && (
                <Alert variant="warning">
                  This meeting is cancelled. Minutes are archived and cannot be edited.
                </Alert>
              )}

              {/* Section 1: Discussion Points */}
              <Card className="shadow-xs">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-brand-600" />
                      <h3 className="text-sm font-semibold text-slate-900">Discussion Points</h3>
                      <Badge variant="neutral" className="text-xs">
                        {discussionPoints.length}
                      </Badge>
                    </div>

                    {canManageNotes && meeting.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDiscussionTitle('');
                          setDiscussionBody('');
                          setDiscussionError(null);
                          setIsAddDiscussionOpen(true);
                        }}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Discussion Point
                      </Button>
                    )}
                  </div>

                  {discussionPoints.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-sm">
                      <p>No discussion points recorded yet.</p>
                      {canManageNotes && meeting.status !== 'cancelled' && (
                        <p className="text-xs text-slate-400 mt-1">
                          Click "Add Discussion Point" to record topics, deliberations, or proposals.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {discussionPoints.map((point, index) => (
                        <div
                          key={point.id}
                          className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                                #{index + 1}
                              </span>
                              <h4 className="text-sm font-semibold text-slate-900">{point.title}</h4>
                            </div>
                            {point.body ? (
                              <p className="text-sm text-slate-700 whitespace-pre-wrap pl-7">
                                {point.body}
                              </p>
                            ) : (
                              <p className="text-xs italic text-slate-400 pl-7">
                                Draft point (no detailed notes recorded)
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-slate-400 pl-7 pt-1">
                              {point.authorName && <span>By {point.authorName}</span>}
                              {point.updatedAt && (
                                <span>{new Date(point.updatedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>

                          {canManageNotes && !isTerminal && discussionPoints.length > 1 && (
                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === 0}
                                onClick={() => handleReorderDiscussionPoints(index, 'up')}
                                title="Move up"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === discussionPoints.length - 1}
                                onClick={() => handleReorderDiscussionPoints(index, 'down')}
                                title="Move down"
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingDiscussionPoint(point);
                                  setEditDiscussionTitle(point.title);
                                  setEditDiscussionBody(point.body || '');
                                  setEditDiscussionError(null);
                                }}
                                title="Edit point"
                                className="h-7 w-7 p-0 text-slate-500 hover:text-brand-600"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteDiscussionPoint(point)}
                                title="Delete point"
                                className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section 2: Key Decisions */}
              <Card className="shadow-xs">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-slate-900">Decisions</h3>
                      <Badge variant="neutral" className="text-xs">
                        {decisions.length}
                      </Badge>
                    </div>

                    {canManageNotes && meeting.status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDecisionTitle('');
                          setDecisionDetails('');
                          setDecisionError(null);
                          setIsAddDecisionOpen(true);
                        }}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Decision
                      </Button>
                    )}
                  </div>

                  {decisions.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-sm">
                      <p>No decisions recorded yet.</p>
                      {canManageNotes && meeting.status !== 'cancelled' && (
                        <p className="text-xs text-slate-400 mt-1">
                          Click "Add Decision" to record ratified outcomes, approvals, or strategic decisions.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {decisions.map((decision, index) => {
                        const linkedActions = actionItems.filter((a) => a.decisionId === decision.id);
                        return (
                          <div
                            key={decision.id}
                            className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50/50 transition-colors"
                          >
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="success" className="text-xs">
                                  Decision #{index + 1}
                                </Badge>
                                {linkedActions.length > 0 && (
                                  <Badge variant="neutral" className="text-xs">
                                    {linkedActions.length} action item{linkedActions.length > 1 ? 's' : ''}
                                  </Badge>
                                )}
                                <h4 className="text-sm font-semibold text-slate-900">{decision.title}</h4>
                              </div>
                              {decision.details && (
                                <p className="text-sm text-slate-700 whitespace-pre-wrap pl-1">
                                  {decision.details}
                                </p>
                              )}
                              <div className="flex items-center gap-3 text-xs text-slate-400 pl-1 pt-1">
                                {decision.authorName && <span>By {decision.authorName}</span>}
                                {decision.updatedAt && (
                                  <span>{new Date(decision.updatedAt).toLocaleDateString()}</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 pt-0.5">
                              {canManageActions && !isTerminal && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCreateActionFromDecision(decision)}
                                  title="Create Action Item from this decision"
                                  className="h-7 px-2 text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 border-brand-200 hover:bg-brand-50"
                                >
                                  <Plus className="h-3 w-3" />
                                  Action Item
                                </Button>
                              )}
                              {canManageNotes && !isTerminal && decisions.length > 1 && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={index === 0}
                                    onClick={() => handleReorderDecisions(index, 'up')}
                                    title="Move up"
                                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={index === decisions.length - 1}
                                    onClick={() => handleReorderDecisions(index, 'down')}
                                    title="Move down"
                                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {canManageNotes && !isTerminal && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingDecision(decision);
                                      setEditDecisionTitle(decision.title);
                                      setEditDecisionDetails(decision.details || '');
                                      setEditDecisionError(null);
                                    }}
                                    title="Edit decision"
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-brand-600"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteDecision(decision)}
                                    title="Delete decision"
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section 3: Action Items (Integrated MOM View) */}
              <Card className="shadow-xs">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-brand-600" />
                      <h3 className="text-sm font-semibold text-slate-900">Action Items</h3>
                      <Badge variant="neutral" className="text-xs">
                        {actionItems.length}
                      </Badge>
                      {actionItems.length > 0 && (
                        <span className="text-xs text-slate-500" data-testid="mom-action-summary">
                          {actionableMeetingActions === 0
                            ? `(${totalMeetingActions} cancelled · No actionable items)`
                            : `(${doneMeetingActions} of ${actionableMeetingActions} actionable completed${cancelledMeetingActions > 0 ? ` · ${cancelledMeetingActions} cancelled` : ''})`}
                        </span>
                      )}
                    </div>

                    {canManageActions && meeting.status !== 'cancelled' && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsAiActionsOpen(true)}
                          className="flex items-center gap-1.5 text-xs"
                          data-testid="mom-ai-action-btn"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                          Extract with AI
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setIsAddActionOpen(true)}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Action Item
                        </Button>
                      </div>
                    )}
                  </div>

                  {actionItems.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-sm">
                      <p>No action items assigned for this meeting.</p>
                      {canManageActions && meeting.status !== 'cancelled' && (
                        <p className="text-xs text-slate-400 mt-1">
                          Click "Add Action Item" to record deliverables, assignees, and deadlines.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {actionItems.map((item) => {
                        const isActionOverdue =
                          item.dueDate &&
                          new Date(item.dueDate + 'T23:59:59') < new Date() &&
                          item.status !== 'done' &&
                          item.status !== 'cancelled';
                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={item.status === 'done'}
                                disabled={!canManageActions || item.status === 'cancelled'}
                                onChange={() => handleUpdateActionStatus(item.id, item.status === 'done' ? 'open' : 'done')}
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                title={item.status === 'done' ? 'Mark open' : 'Mark done'}
                              />
                              <div className="min-w-0">
                                <p className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'} truncate`}>
                                  {item.title}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                                  {item.assigneeName && <span>Assignee: {item.assigneeName}</span>}
                                  {item.dueDate && (
                                    <span className={isActionOverdue ? 'text-red-600 font-medium' : ''}>
                                      Due: {item.dueDate}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                              {item.decisionTitle && (
                                <Badge variant="neutral" className="text-xs" title={`Linked Decision: ${item.decisionTitle}`}>
                                  Decision: {item.decisionTitle}
                                </Badge>
                              )}
                              {isActionOverdue && (
                                <Badge variant="danger" className="text-xs">
                                  Overdue
                                </Badge>
                              )}
                              <Badge variant={ACTION_ITEM_PRIORITY_VARIANTS[item.priority]} className="text-xs">
                                {ACTION_ITEM_PRIORITY_LABELS[item.priority]}
                              </Badge>
                              <Badge variant={ACTION_ITEM_STATUS_VARIANTS[item.status]} className="text-xs">
                                {ACTION_ITEM_STATUS_LABELS[item.status]}
                              </Badge>
                              {item.projectTaskId ? (
                                <Badge variant="success" className="text-xs" title="Promoted to Project Task">
                                  In Project: {item.projectTaskTitle || 'Task'}
                                </Badge>
                              ) : (
                                canManageActions && !isTerminal && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openPromoteDialog(item)}
                                    className="text-xs text-brand-600 hover:text-brand-700 h-6 px-1.5"
                                    title="Promote this action item to Projects"
                                  >
                                    Promote to Task
                                  </Button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Section 4: Additional Notes & Historical Minutes */}
              <Card className="shadow-xs">
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-brand-600" />
                        Additional Notes & Historical Minutes
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        General notes, miscellaneous information, and historical minutes preserved from prior recordings.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {canManageNotes && meeting.status !== 'cancelled' && (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => setIsAiSummaryOpen(true)}
                          className="flex items-center gap-1.5 text-xs text-brand-700 border-brand-300 hover:bg-brand-50"
                          data-testid="open-ai-notes-summary-section4-btn"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                          Summarize with AI
                        </Button>
                      )}
                      {notes && (
                        <div className="text-right text-xs text-slate-500">
                          <span>Author: <strong>{notes.authorName || notes.authorEmail || 'Organiser'}</strong></span>
                          {notes.updatedAt && (
                            <p className="text-slate-400">
                              Last updated: {new Date(notes.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {notesMessage && (
                    <Alert variant={notesMessage.type === 'success' ? 'success' : 'error'}>
                      {notesMessage.text}
                    </Alert>
                  )}

                  <form onSubmit={handleSaveNotes} className="space-y-4">
                    <div>
                      <textarea
                        value={notesContent}
                        onChange={(e) => setNotesContent(e.target.value)}
                        disabled={meeting.status === 'cancelled' || !canManageNotes || isSavingNotes}
                        rows={8}
                        maxLength={50000}
                        placeholder={
                          canManageNotes
                            ? "Record miscellaneous notes, executive summaries, or unstructured minutes..."
                            : "No additional notes recorded yet."
                        }
                        className="w-full font-mono text-sm rounded-md border border-slate-300 p-4 text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                      <div className="flex justify-between items-center text-xs text-slate-400 mt-1">
                        <span>Confidential note bodies are never exposed in audit logs or notification emails.</span>
                        <span>{notesContent.length} / 50,000 characters</span>
                      </div>
                    </div>

                    {canManageNotes && meeting.status !== 'cancelled' && (
                      <div className="flex justify-end gap-3 pt-2">
                        <Button
                          type="submit"
                          variant="primary"
                          disabled={isSavingNotes || !notesContent.trim()}
                          className="flex items-center gap-1.5"
                        >
                          <Save className="h-4 w-4" />
                          {isSavingNotes ? 'Saving...' : 'Save Additional Notes'}
                        </Button>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Tab 4: Action Items (MTG-006) */}
      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Track deliverables, owners, priorities, and completion dates.
            </p>

            {canManageActions && !isTerminal && actionItems.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAiActionsOpen(true)}
                  className="flex items-center gap-1.5"
                  data-testid="header-ai-action-btn"
                >
                  <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                  Extract with AI
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddActionOpen(true)}
                  className="flex items-center gap-1.5"
                  data-testid="header-add-action-btn"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Action Item
                </Button>
              </div>
            )}
          </div>

          {actionItems.length > 0 && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              data-testid="meeting-action-summary"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">
                  Actionable Completion Rate: {actionableMeetingRate}%
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600">
                  {actionableMeetingActions === 0 ? (
                    `All ${totalMeetingActions} item${totalMeetingActions === 1 ? '' : 's'} cancelled · No actionable items`
                  ) : (
                    <>
                      {doneMeetingActions} of {actionableMeetingActions} actionable item{actionableMeetingActions === 1 ? '' : 's'} completed
                      {cancelledMeetingActions > 0 && (
                        <span className="text-slate-400"> · {cancelledMeetingActions} cancelled</span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="text-slate-500">
                Total recorded: {totalMeetingActions}
              </div>
            </div>
          )}

          {actionItems.length === 0 ? (
            <Card className="border-dashed py-8 text-center">
              <CardContent className="space-y-2">
                <CheckSquare className="h-8 w-8 text-slate-400 mx-auto" />
                <CardTitle className="text-base">No Action Items Recorded</CardTitle>
                <CardDescription>
                  Capture post-meeting tasks, assign responsibilities to active team members, and track status.
                </CardDescription>
                {canManageActions && !isTerminal && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAiActionsOpen(true)}
                      className="flex items-center gap-1.5"
                      data-testid="empty-ai-action-btn"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                      Extract with AI
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setIsAddActionOpen(true)}
                      data-testid="empty-add-action-btn"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Action Item
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {actionItems.map((item) => {
                const isAssignee = item.assigneeId === user?.id;
                const canChangeStatus =
                  canManageActions ||
                  isAssignee ||
                  activeDetails?.membership?.permissions?.includes('meeting.action.update');
                const isItemTerminal = item.status === 'done' || item.status === 'cancelled';
                const isActionOverdue =
                  item.dueDate &&
                  new Date(item.dueDate.includes('T') ? item.dueDate : item.dueDate + 'T23:59:59').getTime() < Date.now() &&
                  item.status !== 'done' &&
                  item.status !== 'cancelled';

                return (
                  <Card key={item.id} className="p-4 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={ACTION_ITEM_STATUS_VARIANTS[item.status]}>
                            {ACTION_ITEM_STATUS_LABELS[item.status] || item.status}
                          </Badge>

                          <Badge variant={ACTION_ITEM_PRIORITY_VARIANTS[item.priority]}>
                            {ACTION_ITEM_PRIORITY_LABELS[item.priority] || item.priority}
                          </Badge>

                          {isActionOverdue && (
                            <Badge variant="danger" className="text-xs">
                              Overdue
                            </Badge>
                          )}

                          {item.decisionTitle && (
                            <Badge variant="brand" className="text-xs flex items-center gap-1" title={`Linked Decision: ${item.decisionTitle}`}>
                              <Sparkles className="h-3 w-3" />
                              Decision: {item.decisionTitle}
                            </Badge>
                          )}

                          {item.projectTaskId && (
                            <Badge variant="neutral" className="text-xs flex items-center gap-1" title="Promoted to Project Task">
                              <FolderKanban className="h-3 w-3" />
                              In Project: {item.projectTaskTitle || 'Task'}
                            </Badge>
                          )}

                          {item.dueDate && (
                            <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                              <Calendar className="h-3 w-3" />
                              Due: {item.dueDate}
                            </span>
                          )}

                          {item.agendaItemTitle && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <ListOrdered className="h-3 w-3" />
                              Agenda: {item.agendaItemTitle}
                            </span>
                          )}
                        </div>

                        <h4 className={`text-base font-medium ${item.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                          {item.title}
                        </h4>

                        {item.description && (
                          <p className="text-xs text-slate-600 whitespace-pre-line">
                            {item.description}
                          </p>
                        )}

                        <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
                          <span className="font-medium text-slate-700">Assignee:</span>
                          <span>{item.assigneeName || item.assigneeEmail || item.assigneeId}</span>
                        </div>
                      </div>

                      {/* Status transitions and actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0">
                        {canChangeStatus && !isItemTerminal && (
                          <>
                            {item.status === 'open' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdateActionStatus(item.id, 'in_progress')}
                                className="text-xs h-7 px-2"
                              >
                                Start
                              </Button>
                            )}

                            {(item.status === 'open' || item.status === 'in_progress') && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleUpdateActionStatus(item.id, 'done')}
                                className="text-xs h-7 px-2 bg-emerald-600 hover:bg-emerald-700"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Done
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUpdateActionStatus(item.id, 'cancelled')}
                              className="text-xs h-7 px-2 text-slate-400 hover:text-red-600"
                            >
                              Cancel
                            </Button>
                          </>
                        )}

                        {canManageActions && !isTerminal && !item.projectTaskId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPromoteDialog(item)}
                            className="text-xs h-7 px-2"
                            title="Promote to Project Task"
                          >
                            Promote to Task
                          </Button>
                        )}

                        {canManageActions && (
                          <button
                            onClick={() => handleDeleteActionItem(item.id)}
                            className="text-slate-400 hover:text-red-600 p-1 ml-1"
                            title="Delete Action Item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AI Agenda Draft Modal (Phase 02A) */}
      <AiAgendaDraftModal
        isOpen={isAiAgendaOpen}
        onClose={() => setIsAiAgendaOpen(false)}
        orgId={effectiveOrgId || ''}
        meetingId={meetingId || ''}
        onItemsSaved={fetchMeetingData}
      />

      {/* AI Meeting Notes Summary Modal (Phase 02B) */}
      <AiNotesSummaryModal
        isOpen={isAiSummaryOpen}
        onClose={() => setIsAiSummaryOpen(false)}
        orgId={effectiveOrgId || ''}
        meetingId={meetingId || ''}
        currentNotesContent={notesContent}
        currentNotesUpdatedAt={notes?.updatedAt}
        onNotesSaved={handleSaveNotesContent}
      />

      {/* AI Meeting Action Items Extraction Modal (Phase 02C) */}
      <AiActionItemsModal
        isOpen={isAiActionsOpen}
        onClose={() => setIsAiActionsOpen(false)}
        orgId={effectiveOrgId || ''}
        meetingId={meetingId || ''}
        attendees={attendees}
        orgMembers={orgMembers}
        onItemsSaved={fetchMeetingData}
      />

      {/* Add Agenda Item Dialog */}
      <Dialog
        isOpen={isAddAgendaOpen}
        onClose={() => setIsAddAgendaOpen(false)}
        title="Add Agenda Item"
        description="Add a discussion topic or presentation item to the structured agenda."
      >
        <form onSubmit={handleAddAgenda} className="space-y-4 pt-2">
          {agendaError && <Alert variant="error">{agendaError}</Alert>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Item Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={agendaTitle}
              onChange={(e) => setAgendaTitle(e.target.value)}
              placeholder="e.g. Architecture review & sign-off"
              required
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Estimated Duration (Minutes)
            </label>
            <Input
              type="number"
              min={1}
              max={480}
              value={agendaDuration}
              onChange={(e) =>
                setAgendaDuration(e.target.value ? Number(e.target.value) : '')
              }
              placeholder="e.g. 15"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description / Notes
            </label>
            <textarea
              value={agendaDescription}
              onChange={(e) => setAgendaDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Key points, speakers, or links..."
              maxLength={2000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddAgendaOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={agendaSubmitting}>
              {agendaSubmitting ? 'Adding...' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Attendee Dialog */}
      <Dialog
        isOpen={isAddAttendeeOpen}
        onClose={() => setIsAddAttendeeOpen(false)}
        title="Add Meeting Attendee"
        description="Invite an organisation member or external guest to this meeting."
      >
        <form onSubmit={handleAddAttendee} className="space-y-4 pt-2">
          {attendeeError && <Alert variant="error">{attendeeError}</Alert>}

          <div className="flex items-center gap-4 border-b border-slate-100 pb-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="attendeeType"
                checked={attendeeType === 'internal'}
                onChange={() => setAttendeeType('internal')}
                className="text-brand-600 focus:ring-brand-500"
              />
              Internal Member
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="radio"
                name="attendeeType"
                checked={attendeeType === 'external'}
                onChange={() => setAttendeeType('external')}
                className="text-brand-600 focus:ring-brand-500"
              />
              External Guest (Email)
            </label>
          </div>

          {attendeeType === 'internal' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Organisation Member <span className="text-red-500">*</span>
              </label>
              {availableMembers.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-500">
                  {orgMembers.length === 0
                    ? 'Loading members or no members available...'
                    : 'All organisation members are already attendees in this meeting.'}
                </div>
              ) : (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">-- Select Organisation Member --</option>
                  {availableMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName || 'Member'} ({m.email})
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Must be an active member of this organisation.
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Guest Email Address <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="guest@external-partner.com"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Role
            </label>
            <select
              value={attendeeRole}
              onChange={(e) => setAttendeeRole(e.target.value as AttendeeRole)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="participant">Participant</option>
              <option value="guest">Guest</option>
              <option value="organiser">Co-Organiser</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddAttendeeOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={attendeeSubmitting}>
              {attendeeSubmitting ? 'Adding...' : 'Add Attendee'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Action Item Dialog (MTG-006) */}
      <Dialog
        isOpen={isAddActionOpen}
        onClose={() => setIsAddActionOpen(false)}
        title="Add Action Item"
        description="Assign a clear post-meeting action item to an active organisation member."
      >
        <form onSubmit={handleAddActionItem} className="space-y-4 pt-2">
          {itemError && <Alert variant="error">{itemError}</Alert>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              placeholder="e.g. Prepare client onboarding roadmap"
              required
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Assignee <span className="text-red-500">*</span>
            </label>
            <select
              value={actionAssigneeId}
              onChange={(e) => setActionAssigneeId(e.target.value)}
              required
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">-- Select Assignee --</option>
              {attendees.filter((a) => a.userId).length > 0 && (
                <optgroup label="Meeting Attendees">
                  {attendees
                    .filter((a) => a.userId)
                    .map((a) => (
                      <option key={`att-${a.id}`} value={a.userId!}>
                        {a.fullName ? `${a.fullName} (${a.email || 'Attendee'})` : a.email || a.userId}
                      </option>
                    ))}
                </optgroup>
              )}
              {orgMembers.filter((m) => !attendees.some((a) => a.userId === m.userId)).length > 0 && (
                <optgroup label="Other Organisation Members">
                  {orgMembers
                    .filter((m) => !attendees.some((a) => a.userId === m.userId))
                    .map((m) => (
                      <option key={`org-${m.userId}`} value={m.userId}>
                        {m.fullName} ({m.email})
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Assign to a meeting attendee or active organisation member.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Priority
              </label>
              <select
                value={actionPriority}
                onChange={(e) => setActionPriority(e.target.value as ActionItemPriority)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due Date
              </label>
              <Input
                type="date"
                value={actionDueDate}
                onChange={(e) => setActionDueDate(e.target.value)}
              />
            </div>
          </div>

          {decisions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Linked Decision (Optional)
              </label>
              {lockedDecision ? (
                <div className="flex items-center justify-between p-2 rounded border border-brand-200 bg-brand-50/50 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="brand" className="text-xs">Decision</Badge>
                    <span className="font-medium text-slate-800 truncate">{lockedDecision.title}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLockedDecision(null);
                      setActionDecisionId('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 h-6 px-1.5"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <select
                  value={actionDecisionId}
                  onChange={(e) => setActionDecisionId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">-- None (Standalone Action Item) --</option>
                  {decisions.map((dec, idx) => (
                    <option key={dec.id} value={dec.id}>
                      Decision #{idx + 1}: {dec.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {agendaItems.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Linked Agenda Topic (Optional)
              </label>
              <select
                value={actionAgendaItemId}
                onChange={(e) => setActionAgendaItemId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">-- None --</option>
                {agendaItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.orderIndex + 1}. {item.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description / Notes
            </label>
            <textarea
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Context, requirements, deliverables..."
              maxLength={2000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddActionOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionSubmitting}>
              {actionSubmitting ? 'Creating...' : 'Create Action Item'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Discussion Point Dialog */}
      <Dialog
        isOpen={isAddDiscussionOpen}
        onClose={() => setIsAddDiscussionOpen(false)}
        title="Add Discussion Point"
        description="Record a key topic or debate discussed during the meeting."
      >
        <form onSubmit={handleAddDiscussionPoint} className="space-y-4 pt-2">
          {discussionError && <Alert variant="error">{discussionError}</Alert>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={discussionTitle}
              onChange={(e) => setDiscussionTitle(e.target.value)}
              placeholder="e.g. Hackathon scoring & evaluation criteria"
              required
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes / Body (Optional)
            </label>
            <textarea
              value={discussionBody}
              onChange={(e) => setDiscussionBody(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Key viewpoints, concerns, arguments, or observations..."
              maxLength={50000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddDiscussionOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={discussionSubmitting}>
              {discussionSubmitting ? 'Adding...' : 'Add Discussion Point'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Discussion Point Dialog */}
      {editingDiscussionPoint && (
        <Dialog
          isOpen={true}
          onClose={() => setEditingDiscussionPoint(null)}
          title="Edit Discussion Point"
          description="Update discussion point title and content."
        >
          <form onSubmit={handleEditDiscussionPoint} className="space-y-4 pt-2">
            {editDiscussionError && <Alert variant="error">{editDiscussionError}</Alert>}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                value={editDiscussionTitle}
                onChange={(e) => setEditDiscussionTitle(e.target.value)}
                required
                maxLength={255}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Notes / Body
              </label>
              <textarea
                value={editDiscussionBody}
                onChange={(e) => setEditDiscussionBody(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                maxLength={50000}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingDiscussionPoint(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editDiscussionSubmitting}>
                {editDiscussionSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Add Decision Dialog */}
      <Dialog
        isOpen={isAddDecisionOpen}
        onClose={() => setIsAddDecisionOpen(false)}
        title="Add Decision"
        description="Record an agreed resolution, consensus, or ratified decision."
      >
        <form onSubmit={handleAddDecision} className="space-y-4 pt-2">
          {decisionError && <Alert variant="error">{decisionError}</Alert>}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Decision / Summary <span className="text-red-500">*</span>
            </label>
            <Input
              value={decisionTitle}
              onChange={(e) => setDecisionTitle(e.target.value)}
              placeholder="e.g. Approved criteria weighting for final round judging"
              required
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Details (Optional)
            </label>
            <textarea
              value={decisionDetails}
              onChange={(e) => setDecisionDetails(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Context, effective date, or scope of decision..."
              maxLength={50000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddDecisionOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={decisionSubmitting}>
              {decisionSubmitting ? 'Adding...' : 'Add Decision'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Decision Dialog */}
      {editingDecision && (
        <Dialog
          isOpen={true}
          onClose={() => setEditingDecision(null)}
          title="Edit Decision"
          description="Update decision summary and details."
        >
          <form onSubmit={handleEditDecision} className="space-y-4 pt-2">
            {editDecisionError && <Alert variant="error">{editDecisionError}</Alert>}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Decision / Summary <span className="text-red-500">*</span>
              </label>
              <Input
                value={editDecisionTitle}
                onChange={(e) => setEditDecisionTitle(e.target.value)}
                required
                maxLength={255}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Details
              </label>
              <textarea
                value={editDecisionDetails}
                onChange={(e) => setEditDecisionDetails(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                maxLength={50000}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingDecision(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={editDecisionSubmitting}>
                {editDecisionSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Accessible Confirmation Dialog */}
      {confirmState && (
        <ConfirmDialog
          isOpen={confirmState.isOpen}
          onClose={() => setConfirmState(null)}
          onConfirm={confirmState.onConfirm}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel || 'Confirm'}
          cancelLabel={confirmState.cancelLabel || 'Cancel'}
          variant={confirmState.variant || 'primary'}
          isLoading={confirmState.isLoading || false}
        />
      )}

      {/* Edit Meeting Dialog */}
      {meeting && effectiveOrgId && (
        <EditMeetingDialog
          isOpen={isEditMeetingOpen}
          onClose={() => setIsEditMeetingOpen(false)}
          orgId={effectiveOrgId}
          meeting={meeting}
          onMeetingUpdated={(updated) => setMeeting(updated)}
        />
      )}

      {/* Promote to Project Task Dialog */}
      {promotingItem && (
        <Dialog
          isOpen={true}
          onClose={() => setPromotingItem(null)}
          title="Promote Action Item to Project Task"
          description={`Convert "${promotingItem.title}" into a formal task tracked inside a project.`}
        >
          <div className="space-y-4 pt-2">
            {promoteError && <Alert variant="error">{promoteError}</Alert>}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Select Target Project <span className="text-red-500">*</span>
              </label>
              {isLoadingProjects ? (
                <div className="h-9 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
              ) : projects.length === 0 ? (
                <p className="text-sm text-slate-500 py-2">
                  No active projects available in this organisation.
                </p>
              ) : (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  required
                >
                  <option value="">-- Choose a Project --</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200 space-y-1">
              <p className="font-medium text-slate-700">Conversion Policy:</p>
              <p>
                A new project task will be created with the same title, description, priority, and due date.
                The action item will remain permanently linked to the resulting project task.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPromotingItem(null)}
                disabled={isPromoting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmPromote}
                disabled={isPromoting || !selectedProjectId}
              >
                {isPromoting ? 'Promoting...' : 'Confirm Promotion'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Accessible Auto-Dismissing Toast Notifications */}
      <ToastContainer>
        {toast && (
          <Toast
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
}

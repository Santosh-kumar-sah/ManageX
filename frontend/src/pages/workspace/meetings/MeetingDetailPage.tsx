import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Dialog } from '@/components/ui/Dialog';
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
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import { useAuth } from '@/api/AuthContext';
import {
  MeetingItem,
  MeetingAttendee,
  MeetingAgendaItem,
  MeetingNotes,
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
} from '@/types/meetings';

export function MeetingDetailPage() {
  const { orgId, meetingId } = useParams<{ orgId: string; meetingId: string }>();
  const { activeOrg, activeDetails } = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [meeting, setMeeting] = useState<MeetingItem | null>(null);
  const [attendees, setAttendees] = useState<MeetingAttendee[]>([]);
  const [agendaItems, setAgendaItems] = useState<MeetingAgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'agenda' | 'attendees' | 'minutes' | 'actions'>('agenda');

  // Dialog states
  const [isAddAgendaOpen, setIsAddAgendaOpen] = useState(false);
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
  const [notes, setNotes] = useState<MeetingNotes | null>(null);
  const [notesContent, setNotesContent] = useState('');
  const [notesForbidden, setNotesForbidden] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Action items states (MTG-006)
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [isAddActionOpen, setIsAddActionOpen] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionAssigneeId, setActionAssigneeId] = useState('');
  const [actionDueDate, setActionDueDate] = useState('');
  const [actionPriority, setActionPriority] = useState<ActionItemPriority>('medium');
  const [actionAgendaItemId, setActionAgendaItemId] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  // Email invitation state (MTG-007)
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [inviteStatusMessage, setInviteStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isTerminal = meeting?.status === 'completed' || meeting?.status === 'cancelled';

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
        apiClient<{ agenda: MeetingAgendaItem[] }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda`
        ),
      ]);

      if (meetingRes.data?.meeting) {
        setMeeting(meetingRes.data.meeting);
      }
      setAttendees(attendeesRes.data?.attendees || []);
      setAgendaItems(agendaRes.data?.agenda || []);

      // Fetch confidential notes safely (MTG-005)
      try {
        const notesRes = await apiClient<{ notes: MeetingNotes | null }>(
          `/organisations/${effectiveOrgId}/meetings/${meetingId}/notes`
        );
        if (notesRes.data?.notes) {
          setNotes(notesRes.data.notes);
          setNotesContent(notesRes.data.notes.content);
        } else {
          setNotes(null);
          setNotesContent('');
        }
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
    fetchMeetingData();
  }, [fetchMeetingData]);

  // Current user's attendee record
  const currentAttendee = attendees.find((a) => a.userId === user?.id);

  // Status transition handler
  const handleTransition = async (newStatus: string) => {
    if (!effectiveOrgId || !meetingId) return;

    const confirmMessage =
      newStatus === 'cancelled'
        ? 'Are you sure you want to cancel this meeting? This is a terminal action.'
        : newStatus === 'completed'
        ? 'Are you sure you want to complete this meeting? It cannot be edited after completion.'
        : `Change status to ${newStatus}?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      setIsTransitioning(true);
      setActionError(null);

      const res = await apiClient<{ meeting: MeetingItem }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/status`,
        {
          method: 'PATCH',
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
    }
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
          method: 'PATCH',
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
  const handleDeleteAgenda = async (itemId: string) => {
    if (!effectiveOrgId || !meetingId) return;
    if (!window.confirm('Delete this agenda item?')) return;

    try {
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda/${itemId}`,
        { method: 'DELETE' }
      );

      setAgendaItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert('Failed to delete agenda item.');
      }
    }
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

      const res = await apiClient<{ agenda: MeetingAgendaItem[] }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/agenda/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ items: reorderedPayload }),
        }
      );

      setAgendaItems(res.data?.agenda || []);
    } catch (err) {
      // Revert on error
      fetchMeetingData();
      if (err instanceof ApiError) {
        alert(err.message);
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
  const handleRemoveAttendee = async (attendeeId: string) => {
    if (!effectiveOrgId || !meetingId) return;
    if (!window.confirm('Remove this attendee from the meeting?')) return;

    try {
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/attendees/${attendeeId}`,
        { method: 'DELETE' }
      );

      setAttendees((prev) => prev.filter((a) => a.id !== attendeeId));
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert('Failed to remove attendee.');
      }
    }
  };

  // Save Confidential Minutes (MTG-005)
  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOrgId || !meetingId || !notesContent.trim()) return;

    try {
      setIsSavingNotes(true);
      setNotesMessage(null);

      const res = await apiClient<{ notes: MeetingNotes }>(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/notes`,
        {
          method: 'PUT',
          body: JSON.stringify({ content: notesContent.trim() }),
        }
      );

      if (res.data?.notes) {
        setNotes(res.data.notes);
        setNotesContent(res.data.notes.content);
        setNotesMessage({ type: 'success', text: 'Confidential minutes saved successfully.' });
      }
    } catch (err) {
      setNotesMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to save confidential minutes.',
      });
    } finally {
      setIsSavingNotes(false);
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
      alert(err instanceof ApiError ? err.message : 'Failed to update action item status.');
    }
  };

  // Delete Action Item (MTG-006)
  const handleDeleteActionItem = async (itemId: string) => {
    if (!effectiveOrgId || !meetingId) return;
    if (!window.confirm('Are you sure you want to delete this action item?')) return;

    try {
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${meetingId}/action-items/${itemId}`,
        { method: 'DELETE' }
      );
      setActionItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete action item.');
    }
  };

  // Send Email Invitations (MTG-007)
  const handleSendInvitations = async () => {
    if (!effectiveOrgId || !meetingId) return;
    if (!window.confirm('Send email invitations to pending attendees?')) return;

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

      {/* Meeting Header Card */}
      <Card className="shadow-xs">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={MEETING_STATUS_VARIANTS[meeting.status]}>
                  {MEETING_STATUS_LABELS[meeting.status] || meeting.status}
                </Badge>

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
                  {meeting.timezone}
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

            {/* Lifecycle Status Transitions */}
            {canManageStatus && !isTerminal && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {allowedTransitions.includes('in_progress') && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isTransitioning}
                    onClick={() => handleTransition('in_progress')}
                    className="flex items-center gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Start Meeting
                  </Button>
                )}

                {allowedTransitions.includes('completed') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isTransitioning}
                    onClick={() => handleTransition('completed')}
                    className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Complete
                  </Button>
                )}

                {allowedTransitions.includes('cancelled') && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isTransitioning}
                    onClick={() => handleTransition('cancelled')}
                    className="flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
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
              </div>
            )}
          </div>

          {inviteStatusMessage && (
            <Alert variant={inviteStatusMessage.type === 'success' ? 'success' : 'error'}>
              {inviteStatusMessage.text}
            </Alert>
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
                    <a
                      href={meeting.virtualUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-0.5 font-medium"
                    >
                      Join Virtual Meeting
                      <ExternalLink className="h-3 w-3" />
                    </a>
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

          {/* Current User RSVP Card (if user is an attendee) */}
          {currentAttendee && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                  disabled={isRsvping}
                  onClick={() => handleRsvp('accepted')}
                  className="flex items-center gap-1 text-xs"
                >
                  <Check className="h-3.5 w-3.5" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant={currentAttendee.rsvpStatus === 'tentative' ? 'secondary' : 'outline'}
                  disabled={isRsvping}
                  onClick={() => handleRsvp('tentative')}
                  className="flex items-center gap-1 text-xs"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Tentative
                </Button>
                <Button
                  size="sm"
                  variant={currentAttendee.rsvpStatus === 'declined' ? 'destructive' : 'outline'}
                  disabled={isRsvping}
                  onClick={() => handleRsvp('declined')}
                  className="flex items-center gap-1 text-xs"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddAgendaOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Agenda Item
              </Button>
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
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-500">
              {attendees.filter((a) => a.rsvpStatus === 'accepted').length} accepted,{' '}
              {attendees.filter((a) => a.rsvpStatus === 'pending').length} pending
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
                  {attendees.map((attendee) => {
                    const isSoleOrganiser =
                      attendee.role === 'organiser' &&
                      attendee.userId === meeting.organiserId;

                    return (
                      <tr key={attendee.id} className="hover:bg-slate-50/50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {attendee.fullName || attendee.externalEmail || 'Member'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {attendee.email || attendee.externalEmail}
                            {attendee.externalEmail && !attendee.userId && (
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
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Confidential Minutes & Notes (MTG-005) */}
      {activeTab === 'minutes' && (
        <div className="space-y-4">
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
            <Card className="shadow-xs">
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-brand-600" />
                      Confidential Meeting Minutes
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Private discussion records, board notes, and decisions. Access is restricted.
                    </p>
                  </div>

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

                {notesMessage && (
                  <Alert variant={notesMessage.type === 'success' ? 'success' : 'error'}>
                    {notesMessage.text}
                  </Alert>
                )}

                {meeting.status === 'cancelled' && (
                  <Alert variant="warning">
                    This meeting is cancelled. Minutes are archived and cannot be edited.
                  </Alert>
                )}

                <form onSubmit={handleSaveNotes} className="space-y-4">
                  <div>
                    <textarea
                      value={notesContent}
                      onChange={(e) => setNotesContent(e.target.value)}
                      disabled={meeting.status === 'cancelled' || !canManageNotes || isSavingNotes}
                      rows={12}
                      maxLength={50000}
                      placeholder={
                        canManageNotes
                          ? "Record key discussion points, decisions made, vote outcomes, and executive notes here..."
                          : "No minutes recorded yet."
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
                        {isSavingNotes ? 'Saving...' : 'Save Minutes'}
                      </Button>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
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

            {canManageActions && meeting.status !== 'cancelled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddActionOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Action Item
              </Button>
            )}
          </div>

          {actionItems.length === 0 ? (
            <Card className="border-dashed py-8 text-center">
              <CardContent className="space-y-2">
                <CheckSquare className="h-8 w-8 text-slate-400 mx-auto" />
                <CardTitle className="text-base">No Action Items Recorded</CardTitle>
                <CardDescription>
                  Capture post-meeting tasks, assign responsibilities to active team members, and track status.
                </CardDescription>
                {canManageActions && meeting.status !== 'cancelled' && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsAddActionOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create First Action Item
                  </Button>
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
                Member User ID <span className="text-red-500">*</span>
              </label>
              <Input
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                placeholder="UUID of active organisation member"
                required
              />
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
            {attendees.filter((a) => a.userId).length > 0 ? (
              <select
                value={actionAssigneeId}
                onChange={(e) => setActionAssigneeId(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">-- Select Member Attendee --</option>
                {attendees
                  .filter((a) => a.userId)
                  .map((a) => (
                    <option key={a.id} value={a.userId!}>
                      {a.fullName ? `${a.fullName} (${a.email || 'Member'})` : a.email || a.userId}
                    </option>
                  ))}
              </select>
            ) : (
              <Input
                value={actionAssigneeId}
                onChange={(e) => setActionAssigneeId(e.target.value)}
                placeholder="Active Member User UUID"
                required
              />
            )}
            <p className="text-xs text-slate-400 mt-1">
              Must be an active member of this organisation.
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
    </div>
  );
}

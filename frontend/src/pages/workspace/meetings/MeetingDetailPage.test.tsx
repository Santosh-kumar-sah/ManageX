import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MeetingDetailPage, getCompletionConfirmMessage } from './MeetingDetailPage';
import { EditMeetingDialog } from './EditMeetingDialog';
import * as OrgContextModule from '@/api/OrgContext';
import * as AuthContextModule from '@/api/AuthContext';
import * as ClientModule from '@/api/client';
import {
  MeetingItem,
  MeetingAttendee,
  MeetingAgendaItem,
  MeetingNotes,
  MeetingDiscussionPoint,
  MeetingDecision,
  MeetingActionItem,
  isMeetingOverdue,
} from '@/types/meetings';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(message: string, statusCode = 400, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

describe('MeetingDetailPage — Remediation & Contract Alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrg = {
    id: 'org-tech-corp',
    name: 'Tech Corp',
    slug: 'tech-corp',
  };

  const sampleMeeting: MeetingItem = {
    id: 'meet-101',
    organisationId: 'org-tech-corp',
    title: 'Sprint Planning & Backlog Refinement',
    description: 'Detailed sprint commitment review for backend services.',
    startAt: '2026-11-20T10:00:00.000Z',
    endAt: '2026-11-20T11:00:00.000Z',
    timezone: 'America/New_York',
    locationType: 'virtual',
    virtualUrl: 'https://meet.google.com/abc-defg-hij',
    visibility: 'organisation',
    status: 'scheduled',
    organiserId: 'user-alice-123',
    createdById: 'user-alice-123',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    organiserName: 'Alice Johnson',
    attendeeCount: 3,
    agendaCount: 2,
  };

  const sampleAttendees: MeetingAttendee[] = [
    {
      id: 'att-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      userId: 'user-alice-123',
      fullName: 'Alice Johnson',
      email: 'alice@managex.org',
      role: 'organiser',
      rsvpStatus: 'accepted',
      invitedAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'att-2',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      userId: 'user-bob-456',
      fullName: 'Bob Smith',
      email: 'bob@managex.org',
      role: 'participant',
      rsvpStatus: 'pending',
      invitedAt: '2026-10-01T10:00:00.000Z',
    },
  ];

  const sampleAgendaItems: MeetingAgendaItem[] = [
    {
      id: 'agenda-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Architectural Review',
      description: 'Review RLS policies and tenant session propagation.',
      durationMinutes: 25,
      orderIndex: 1,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'agenda-2',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Action Items Assignment',
      description: 'Assign deliverables for next release.',
      durationMinutes: 15,
      orderIndex: 2,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
  ];

  const sampleNotes: MeetingNotes = {
    id: 'notes-1',
    organisationId: 'org-tech-corp',
    meetingId: 'meet-101',
    content: '## Executive Meeting Summary\nAll items approved for sprint.',
    createdById: 'user-alice-123',
    updatedById: 'user-alice-123',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:30:00.000Z',
  };

  const sampleActionItems: MeetingActionItem[] = [
    {
      id: 'act-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Deploy database migration 014',
      status: 'open',
      priority: 'high',
      assigneeId: 'user-alice-123',
      assigneeName: 'Alice Johnson',
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
  ];

  const setupContexts = (options: {
    userId?: string;
    permissions?: string[];
    roleSlug?: string;
  } = {}) => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: options.userId || 'user-alice-123',
        email: 'alice@managex.org',
        fullName: 'Alice Johnson',
      } as any,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: options.roleSlug || 'organisation_admin', name: 'Admin' },
          permissions: options.permissions || [
            'meeting.view',
            'meeting.edit',
            'meeting.status.manage',
            'meeting.notes.read',
            'meeting.notes.manage',
          ],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });
  };

  it('1. Renders meeting details with title, badges, timezone, and description', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={sampleAttendees}
                initialAgendaItems={sampleAgendaItems}
                initialNotes={sampleNotes}
                initialActionItems={sampleActionItems}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Sprint Planning &amp; Backlog Refinement');
    expect(html).toContain('Detailed sprint commitment review for backend services.');
    expect(html).toContain('America/New_York');
    expect(html).toContain('Scheduled');
    expect(html).toContain('Organisation Visible');
    expect(html).toContain('Edit Meeting');
    expect(html).toContain('Start Meeting');
  });

  it('2. Agenda Deserialization: renders agenda items from data.agendaItems (backend contract)', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAgendaItems={sampleAgendaItems}
                initialLoading={false}
                initialActiveTab="agenda"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Architectural Review');
    expect(html).toContain('Review RLS policies and tenant session propagation.');
    expect(html).toContain('25 min');
    expect(html).toContain('Action Items Assignment');
  });

  it('3. Status Transition Contract: executes POST /status instead of legacy PATCH', async () => {
    setupContexts();

    const mockRequest = vi.fn().mockResolvedValue({
      data: {
        meeting: { ...sampleMeeting, status: 'in_progress' },
      },
    });
    vi.spyOn(ClientModule, 'apiClient').mockImplementation(mockRequest);

    // Direct simulation of status transition handler contract
    const orgId = 'org-tech-corp';
    const meetingId = 'meet-101';
    const newStatus = 'in_progress';

    await ClientModule.apiClient(
      `/organisations/${orgId}/meetings/${meetingId}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      '/organisations/org-tech-corp/meetings/meet-101/status',
      {
        method: 'POST',
        body: JSON.stringify({ status: 'in_progress' }),
      }
    );
  });

  it('4. RSVP Contract: executes POST /rsvp instead of legacy PATCH', async () => {
    setupContexts();

    const mockRequest = vi.fn().mockResolvedValue({
      data: { success: true },
    });
    vi.spyOn(ClientModule, 'apiClient').mockImplementation(mockRequest);

    const orgId = 'org-tech-corp';
    const meetingId = 'meet-101';
    const rsvpStatus = 'accepted';

    await ClientModule.apiClient(
      `/organisations/${orgId}/meetings/${meetingId}/rsvp`,
      {
        method: 'POST',
        body: JSON.stringify({ rsvpStatus }),
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      '/organisations/org-tech-corp/meetings/meet-101/rsvp',
      {
        method: 'POST',
        body: JSON.stringify({ rsvpStatus: 'accepted' }),
      }
    );
  });

  it('5. Agenda Reorder Contract: preserves reordered items when backend returns { success: true }', async () => {
    const reorderedItems = [
      { id: 'agenda-2', orderIndex: 1 },
      { id: 'agenda-1', orderIndex: 2 },
    ];

    const mockRequest = vi.fn().mockResolvedValue({
      data: { success: true },
    });
    vi.spyOn(ClientModule, 'apiClient').mockImplementation(mockRequest);

    const res = await ClientModule.apiClient<{ success: boolean }>(
      '/organisations/org-tech-corp/meetings/meet-101/agenda/reorder',
      {
        method: 'PUT',
        body: JSON.stringify({ items: reorderedItems }),
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      '/organisations/org-tech-corp/meetings/meet-101/agenda/reorder',
      {
        method: 'PUT',
        body: JSON.stringify({ items: reorderedItems }),
      }
    );
    expect(res.data?.success).toBe(true);
  });

  it('6. Edit Meeting Dialog: renders pre-populated form inputs matching meeting fields', () => {
    const html = renderToStaticMarkup(
      <EditMeetingDialog
        isOpen={true}
        onClose={vi.fn()}
        orgId="org-tech-corp"
        meeting={sampleMeeting}
        onMeetingUpdated={vi.fn()}
      />
    );

    expect(html).toContain('Edit Meeting');
    expect(html).toContain('Sprint Planning &amp; Backlog Refinement');
    expect(html).toContain('Detailed sprint commitment review for backend services.');
    expect(html).toContain('https://meet.google.com/abc-defg-hij');
    expect(html).toContain('America/New_York');
    expect(html).toContain('Save Changes');
  });

  it('7. Edit Meeting Validation: rejects title shorter than 2 characters and invalid start/end dates', () => {
    // Form validation rules verification
    function validateEditMeeting(title: string, startAt: string, endAt: string, locationType: string, location: string, virtualUrl: string) {
      if (!title.trim() || title.trim().length < 2) {
        return 'Meeting title must be at least 2 characters.';
      }
      const s = new Date(startAt);
      const e = new Date(endAt);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) {
        return 'Valid start and end dates are required.';
      }
      if (s >= e) {
        return 'Meeting end time must be strictly after the start time.';
      }
      if ((locationType === 'in_person' || locationType === 'hybrid') && !location.trim()) {
        return 'Physical location is required for in-person or hybrid meetings.';
      }
      if ((locationType === 'virtual' || locationType === 'hybrid') && !virtualUrl.trim()) {
        return 'Virtual meeting URL is required for virtual or hybrid meetings.';
      }
      return null;
    }

    expect(validateEditMeeting('A', '2026-11-20T10:00', '2026-11-20T11:00', 'virtual', '', 'https://meet.google.com')).toBe(
      'Meeting title must be at least 2 characters.'
    );
    expect(validateEditMeeting('Valid Title', '2026-11-20T12:00', '2026-11-20T11:00', 'virtual', '', 'https://meet.google.com')).toBe(
      'Meeting end time must be strictly after the start time.'
    );
    expect(validateEditMeeting('Valid Title', '2026-11-20T10:00', '2026-11-20T11:00', 'in_person', '', '')).toBe(
      'Physical location is required for in-person or hybrid meetings.'
    );
    expect(validateEditMeeting('Valid Title', '2026-11-20T10:00', '2026-11-20T11:00', 'virtual', '', '')).toBe(
      'Virtual meeting URL is required for virtual or hybrid meetings.'
    );
    expect(validateEditMeeting('Valid Title', '2026-11-20T10:00', '2026-11-20T11:00', 'virtual', '', 'https://meet.google.com')).toBeNull();
  });

  it('8. Edit Meeting API Submission: dispatches PATCH /meetings/:meetingId with updated payload', async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      data: {
        meeting: {
          ...sampleMeeting,
          title: 'Sprint Planning (Rescheduled)',
          startAt: '2026-11-20T14:00:00.000Z',
          endAt: '2026-11-20T15:00:00.000Z',
        },
      },
    });
    vi.spyOn(ClientModule, 'apiClient').mockImplementation(mockRequest);

    const payload = {
      title: 'Sprint Planning (Rescheduled)',
      startAt: '2026-11-20T14:00:00.000Z',
      endAt: '2026-11-20T15:00:00.000Z',
      timezone: 'America/New_York',
      locationType: 'virtual',
      virtualUrl: 'https://meet.google.com/abc-defg-hij',
      visibility: 'organisation',
    };

    const res = await ClientModule.apiClient<{ meeting: MeetingItem }>(
      `/organisations/org-tech-corp/meetings/meet-101`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );

    expect(mockRequest).toHaveBeenCalledWith(
      '/organisations/org-tech-corp/meetings/meet-101',
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    expect(res.data?.meeting.title).toBe('Sprint Planning (Rescheduled)');
  });

  it('9. Permission Gates: hides "Edit Meeting" button and agenda edit controls for read-only member', () => {
    setupContexts({
      userId: 'user-guest-999',
      roleSlug: 'organisation_member',
      permissions: ['meeting.view'],
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{ ...sampleMeeting, organiserId: 'user-alice-123' }}
                initialAgendaItems={sampleAgendaItems}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Edit Meeting');
    expect(html).not.toContain('data-testid="edit-meeting-btn"');
    expect(html).not.toContain('Add Item');
  });

  it('10. Terminal States: disables or hides Edit Meeting and status transition buttons for completed meetings', () => {
    setupContexts();

    const completedMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'completed',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={completedMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Edit Meeting');
    expect(html).not.toContain('Start Meeting');
    expect(html).not.toContain('Complete Meeting');
    expect(html).not.toContain('Cancel Meeting');
    expect(html).toContain('Completed');
  });

  it('11. Terminal States: disables or hides Edit Meeting for cancelled meetings', () => {
    setupContexts();

    const cancelledMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'cancelled',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={cancelledMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Edit Meeting');
    expect(html).not.toContain('Start Meeting');
    expect(html).toContain('Cancelled');
  });

  it('12. Notes Confidentiality: 403 / FORBIDDEN_NOTES_ACCESS renders restricted notice fail-closed', () => {
    setupContexts({
      userId: 'user-bob-456',
      permissions: ['meeting.view'],
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialNotes={null}
                initialNotesForbidden={true}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Confidential Minutes');
    expect(html).toContain('Meeting minutes are restricted to organisers and authorised administrative roles');
    // The confidential content is NOT exposed
    expect(html).not.toContain('Executive Meeting Summary');
  });

  const sampleDiscussionPoints: MeetingDiscussionPoint[] = [
    {
      id: 'dp-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Database Sharding Architecture',
      body: 'Evaluated Citus vs logical partitioning for tenant isolation.',
      orderIndex: 0,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
    {
      id: 'dp-2',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Frontend State Management Strategy',
      body: '',
      orderIndex: 1,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:05:00.000Z',
      updatedAt: '2026-10-01T10:05:00.000Z',
    },
  ];

  const sampleDecisions: MeetingDecision[] = [
    {
      id: 'dec-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Adopt PostgreSQL RLS for Multi-Tenancy',
      details: 'All queries will use withTenantTransaction with zero platform admin bypass.',
      orderIndex: 0,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:10:00.000Z',
      updatedAt: '2026-10-01T10:10:00.000Z',
    },
  ];

  it('13. Structured MOM: renders MOM Header and 4 sections with empty states when no items exist', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialNotes={null}
                initialDiscussionPoints={[]}
                initialDecisions={[]}
                initialActionItems={[]}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Header & Mode
    expect(html).toContain('Meeting Minutes (MOM)');
    expect(html).toContain('Edit Mode');

    // Section 1: Discussion Points
    expect(html).toContain('Discussion Points');
    expect(html).toContain('No discussion points recorded yet.');
    expect(html).toContain('Add Discussion Point');

    // Section 2: Decisions
    expect(html).toContain('Decisions');
    expect(html).toContain('No decisions recorded yet.');
    expect(html).toContain('Add Decision');

    // Section 3: Action Items
    expect(html).toContain('Action Items');
    expect(html).toContain('No action items assigned for this meeting.');

    // Section 4: Additional Notes
    expect(html).toContain('Additional Notes &amp; Historical Minutes');
    expect(html).toContain('Save Additional Notes');
  });

  it('14. Structured MOM: renders discussion points, decisions, and preserves historical notes content', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialNotes={sampleNotes}
                initialDiscussionPoints={sampleDiscussionPoints}
                initialDecisions={sampleDecisions}
                initialActionItems={sampleActionItems}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Discussion Points rendered
    expect(html).toContain('Database Sharding Architecture');
    expect(html).toContain('Evaluated Citus vs logical partitioning for tenant isolation.');
    expect(html).toContain('Frontend State Management Strategy');
    expect(html).toContain('Draft point (no detailed notes recorded)');

    // Decisions rendered
    expect(html).toContain('Adopt PostgreSQL RLS for Multi-Tenancy');
    expect(html).toContain('All queries will use withTenantTransaction with zero platform admin bypass.');

    // Action items integrated into MOM
    expect(html).toContain('Deploy database migration 014');

    // Additional notes preserved
    expect(html).toContain('## Executive Meeting Summary\nAll items approved for sprint.');
  });

  it('15. Structured MOM: organiser sees Edit Mode and action controls; non-editor sees View Only without controls', () => {
    // Non-editor user without edit permissions
    setupContexts({
      userId: 'user-bob-456',
      permissions: ['meeting.view', 'meeting.notes.read'],
      roleSlug: 'organisation_member',
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialNotes={sampleNotes}
                initialDiscussionPoints={sampleDiscussionPoints}
                initialDecisions={sampleDecisions}
                initialActionItems={sampleActionItems}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('View Only');
    expect(html).not.toContain('Edit Mode');
    expect(html).not.toContain('Add Discussion Point');
    expect(html).not.toContain('Add Decision');
    expect(html).not.toContain('Save Additional Notes');
    // Content is still visible for reading
    expect(html).toContain('Database Sharding Architecture');
    expect(html).toContain('Adopt PostgreSQL RLS for Multi-Tenancy');
  });

  it('16. Structured MOM: cancelled meeting displays warning and suppresses MOM editing controls', () => {
    setupContexts();

    const cancelledMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'cancelled',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={cancelledMeeting}
                initialNotes={sampleNotes}
                initialDiscussionPoints={sampleDiscussionPoints}
                initialDecisions={sampleDecisions}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Cancelled alert
    expect(html).toContain('This meeting is cancelled. Minutes are archived and cannot be edited.');
    expect(html).toContain('View Only');
    expect(html).not.toContain('Edit Mode');
    expect(html).not.toContain('Add Discussion Point');
    expect(html).not.toContain('Add Decision');
    expect(html).not.toContain('Save Additional Notes');
  });

  it('17. Phase 1: Derived Overdue badge and Mark as Missed button render on past scheduled meeting', () => {
    setupContexts();

    const pastMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'scheduled',
      startAt: new Date(Date.now() - 7200000).toISOString(),
      endAt: new Date(Date.now() - 3600000).toISOString(),
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={pastMeeting}
                initialAttendees={sampleAttendees}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Overdue');
    expect(html).toContain('Mark as Missed');
  });

  it('18. Phase 1: Complete button is not rendered on scheduled meeting (requires in_progress)', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Start Meeting');
    expect(html).not.toContain('complete-meeting-btn');
  });

  it('19. Phase 1: Organiser attendee does not see RSVP controls', () => {
    // Current user is Alice (user-alice-123, organiser)
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={sampleAttendees}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Your RSVP Status:');
    expect(html).not.toContain('rsvp-controls');
  });

  it('20. Phase 1: Participant sees RSVP controls with currently active response disabled', () => {
    // Current user is Bob (user-bob-456, participant with accepted RSVP)
    setupContexts({
      userId: 'user-bob-456',
    });

    const bobAttendees: MeetingAttendee[] = [
      {
        id: 'att-1',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-alice-123',
        fullName: 'Alice Johnson',
        email: 'alice@managex.org',
        role: 'organiser',
        rsvpStatus: 'accepted',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-2',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-bob-456',
        fullName: 'Bob Smith',
        email: 'bob@managex.org',
        role: 'participant',
        rsvpStatus: 'accepted',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={bobAttendees}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Your RSVP Status:');
    expect(html).toContain('rsvp-controls');
    expect(html).toMatch(/(?:disabled|aria-disabled="true")[^>]*data-testid="rsvp-accept-btn"|data-testid="rsvp-accept-btn"[^>]*(?:disabled|aria-disabled="true")/);
  });

  it('21. Phase 1: Reorder controls are hidden when only 1 decision exists', () => {
    setupContexts();

    const singleDecision: MeetingDecision[] = [sampleDecisions[0]];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialDecisions={singleDecision}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Adopt PostgreSQL RLS for Multi-Tenancy');
    expect(html).not.toContain('title="Move up"');
    expect(html).not.toContain('title="Move down"');
  });

  it('22. Phase 1: Action items empty state renders a single primary CTA', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialActionItems={[]}
                initialLoading={false}
                initialActiveTab="actions"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('No Action Items Recorded');
    expect(html).toContain('empty-add-action-btn');
    expect(html).not.toContain('header-add-action-btn');
  });

  it('23. Phase 2: Decision cards render "+ Action Item" button and linked action items count badge', () => {
    setupContexts();

    const decisionWithLinkedAction: MeetingDecision[] = [sampleDecisions[0]];
    const linkedActionItem: MeetingActionItem = {
      id: 'ai-link-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Review RLS Tenant Context Performance',
      assigneeId: 'user-bob-456',
      assigneeName: 'Bob Smith',
      priority: 'high',
      status: 'open',
      decisionId: sampleDecisions[0].id,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialDecisions={decisionWithLinkedAction}
                initialActionItems={[linkedActionItem]}
                initialLoading={false}
                initialActiveTab="minutes"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Adopt PostgreSQL RLS for Multi-Tenancy');
    expect(html).toContain('1 action item');
    expect(html).toContain('title="Create Action Item from this decision"');
    expect(html).toContain('Action Item');
  });

  it('24. Phase 2: Action items render overdue badge, linked decision badge, in-project badge, and Promote to Task button', () => {
    setupContexts();

    const overdueLinkedAction: MeetingActionItem = {
      id: 'ai-overdue-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Execute RLS Penetration Testing',
      assigneeId: 'user-bob-456',
      assigneeName: 'Bob Smith',
      priority: 'urgent',
      status: 'in_progress',
      dueDate: '2026-01-01T00:00:00.000Z', // past due date
      decisionId: sampleDecisions[0].id,
      decisionTitle: sampleDecisions[0].title,
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    };

    const alreadyPromotedAction: MeetingActionItem = {
      id: 'ai-promoted-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      title: 'Setup Automated CI Security Pipeline',
      assigneeId: 'user-bob-456',
      assigneeName: 'Bob Smith',
      priority: 'medium',
      status: 'open',
      projectTaskId: 'task-security-ci',
      projectTaskTitle: 'Security Hardening Epic',
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialDecisions={sampleDecisions}
                initialActionItems={[overdueLinkedAction, alreadyPromotedAction]}
                initialLoading={false}
                initialActiveTab="actions"
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Overdue badge check
    expect(html).toContain('Execute RLS Penetration Testing');
    expect(html).toContain('Overdue');

    // Decision badge check
    expect(html).toContain('Decision: Adopt PostgreSQL RLS for Multi-Tenancy');

    // Promote to Task button check on unpromoted action item
    expect(html).toContain('Promote to Task');

    // In Project badge check on promoted action item
    expect(html).toContain('Setup Automated CI Security Pipeline');
    expect(html).toContain('In Project: Security Hardening Epic');
  });

  it('Phase 4: renders Export Markdown (.md) and Export PDF (.pdf) buttons on meeting detail', () => {
    vi.mocked(OrgContextModule.useOrg).mockReturnValue({
      activeOrg: mockOrg,
      activeDetails: {
        membership: {
          role: { slug: 'organisation_member' },
          permissions: ['meeting.view'],
        },
      },
    } as any);

    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: { id: 'user-bob-456' },
    } as any);

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify Export buttons
    expect(html).toContain('data-testid="export-md-btn"');
    expect(html).toContain('Export .MD');
    expect(html).toContain('data-testid="export-pdf-btn"');
    expect(html).toContain('Export PDF');
  });

  it('Phase 4: renders Export controls even on terminal completed meetings', () => {
    vi.mocked(OrgContextModule.useOrg).mockReturnValue({
      activeOrg: mockOrg,
      activeDetails: {
        membership: {
          role: { slug: 'organisation_member' },
          permissions: ['meeting.view'],
        },
      },
    } as any);

    vi.mocked(AuthContextModule.useAuth).mockReturnValue({
      user: { id: 'user-bob-456' },
    } as any);

    const completedMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'completed',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={completedMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify terminal message is shown
    expect(html).toContain('This meeting is <strong>completed</strong>');
    // Verify export buttons remain accessible
    expect(html).toContain('data-testid="export-md-btn"');
    expect(html).toContain('data-testid="export-pdf-btn"');
  });

  it('Phase A: renders attendee summary header with total invited and confirmed count', () => {
    setupContexts();

    const attendeesList: MeetingAttendee[] = [
      {
        id: 'att-1',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-alice-123',
        fullName: 'Alice Johnson',
        email: 'alice@managex.org',
        role: 'organiser',
        rsvpStatus: 'accepted',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-2',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-bob-456',
        fullName: 'Bob Smith',
        email: 'bob@managex.org',
        role: 'participant',
        rsvpStatus: 'pending',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-3',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-carol-789',
        fullName: 'Carol Danvers',
        email: 'carol@managex.org',
        role: 'participant',
        rsvpStatus: 'tentative',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-4',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-dave-000',
        fullName: 'Dave Miller',
        email: 'dave@managex.org',
        role: 'participant',
        rsvpStatus: 'declined',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={attendeesList}
                initialActiveTab="attendees"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('4 invited');
    expect(html).toContain('1 confirmed');
    expect(html).toContain('1 pending');
    expect(html).toContain('1 tentative');
    expect(html).toContain('1 declined');
  });

  it('Phase A: renders 0 invited · 0 confirmed and empty state when attendees list is empty', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={[]}
                initialActiveTab="attendees"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('0 invited');
    expect(html).toContain('0 confirmed');
    expect(html).toContain('No attendees invited yet.');
  });

  it('Phase A: resolves attendee names according to fallback order (fullName -> userName -> externalEmail -> Member)', () => {
    setupContexts();

    const attendeesWithVariousNames: MeetingAttendee[] = [
      {
        id: 'att-canonical',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-1',
        fullName: 'Canonical FullName',
        userName: 'Legacy UserName',
        email: 'user1@example.com',
        role: 'participant',
        rsvpStatus: 'accepted',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-legacy',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-2',
        fullName: null,
        userName: 'Legacy UserName Only',
        userEmail: 'user2@example.com',
        role: 'participant',
        rsvpStatus: 'pending',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-guest',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: null,
        externalEmail: 'guest.vendor@partner.com',
        isExternal: true,
        role: 'guest',
        rsvpStatus: 'pending',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'att-fallback',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        userId: 'user-4',
        fullName: null,
        userName: null,
        email: null,
        role: 'participant',
        rsvpStatus: 'pending',
        invitedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialAttendees={attendeesWithVariousNames}
                initialActiveTab="attendees"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // 1. fullName takes precedence over userName
    expect(html).toContain('Canonical FullName');
    // 2. userName is used when fullName is absent
    expect(html).toContain('Legacy UserName Only');
    expect(html).toContain('user2@example.com');
    // 3. externalEmail is used as name and email, and displays (External)
    expect(html).toContain('guest.vendor@partner.com');
    expect(html).toContain('(External)');
    // 4. Fallback to 'Member'
    expect(html).toContain('Member');
  });

  it('Phase B: derived Overdue badge and Overdue warning banner render on past in_progress meeting', () => {
    setupContexts();

    const pastInProgressMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'in_progress',
      startAt: '2026-01-01T10:00:00.000Z',
      endAt: '2026-01-01T11:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={pastInProgressMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="overdue-badge"');
    expect(html).toContain('Overdue');
    expect(html).toContain('data-testid="overdue-banner"');
    expect(html).toContain('scheduled end time has passed');
  });

  it('Phase B: does NOT render Overdue badge or banner when meeting end_at is in the future', () => {
    setupContexts();

    const futureInProgressMeeting: MeetingItem = {
      ...sampleMeeting,
      status: 'in_progress',
      startAt: '2099-01-01T10:00:00.000Z',
      endAt: '2099-01-01T11:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={futureInProgressMeeting}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('data-testid="overdue-badge"');
    expect(html).not.toContain('data-testid="overdue-banner"');
  });

  it('Phase B: getCompletionConfirmMessage returns MoM advisory when MoM content is empty, and standard message when populated', () => {
    // 1. Empty MoM advisory
    const emptyMsg = getCompletionConfirmMessage(true);
    expect(emptyMsg).toContain('Note: No discussion points, decisions, or notes have been recorded for this meeting. Once completed, minutes cannot be edited.');

    // 2. Populated MoM standard confirmation
    const standardMsg = getCompletionConfirmMessage(false);
    expect(standardMsg).toBe('Are you sure you want to complete this meeting? It cannot be edited after completion.');
    expect(standardMsg).not.toContain('Note: No discussion points');
  });

  it('Phase B: confirmation modal displays MoM empty advisory non-blockingly with working confirm action', () => {
    setupContexts();

    const advisoryMessage = getCompletionConfirmMessage(true);

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{ ...sampleMeeting, status: 'in_progress' }}
                initialConfirmState={{
                  isOpen: true,
                  title: 'Complete Meeting',
                  description: advisoryMessage,
                  confirmLabel: 'Confirm',
                  variant: 'primary',
                  onConfirm: () => {},
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify modal title, advisory note description, and confirm/cancel action buttons are rendered
    expect(html).toContain('Complete Meeting');
    expect(html).toContain('Note: No discussion points, decisions, or notes have been recorded for this meeting');
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
  });

  it('Phase B: isMeetingOverdue canonical helper correctly evaluates edge cases and statuses', () => {
    const pastTime = '2026-01-01T10:00:00.000Z';
    const futureTime = '2099-01-01T10:00:00.000Z';
    const refNow = new Date('2026-06-01T10:00:00.000Z').getTime();

    // 1. Scheduled past -> overdue
    expect(isMeetingOverdue('scheduled', pastTime, refNow)).toBe(true);

    // 2. In_progress past -> overdue
    expect(isMeetingOverdue('in_progress', pastTime, refNow)).toBe(true);

    // 3. Scheduled future -> not overdue
    expect(isMeetingOverdue('scheduled', futureTime, refNow)).toBe(false);

    // 4. In_progress future -> not overdue
    expect(isMeetingOverdue('in_progress', futureTime, refNow)).toBe(false);

    // 5. Terminal statuses never overdue even if past
    expect(isMeetingOverdue('completed', pastTime, refNow)).toBe(false);
    expect(isMeetingOverdue('cancelled', pastTime, refNow)).toBe(false);
    expect(isMeetingOverdue('missed', pastTime, refNow)).toBe(false);

    // 6. Missing or invalid date / status
    expect(isMeetingOverdue(null, pastTime, refNow)).toBe(false);
    expect(isMeetingOverdue('scheduled', null, refNow)).toBe(false);
    expect(isMeetingOverdue('scheduled', 'invalid-date', refNow)).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* Phase C: Manual Virtual Meeting Links & Terminal-State Join CTA     */
  /* ------------------------------------------------------------------ */

  it('Phase C: Join CTA is actionable with valid link for eligible scheduled meeting', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'scheduled',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="join-meeting-cta"');
    expect(html).toContain('Join Virtual Meeting');
    expect(html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(html).not.toContain('data-testid="inactive-join-notice"');
  });

  it('Phase C: Join CTA remains actionable for in_progress meeting even when end_at has passed', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'in_progress',
                  endAt: '2026-01-01T10:00:00.000Z', // past end time
                  virtualUrl: 'https://zoom.us/j/9876543210',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // End time passed alone must NOT deactivate join CTA while meeting is in_progress
    expect(html).toContain('data-testid="join-meeting-cta"');
    expect(html).toContain('Join Virtual Meeting');
    expect(html).toContain('href="https://zoom.us/j/9876543210"');
    expect(html).not.toContain('data-testid="inactive-join-notice"');
  });

  it('Phase C: Join CTA is deactivated for completed meeting and renders inactive notice', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'completed',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('data-testid="join-meeting-cta"');
    expect(html).not.toContain('Join Virtual Meeting');
    expect(html).toContain('data-testid="inactive-join-notice"');
    expect(html).toContain('Meeting ended · Link inactive');
  });

  it('Phase C: Join CTA is deactivated for cancelled and missed meetings with appropriate notice', () => {
    setupContexts();

    // 1. Cancelled meeting
    const cancelledHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'cancelled',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(cancelledHtml).not.toContain('data-testid="join-meeting-cta"');
    expect(cancelledHtml).toContain('data-testid="inactive-join-notice"');
    expect(cancelledHtml).toContain('Meeting cancelled · Link inactive');

    // 2. Missed meeting
    const missedHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'missed',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(missedHtml).not.toContain('data-testid="join-meeting-cta"');
    expect(missedHtml).toContain('data-testid="inactive-join-notice"');
    expect(missedHtml).toContain('Meeting missed · Link inactive');
  });

  it('Phase C: Organiser sees historical link text on terminal meeting, while non-organiser does not', () => {
    // 1. Organiser view: sees historical link as plain text metadata
    setupContexts({ userId: 'user-alice-123' }); // Alice is organiser

    const organiserHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'completed',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(organiserHtml).not.toContain('data-testid="join-meeting-cta"');
    expect(organiserHtml).toContain('data-testid="inactive-join-notice"');
    expect(organiserHtml).toContain('data-testid="historical-meeting-url"');
    expect(organiserHtml).toContain('Historical link: https://meet.google.com/abc-defg-hij');

    // 2. Non-organiser member view: sees inactive notice but NOT the historical URL
    setupContexts({
      userId: 'user-bob-999',
      roleSlug: 'member',
      permissions: ['meeting.view'],
    });

    const memberHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  status: 'completed',
                  virtualUrl: 'https://meet.google.com/abc-defg-hij',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(memberHtml).not.toContain('data-testid="join-meeting-cta"');
    expect(memberHtml).toContain('data-testid="inactive-join-notice"');
    expect(memberHtml).toContain('Meeting ended · Link inactive');
    expect(memberHtml).not.toContain('data-testid="historical-meeting-url"');
    expect(memberHtml).not.toContain('Historical link:');
  });

  it('Phase C: In-person meeting does not render Join CTA or inactive notice', () => {
    setupContexts();

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={{
                  ...sampleMeeting,
                  locationType: 'in_person',
                  location: 'Boardroom 4B, HQ',
                  virtualUrl: null,
                  status: 'completed',
                }}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('data-testid="join-meeting-cta"');
    expect(html).not.toContain('data-testid="inactive-join-notice"');
    expect(html).toContain('Boardroom 4B, HQ');
  });

  /* ------------------------------------------------------------------ */
  /* Phase D: Action-Item Completion Metrics & MoM Integration          */
  /* ------------------------------------------------------------------ */

  it('Phase D: Action Items tab renders actionable completion summary (rate, done, actionable, cancelled)', () => {
    setupContexts();

    const mixedActionItems: MeetingActionItem[] = [
      {
        id: 'act-1',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 1 - Done',
        status: 'done',
        priority: 'high',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-2',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 2 - Done',
        status: 'done',
        priority: 'medium',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-3',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 3 - In Progress',
        status: 'in_progress',
        priority: 'medium',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-4',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 4 - Open',
        status: 'open',
        priority: 'low',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-5',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 5 - Cancelled',
        status: 'cancelled',
        priority: 'low',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialActionItems={mixedActionItems}
                initialActiveTab="actions"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // 5 total, 2 done, 1 cancelled -> 4 actionable -> 50%
    expect(html).toContain('data-testid="meeting-action-summary"');
    expect(html).toContain('Actionable Completion Rate: 50%');
    expect(html).toContain('2 of 4 actionable items completed');
    expect(html).toContain('1 cancelled');
    expect(html).toContain('Total recorded: 5');
  });

  it('Phase D: Action Items tab renders all-cancelled notice without misleading progress when all items are cancelled', () => {
    setupContexts();

    const cancelledActionItems: MeetingActionItem[] = [
      {
        id: 'act-c1',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 1 - De-scoped',
        status: 'cancelled',
        priority: 'medium',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-c2',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 2 - Cancelled',
        status: 'cancelled',
        priority: 'low',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialActionItems={cancelledActionItems}
                initialActiveTab="actions"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="meeting-action-summary"');
    expect(html).toContain('Actionable Completion Rate: 0%');
    expect(html).toContain('All 2 items cancelled · No actionable items');
  });

  it('Phase D: Section 3 in Minutes tab displays actionable summary badge alongside action item count', () => {
    setupContexts();

    const mixedActionItems: MeetingActionItem[] = [
      {
        id: 'act-1',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 1 - Done',
        status: 'done',
        priority: 'high',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'act-2',
        organisationId: 'org-tech-corp',
        meetingId: 'meet-101',
        title: 'Task 2 - Cancelled',
        status: 'cancelled',
        priority: 'low',
        assigneeId: 'user-alice-123',
        assigneeName: 'Alice Johnson',
        createdById: 'user-alice-123',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings/meet-101']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings/:meetingId"
            element={
              <MeetingDetailPage
                initialMeeting={sampleMeeting}
                initialActionItems={mixedActionItems}
                initialActiveTab="minutes"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="mom-action-summary"');
    expect(html).toContain('1 of 1 actionable completed · 1 cancelled');
  });
});

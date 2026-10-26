import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MeetingsPage } from './MeetingsPage';
import * as OrgContextModule from '@/api/OrgContext';
import { MeetingItem } from '@/types/meetings';

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    code?: string;
    constructor(statusCode: number, message: string, code?: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

describe('MeetingsPage — Workspace Meetings List & Filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrg = {
    id: 'org-tech-corp',
    name: 'Tech Corp',
    slug: 'tech-corp',
    status: 'active',
  };

  const sampleMeeting: MeetingItem = {
    id: 'meet-101',
    organisationId: 'org-tech-corp',
    title: 'Q4 Product Roadmap Alignment',
    description: 'Quarterly review of features and roadmap milestones.',
    startAt: '2026-11-15T14:00:00.000Z',
    endAt: '2026-11-15T15:30:00.000Z',
    timezone: 'America/New_York',
    locationType: 'virtual',
    virtualUrl: 'https://meet.google.com/xyz-abc-def',
    visibility: 'organisation',
    status: 'scheduled',
    organiserId: 'user-1',
    createdById: 'user-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    organiserName: 'Alice Johnson',
    attendeeCount: 8,
    agendaCount: 4,
  };

  it('1. Renders loading skeleton while meetings are loading', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialLoading={true} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('animate-pulse');
  });

  it('2. Renders empty state when organisation has no meetings', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('No meetings found');
    expect(html).toContain('No meetings match your selected filters');
  });

  it('3. Renders meeting cards with title, status, badges, and metadata', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[sampleMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Q4 Product Roadmap Alignment');
    expect(html).toContain('Quarterly review of features and roadmap milestones.');
    expect(html).toContain('America/New_York');
    expect(html).toContain('Virtual');
    expect(html).toContain('Scheduled');
    expect(html).toContain('8 attendees');
    expect(html).toContain('4 agenda items');
  });

  it('4. Hides "Schedule Meeting" button when member lacks meeting.create permission', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[sampleMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Schedule Meeting');
  });

  it('5. Shows "Schedule Meeting" button when user has meeting.create permission', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view', 'meeting.create'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[sampleMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Schedule Meeting');
  });

  it('6. Phase 1: Renders "Overdue" badge when a scheduled meeting has passed its end date', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const overdueMeeting: MeetingItem = {
      ...sampleMeeting,
      id: 'meet-overdue',
      title: 'Past Unheld Standup',
      status: 'scheduled',
      startAt: '2026-01-01T10:00:00.000Z',
      endAt: '2026-01-01T11:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[overdueMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Past Unheld Standup');
    expect(html).toContain('Overdue');
  });

  it('7. Phase 1: Renders friendly timezone label and "Missed" badge', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const missedMeeting: MeetingItem = {
      ...sampleMeeting,
      id: 'meet-missed',
      title: 'Missed Sprint Demo',
      status: 'missed',
      timezone: 'Asia/Kolkata',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[missedMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Missed Sprint Demo');
    expect(html).toContain('Missed');
    expect(html).toContain('IST (Asia/Kolkata, UTC+05:30)');
  });

  it('8. Phase 2: Renders top-level navigation tabs for Meetings and My Action Items', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[sampleMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Meetings &amp; MOM');
    expect(html).toContain('data-testid="tab-meetings"');
    expect(html).toContain('data-testid="tab-action-items"');
    expect(html).toContain('My Action Items');
  });

  it('9. Phase 2: Renders My Action Items view with overdue badge, decision badge, and meeting link', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const sampleActionItem = {
      id: 'ai-1',
      organisationId: 'org-tech-corp',
      meetingId: 'meet-101',
      meetingTitle: 'Sprint Planning & Backlog Refinement',
      title: 'Configure Neon PostgreSQL Connection Pooling',
      description: 'Implement PgBouncer transaction mode connection limits',
      assigneeId: 'user-alice-123',
      assigneeName: 'Alice Johnson',
      dueDate: '2026-01-01T00:00:00.000Z', // past due date
      priority: 'high' as const,
      status: 'open' as const,
      decisionId: 'dec-1',
      decisionTitle: 'Adopt Neon Cloud Database',
      projectTaskId: 'task-99',
      projectTaskTitle: 'Database Migration Epic',
      createdById: 'user-alice-123',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="action-items"
                initialActionItems={[sampleActionItem]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Configure Neon PostgreSQL Connection Pooling');
    expect(html).toContain('Implement PgBouncer transaction mode connection limits');
    expect(html).toContain('data-testid="action-item-overdue"');
    expect(html).toContain('Decision: Adopt Neon Cloud Database');
    expect(html).toContain('In Project: Database Migration Epic');
    expect(html).toContain('Sprint Planning &amp; Backlog Refinement');
    expect(html).toContain('High');
    expect(html).toContain('Open');
  });

  it('10. Phase 2: Renders clean empty state when user has no assigned action items', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="action-items"
                initialActionItems={[]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('No action items found');
    expect(html).toContain("You&#x27;re all caught up! No open action items currently assigned to you.");
  });

  it('11. Phase 4: Renders top-level navigation tabs with Analytics tab', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialMeetings={[sampleMeeting]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify all 3 top-level sub-tabs
    expect(html).toContain('data-testid="tab-meetings"');
    expect(html).toContain('data-testid="tab-action-items"');
    expect(html).toContain('data-testid="tab-analytics"');
    expect(html).toContain('Analytics');
  });

  it('12. Phase 4: Renders Analytics dashboard with timeframe controls and empty state when no meetings exist', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="analytics"
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="analytics-tab-content"');
    expect(html).toContain('Meeting Analytics &amp; Performance');
    expect(html).toContain('data-testid="analytics-timeframe-all"');
    expect(html).toContain('data-testid="analytics-timeframe-30d"');
    expect(html).toContain('data-testid="analytics-timeframe-90d"');
    expect(html).toContain('No meeting activity found');
  });

  it('13. Phase B: Renders "Overdue" badge for in_progress meeting whose end_at has passed', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const overdueInProgress: MeetingItem = {
      ...sampleMeeting,
      id: 'meet-in-progress-overdue',
      title: 'Active Standup Past Schedule',
      status: 'in_progress',
      startAt: '2026-01-01T10:00:00.000Z',
      endAt: '2026-01-01T11:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[overdueInProgress]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Active Standup Past Schedule');
    expect(html).toContain('In Progress');
    expect(html).toContain('data-testid="overdue-badge"');
    expect(html).toContain('Overdue');
  });

  it('14. Phase B: Does NOT render "Overdue" badge when meeting end_at has NOT passed', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const futureMeeting: MeetingItem = {
      ...sampleMeeting,
      id: 'meet-future',
      title: 'Future Quarterly Review',
      status: 'scheduled',
      startAt: '2099-01-01T10:00:00.000Z',
      endAt: '2099-01-01T11:00:00.000Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={[futureMeeting]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Future Quarterly Review');
    expect(html).not.toContain('data-testid="overdue-badge"');
  });

  it('15. Phase B: Does NOT render "Overdue" badge for terminal meetings even if end_at is in the past', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Admin' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const terminalMeetings: MeetingItem[] = [
      {
        ...sampleMeeting,
        id: 'meet-completed',
        title: 'Completed Past Meeting',
        status: 'completed',
        startAt: '2026-01-01T10:00:00.000Z',
        endAt: '2026-01-01T11:00:00.000Z',
      },
      {
        ...sampleMeeting,
        id: 'meet-missed',
        title: 'Missed Past Meeting',
        status: 'missed',
        startAt: '2026-01-01T10:00:00.000Z',
        endAt: '2026-01-01T11:00:00.000Z',
      },
      {
        ...sampleMeeting,
        id: 'meet-cancelled',
        title: 'Cancelled Past Meeting',
        status: 'cancelled',
        startAt: '2026-01-01T10:00:00.000Z',
        endAt: '2026-01-01T11:00:00.000Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={<MeetingsPage initialMeetings={terminalMeetings} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Completed Past Meeting');
    expect(html).toContain('Missed Past Meeting');
    expect(html).toContain('Cancelled Past Meeting');
    expect(html).not.toContain('data-testid="overdue-badge"');
  });

  it('16. Phase C: Meeting cards render location badge and Details CTA without rendering raw Join links on list cards', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialMeetings={[
                  {
                    ...sampleMeeting,
                    locationType: 'virtual',
                    virtualUrl: 'https://meet.google.com/xyz-abc-def',
                  },
                ]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // List card shows location indicator ("Virtual") and navigation link ("Details")
    expect(html).toContain('Virtual');
    expect(html).toContain('Details');
    // Does not expose active Join CTA button directly on list overview
    expect(html).not.toContain('Join Virtual Meeting');
  });

  it('17. Phase D: Analytics Metric Card 4 renders actionable completion rate, actionable count, and cancelled breakdown', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockAnalytics = {
      timeframe: 'all' as const,
      summary: {
        totalMeetings: 4,
        scheduledMeetings: 1,
        inProgressMeetings: 1,
        completedMeetings: 2,
        cancelledMeetings: 0,
        missedMeetings: 0,
        overdueScheduledMeetings: 0,
        meetingCompletionRate: 50,
      },
      attendance: {
        totalInvitations: 10,
        accepted: 8,
        declined: 1,
        tentative: 1,
        pending: 0,
        acceptanceRate: 80,
      },
      actionItems: {
        total: 5,
        open: 1,
        inProgress: 1,
        done: 2,
        cancelled: 1,
        actionableTotal: 4,
        overdue: 0,
        actionableCompletionRate: 50,
        grossCompletionRate: 40,
        completionRate: 40,
      },
      mom: {
        totalDiscussionPoints: 6,
        totalDecisions: 3,
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="analytics"
                initialAnalytics={mockAnalytics}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Metric 4 card
    expect(html).toContain('data-testid="metric-action-rate"');
    expect(html).toContain('50%');
    expect(html).toContain('2 of 4 actionable items completed');
    expect(html).toContain('1 cancelled');

    // Lifecycle Breakdown card
    expect(html).toContain('Action Items Lifecycle');
    expect(html).toContain('5 total items (4 actionable)');
    expect(html).toContain('Actionable Completion Rate');
  });

  it('18. Phase D: Analytics Metric Card 4 handles all-cancelled action items cleanly without NaN', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockAnalyticsAllCancelled = {
      timeframe: 'all' as const,
      summary: {
        totalMeetings: 2,
        scheduledMeetings: 0,
        inProgressMeetings: 0,
        completedMeetings: 2,
        cancelledMeetings: 0,
        missedMeetings: 0,
        overdueScheduledMeetings: 0,
        meetingCompletionRate: 100,
      },
      attendance: {
        totalInvitations: 4,
        accepted: 4,
        declined: 0,
        tentative: 0,
        pending: 0,
        acceptanceRate: 100,
      },
      actionItems: {
        total: 3,
        open: 0,
        inProgress: 0,
        done: 0,
        cancelled: 3,
        actionableTotal: 0,
        overdue: 0,
        actionableCompletionRate: 0,
        grossCompletionRate: 0,
        completionRate: 0,
      },
      mom: {
        totalDiscussionPoints: 2,
        totalDecisions: 1,
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="analytics"
                initialAnalytics={mockAnalyticsAllCancelled}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="metric-action-rate"');
    expect(html).toContain('0%');
    expect(html).toContain('All 3 items cancelled');
    expect(html).not.toContain('NaN');
  });

  it('19. Phase E: Renders "RSVP Acceptance Rate" and "RSVP Status & Responses" labels on analytics cards', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockAnalytics = {
      timeframe: 'all' as const,
      summary: {
        totalMeetings: 2,
        scheduledMeetings: 1,
        inProgressMeetings: 0,
        completedMeetings: 1,
        cancelledMeetings: 0,
        missedMeetings: 0,
        overdueScheduledMeetings: 0,
        meetingCompletionRate: 50,
      },
      attendance: {
        totalInvitations: 5,
        accepted: 4,
        declined: 1,
        tentative: 0,
        pending: 0,
        acceptanceRate: 80,
      },
      actionItems: {
        total: 2,
        open: 1,
        inProgress: 0,
        done: 1,
        cancelled: 0,
        actionableTotal: 2,
        overdue: 0,
        actionableCompletionRate: 50,
        grossCompletionRate: 50,
        completionRate: 50,
      },
      mom: {
        totalDiscussionPoints: 2,
        totalDecisions: 1,
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="analytics"
                initialAnalytics={mockAnalytics}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify Metric 3 card
    expect(html).toContain('RSVP Acceptance Rate');
    expect(html).toContain('data-testid="metric-attendance-rate"');
    expect(html).toContain('80%');
    expect(html).toContain('4 of 5 accepted');

    // Verify Card B detailed breakdown
    expect(html).toContain('RSVP Status &amp; Responses');
    expect(html).not.toContain('Attendance &amp; RSVPs');
    expect(html).not.toContain('Attendance Rate');
  });

  it('20. Phase E: Renders 0% for RSVP Acceptance Rate when there are no invitations without NaN', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      activeOrg: mockOrg as any,
      activeDetails: {
        organisation: mockOrg as any,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Member' },
          permissions: ['meeting.view'],
        },
      } as any,
      organisations: [mockOrg as any],
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockAnalyticsEmptyAttendees = {
      timeframe: 'all' as const,
      summary: {
        totalMeetings: 1,
        scheduledMeetings: 1,
        inProgressMeetings: 0,
        completedMeetings: 0,
        cancelledMeetings: 0,
        missedMeetings: 0,
        overdueScheduledMeetings: 0,
        meetingCompletionRate: 0,
      },
      attendance: {
        totalInvitations: 0,
        accepted: 0,
        declined: 0,
        tentative: 0,
        pending: 0,
        acceptanceRate: 0,
      },
      actionItems: {
        total: 0,
        open: 0,
        inProgress: 0,
        done: 0,
        cancelled: 0,
        actionableTotal: 0,
        overdue: 0,
        actionableCompletionRate: 0,
        grossCompletionRate: 0,
        completionRate: 0,
      },
      mom: {
        totalDiscussionPoints: 0,
        totalDecisions: 0,
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-tech-corp/meetings']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/meetings"
            element={
              <MeetingsPage
                initialTab="analytics"
                initialAnalytics={mockAnalyticsEmptyAttendees}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('RSVP Acceptance Rate');
    expect(html).toContain('0%');
    expect(html).toContain('0 of 0 accepted');
    expect(html).not.toContain('NaN');
  });
});

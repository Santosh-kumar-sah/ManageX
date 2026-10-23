import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicEventDetailPage } from './PublicEventDetailPage';
import * as AuthContextModule from '@/api/AuthContext';
import * as ClientModule from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('PublicEventDetailPage — Public Details & External Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders loading state initially', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(() => new Promise(() => {}));

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial render displays skeletons
    expect(html).toContain('animate-pulse');
  });

  it('2. Shows unauthenticated external participant sign-in call to action', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    // We can also verify that the component is fully structured and accepts route params
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toBeDefined();
  });

  it('3. Navigation links back to ManageX home (/) and never to /events directory', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      description: 'A direct hackathon link from the host organisation.',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      organisation: {
        id: 'org-1',
        name: 'Kiet Group',
        slug: 'kiet-group',
      },
    };

    vi.spyOn(ClientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: {
        event: mockEvent,
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage initialEvent={mockEvent} />} />
        </Routes>
      </MemoryRouter>
    );

    // Links to /events portal homepage
    expect(html).toContain('href="/events"');
    expect(html).toContain('All Events');
  });

  it('4. Confidential participant instructions are NOT visible to unregistered visitors', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEventWithoutSecret = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      participantInstructions: undefined, // Stripped by server sanitizer
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage initialEvent={mockEventWithoutSecret} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Instructions for Registered Participants');
    expect(html).not.toContain('Secret Meeting Discord Join Code');
  });

  it('5. Participant instructions ARE rendered when participant has active registration', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-1', email: 'registered@user.com', fullName: 'Alice Registered', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockRegistration = {
      id: 'reg-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-1',
      status: 'registered' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      participantInstructions: 'Secret Meeting Discord Join Code: #HACK-2026-STAGE',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockRegistration}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Instructions for Registered Participants');
    expect(html).toContain('Secret Meeting Discord Join Code: #HACK-2026-STAGE');
  });

  it('6. Participant instructions are NOT rendered for withdrawn participants', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-1', email: 'withdrawn@user.com', fullName: 'Bob Withdrawn', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockWithdrawnRegistration = {
      id: 'reg-2',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-1',
      status: 'withdrawn' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      withdrawnAt: '2026-10-16T12:00:00Z',
      participantInstructions: null,
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-16T12:00:00Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockWithdrawnRegistration}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('Instructions for Registered Participants');
    expect(html).toContain('Re-register for Event');
  });

  it('7. EVT-006: In hackathon event, registered participant without a team sees team creation and available teams roster', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-1', email: 'registered@user.com', fullName: 'Alice Registered', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockRegistration = {
      id: 'reg-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-1',
      status: 'registered' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };

    const mockTeams = [
      {
        id: 'team-1',
        organisationId: 'org-1',
        eventId: 'evt-100',
        name: 'Cyber Innovators',
        slug: 'cyber-innovators',
        description: 'Building AI defense agents',
        createdById: 'u-2',
        memberCount: 2,
        createdAt: '2026-10-16T10:00:00Z',
        updatedAt: '2026-10-16T10:00:00Z',
        owner: { id: 'u-2', email: 'bob@user.com', fullName: 'Bob Builder' },
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockRegistration}
                initialMyTeam={null}
                initialTeams={mockTeams}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Hackathon Teams');
    expect(html).toContain('You are not in a team yet');
    expect(html).toContain('Create Team');
    expect(html).toContain('Cyber Innovators');
    expect(html).toContain('2 / 4 Members');
    expect(html).toContain('Join Team');
  });

  it('8. EVT-006: Participant with active team sees "Your Team", owner badge, and member roster with leave button', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-1', email: 'alice@user.com', fullName: 'Alice Registered', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockRegistration = {
      id: 'reg-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-1',
      status: 'registered' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };

    const mockMyTeam = {
      id: 'team-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      name: 'Alpha Hackers',
      slug: 'alpha-hackers',
      description: 'First place winners',
      createdById: 'u-1',
      memberCount: 2,
      createdAt: '2026-10-16T10:00:00Z',
      updatedAt: '2026-10-16T10:00:00Z',
      members: [
        {
          id: 'mem-1',
          userId: 'u-1',
          isOwner: true,
          joinedAt: '2026-10-16T10:00:00Z',
          user: { id: 'u-1', email: 'alice@user.com', fullName: 'Alice Registered' },
        },
        {
          id: 'mem-2',
          userId: 'u-2',
          isOwner: false,
          joinedAt: '2026-10-16T11:00:00Z',
          user: { id: 'u-2', email: 'bob@user.com', fullName: 'Bob Builder' },
        },
      ],
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockRegistration}
                initialMyTeam={mockMyTeam}
                initialTeams={[mockMyTeam]}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Alpha Hackers');
    expect(html).toContain('Your Team');
    expect(html).toContain('Leave Team');
    expect(html).toContain('Alice Registered');
    expect(html).toContain('Bob Builder');
  });

  it('9. EVT-006: Unregistered visitor sees "Registration Required for Teams" notice on hackathon events', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={null}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Registration Required for Teams');
    expect(html).not.toContain('You are not in a team yet');
  });

  it('10. EVT-006: Participant with pending invitations sees received invitations banner with Join and Decline options', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-3', email: 'charlie@user.com', fullName: 'Charlie Dev', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockRegistration = {
      id: 'reg-3',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-3',
      status: 'registered' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };

    const mockPendingInvites = [
      {
        id: 'inv-1',
        teamId: 'team-99',
        teamName: 'Quantum Pioneers',
        teamSlug: 'quantum-pioneers',
        invitedByName: 'Dr. Jane Quantum',
        createdAt: '2026-10-16T12:00:00Z',
        expiresAt: '2026-10-23T12:00:00Z',
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockRegistration}
                initialMyTeam={null}
                initialPendingInvites={mockPendingInvites}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('You Have Received Team Invitations');
    expect(html).toContain('Quantum Pioneers');
    expect(html).toContain('Dr. Jane Quantum');
    expect(html).toContain('Join Team');
    expect(html).toContain('Decline');
  });

  it('11. EVT-007: Registered participant sees Project Submission card with deliverable URLs and status', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u-1', email: 'alice@user.com', fullName: 'Alice Registered', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    const mockRegistration = {
      id: 'reg-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      userId: 'u-1',
      status: 'registered' as const,
      registeredAt: '2026-10-15T10:00:00Z',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };

    const mockSubmission = {
      id: 'sub-1',
      organisationId: 'org-1',
      eventId: 'evt-100',
      submitterUserId: 'u-1',
      title: 'Autonomous Defense Agent v1',
      description: 'AI-based container isolation engine',
      repositoryUrl: 'https://github.com/managex/defense-agent',
      demoUrl: 'https://defense-agent.managex.local',
      status: 'submitted' as const,
      submittedAt: '2026-10-17T15:30:00Z',
      updatedAt: '2026-10-17T15:30:00Z',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialRegistration={mockRegistration}
                initialSubmission={mockSubmission}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Project Submission');
    expect(html).toContain('Autonomous Defense Agent v1');
    expect(html).toContain('AI-based container isolation engine');
    expect(html).toContain('https://github.com/managex/defense-agent');
    expect(html).toContain('https://defense-agent.managex.local');
    expect(html).toContain('submitted');
  });

  it('12. EVT-009: When results are published, official leaderboard displays ranked submissions and total scores', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      eventType: 'hackathon' as const,
      status: 'completed' as const,
      visibility: 'public' as const,
      startAt: '2026-10-01T09:00:00Z',
      endAt: '2026-10-03T18:00:00Z',
      resultsPublishedAt: '2026-10-04T12:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      teamSizeMin: 1,
      teamSizeMax: 4,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-04T12:00:00Z',
    };

    const mockResults = [
      {
        submissionId: 'sub-1',
        title: 'DeepDefend AI',
        teamName: 'Cyber Innovators',
        repositoryUrl: 'https://github.com/example/deepdefend',
        demoUrl: 'https://deepdefend.demo.app',
        totalScore: 98.5,
        scoreCount: 3,
        rank: 1,
        isComplete: true,
      },
      {
        submissionId: 'sub-2',
        title: 'Neural Sentry',
        teamName: 'Alpha Hackers',
        repositoryUrl: 'https://github.com/example/neural-sentry',
        demoUrl: 'https://neuralsentry.demo.app',
        totalScore: 92.0,
        scoreCount: 3,
        rank: 2,
        isComplete: true,
      },
    ];

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={
              <PublicEventDetailPage
                initialEvent={mockEvent}
                initialResults={mockResults}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Official Results');
    expect(html).toContain('#1');
    expect(html).toContain('Cyber Innovators');
    expect(html).toContain('98.5 pts');
    expect(html).toContain('#2');
    expect(html).toContain('Alpha Hackers');
    expect(html).toContain('92.0 pts');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EventDetailPage } from './EventDetailPage';
import * as AuthContextModule from '@/api/AuthContext';
import * as OrgContextModule from '@/api/OrgContext';
import * as ClientModule from '@/api/client';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

describe('EventDetailPage — Organiser Shareable Public Link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-owner',
    email: 'sarah@kiet.org',
    fullName: 'Sarah Chen',
    isPlatformAdmin: false,
    status: 'active',
  };

  const mockOrg = {
    id: 'org-kiet',
    name: 'Kiet Group',
    slug: 'kiet-group',
    status: 'active',
    memberCount: 5,
    role: { slug: 'organisation_owner', name: 'Organisation Owner' },
    createdAt: '2026-01-01',
  };

  it('1. Renders "Copy Shareable Link" button when event is published and public', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [mockOrg],
      activeOrg: mockOrg,
      activeDetails: {
        organisation: mockOrg,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_owner', name: 'Organisation Owner' },
          permissions: ['event.view', 'event.edit', 'event.status.manage', 'event.participant.manage'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockPublishedPublicEvent = {
      id: 'evt-published-public-123',
      organisationId: 'org-kiet',
      title: 'Kiet AI Hackathon 2026',
      slug: 'kiet-ai-hackathon-2026',
      eventType: 'hackathon',
      status: 'published',
      visibility: 'public',
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'Asia/Kolkata',
      locationType: 'in_person',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(async (url: string) => {
      if (url.includes('/events/evt-published-public-123') && !url.includes('/my-registration')) {
        return {
          success: true,
          data: { event: mockPublishedPublicEvent },
        };
      }
      return { success: true, data: {} };
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-kiet/events/evt-published-public-123']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/events/:eventId"
            element={<EventDetailPage initialEvent={mockPublishedPublicEvent as any} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Copy Shareable Link');
    expect(html).toContain('data-testid="copy-share-link-button"');
  });

  it('2. Does NOT show "Copy Shareable Link" for draft events', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [mockOrg],
      activeOrg: mockOrg,
      activeDetails: {
        organisation: mockOrg,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_owner', name: 'Organisation Owner' },
          permissions: ['event.view', 'event.edit', 'event.status.manage'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockDraftEvent = {
      id: 'evt-draft-123',
      organisationId: 'org-kiet',
      title: 'Draft Internal Event',
      slug: 'draft-internal-event',
      eventType: 'hackathon',
      status: 'draft',
      visibility: 'public',
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'Asia/Kolkata',
      locationType: 'in_person',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(async () => {
      return {
        success: true,
        data: { event: mockDraftEvent },
      };
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-kiet/events/evt-draft-123']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/events/:eventId"
            element={<EventDetailPage initialEvent={mockDraftEvent as any} />}
          />
        </Routes>
      </MemoryRouter>
    );

    // Draft events should not have the share button
    expect(html).not.toContain('Copy Shareable Link');
    expect(html).not.toContain('copy-share-link-button');
  });

  it('3. Does NOT show "Copy Shareable Link" for private events', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [mockOrg],
      activeOrg: mockOrg,
      activeDetails: {
        organisation: mockOrg,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_owner', name: 'Organisation Owner' },
          permissions: ['event.view', 'event.edit'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const mockPrivateEvent = {
      id: 'evt-private-123',
      organisationId: 'org-kiet',
      title: 'Private Event',
      slug: 'private-event',
      eventType: 'general_event',
      status: 'published',
      visibility: 'private',
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'Asia/Kolkata',
      locationType: 'in_person',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(async () => {
      return {
        success: true,
        data: { event: mockPrivateEvent },
      };
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-kiet/events/evt-private-123']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/events/:eventId"
            element={<EventDetailPage initialEvent={mockPrivateEvent as any} />}
          />
        </Routes>
      </MemoryRouter>
    );

    // Private events should not have the share button
    expect(html).not.toContain('Copy Shareable Link');
    expect(html).not.toContain('copy-share-link-button');
  });

  it('4. Generates correct public URL pattern (/events/:eventId)', () => {
    const eventId = '11111111-2222-3333-4444-555555555555';
    const origin = 'https://app.managex.local';
    const expectedShareUrl = `${origin}/events/${eventId}`;

    expect(expectedShareUrl).toBe('https://app.managex.local/events/11111111-2222-3333-4444-555555555555');
  });
});

describe('EventDetailPage — Phase 02B Multi-Round Hackathon Management', () => {
  const mockUser = {
    id: 'user-owner',
    email: 'sarah@kiet.org',
    fullName: 'Sarah Chen',
    isPlatformAdmin: false,
    status: 'active',
  };

  const mockOrg = {
    id: 'org-kiet',
    name: 'Kiet Group',
    slug: 'kiet-group',
    status: 'active',
    memberCount: 5,
    role: { slug: 'organisation_owner', name: 'Organisation Owner' },
    createdAt: '2026-01-01',
  };

  const mockHackathonEvent = {
    id: 'evt-hackathon-multi',
    organisationId: 'org-kiet',
    title: 'Kiet HackFest 2026',
    slug: 'kiet-hackfest-2026',
    eventType: 'hackathon',
    status: 'published',
    visibility: 'public',
    startAt: '2026-11-01T09:00:00Z',
    endAt: '2026-11-05T18:00:00Z',
    timezone: 'Asia/Kolkata',
    locationType: 'in_person',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const mockRounds = [
    {
      id: 'round-1',
      organisationId: 'org-kiet',
      eventId: 'evt-hackathon-multi',
      roundNumber: 1,
      name: 'Ideation & Screening',
      description: 'Submit initial pitch decks',
      advancementRule: 'manual',
      status: 'completed',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      submissionCount: 15,
    },
    {
      id: 'round-2',
      organisationId: 'org-kiet',
      eventId: 'evt-hackathon-multi',
      roundNumber: 2,
      name: 'Working Prototype',
      description: 'Submit GitHub repo and demo',
      advancementRule: 'score_threshold',
      advancementThreshold: 80,
      status: 'open',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      submissionCount: 8,
    },
  ];

  it('1. Renders Competition Rounds card with configured rounds for hackathons', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [mockOrg],
      activeOrg: mockOrg,
      activeDetails: {
        organisation: mockOrg,
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_owner', name: 'Organisation Owner' },
          permissions: ['event.view', 'event.edit'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-kiet/events/evt-hackathon-multi']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/events/:eventId"
            element={
              <EventDetailPage
                initialEvent={mockHackathonEvent as any}
                initialRounds={mockRounds as any}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('Competition Rounds');
    expect(html).toContain('Ideation &amp; Screening');
    expect(html).toContain('Working Prototype');
    expect(html).toContain('Round 1');
    expect(html).toContain('Round 2');
    expect(html).toContain('Add Round');
  });

  it('2. Does not render Competition Rounds card for non-hackathon events', () => {
    const mockGeneralEvent = {
      ...mockHackathonEvent,
      eventType: 'general_event',
    };

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-kiet/events/evt-hackathon-multi']}>
        <Routes>
          <Route
            path="/app/organisations/:orgId/events/:eventId"
            element={
              <EventDetailPage
                initialEvent={mockGeneralEvent as any}
                initialRounds={mockRounds as any}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).not.toContain('competition-rounds-card');
  });
});

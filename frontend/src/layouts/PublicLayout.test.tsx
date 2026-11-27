import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth, type User } from '@/api/AuthContext';
import { useOrg, type UserOrganisation } from '@/api/OrgContext';
import { ModulesPage } from '@/pages/ModulesPage';
import { SecurityPage } from '@/pages/SecurityPage';
import { PublicLayout } from './PublicLayout';

vi.mock('@/api/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/api/OrgContext', () => ({ useOrg: vi.fn() }));

const participant: User = {
  id: 'participant', email: 'person@example.test', fullName: 'Participant', status: 'active', isPlatformAdmin: false,
};

const organisation: UserOrganisation = {
  id: 'org', name: 'Test team', slug: 'test-team', status: 'active', createdAt: '', memberCount: 1,
  role: { slug: 'member', name: 'Member' },
};

function renderPage(path: string, user: User | null = null, organisations: UserOrganisation[] = []) {
  vi.mocked(useAuth).mockReturnValue({
    user, isAuthenticated: !!user, isLoading: false, refreshUser: vi.fn(), logout: vi.fn(),
  });
  vi.mocked(useOrg).mockReturnValue({
    organisations, activeOrg: null, activeDetails: null, isLoading: false,
    switchOrg: vi.fn(), refreshOrganisations: vi.fn(), createOrganisation: vi.fn(),
  });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/security" element={<SecurityPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('Public site navigation and customer pages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links to the event listing and product sections and includes a keyboard skip destination', () => {
    const html = renderPage('/modules');
    expect(html).toContain('href="/events"');
    expect(html).toContain('href="#public-content"');
    expect(html).toContain('<main id="public-content" tabindex="-1"');
    for (const section of ['events', 'meetings', 'projects']) {
      expect(html).toContain(`href="/modules#${section}"`);
      expect(html).toContain(`id="${section}" tabindex="-1"`);
    }
    expect(html).toContain('aria-controls="public-navigation-menu" aria-expanded="false"');
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('href="/auth/register"');
  });

  it('offers personal event access to participants and workspace access to organisation members', () => {
    const accountMenu = (html: string) => html.match(/<div class="mx-account-links">([\s\S]*?)<\/div>/)?.[1] || '';
    const personal = accountMenu(renderPage('/security', participant));
    expect(personal).toContain('href="/events/dashboard"');
    expect(personal).not.toContain('href="/app"');
    expect(personal).toContain('Sign out');

    const member = accountMenu(renderPage('/security', participant, [organisation]));
    expect(member).toContain('href="/app"');
    expect(member).toContain('href="/events/dashboard"');
  });
});

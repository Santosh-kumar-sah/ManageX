import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AcceptEvaluationInvitationPage } from './AcceptEvaluationInvitationPage';
import * as AuthContextModule from '@/api/AuthContext';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/invitations/evaluation/raw-secret/accept']}>
      <Routes>
        <Route path="/invitations/evaluation/:token/accept" element={<AcceptEvaluationInvitationPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AcceptEvaluationInvitationPage', () => {
  it('requires authentication before accepting', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });
    const html = renderPage();
    expect(html).toContain('Sign in to accept your judge invitation');
    expect(html).not.toContain('raw-secret');
  });

  it('does not expose the invitation token in the authenticated acceptance UI', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'judge-1', email: 'judge@example.com', fullName: 'Judge', isPlatformAdmin: false, status: 'active' },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });
    const html = renderPage();
    expect(html).toContain('Accept evaluation judge invitation');
    expect(html).not.toContain('raw-secret');
  });
});

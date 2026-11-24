import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';

const viewer = vi.hoisted(() => ({ signedIn: false, workspace: false }));
vi.mock('@/api/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: viewer.signedIn }) }));
vi.mock('@/api/OrgContext', () => ({ useOrg: () => ({ organisations: viewer.workspace ? [{}] : [] }) }));

function renderHome(signedIn = false, workspace = false) {
  viewer.signedIn = signedIn;
  viewer.workspace = workspace;
  return renderToStaticMarkup(<StaticRouter location="/"><HomePage /></StaticRouter>);
}

describe('ManageX homepage', () => {
  it('offers registration and public events to a visitor', () => {
    const html = renderHome();
    expect(html).toContain('href="/auth/register"');
    expect(html).toContain('href="/events"');
    expect(html).toContain('Browse events');
  });

  it('opens the applicable destination for returning participants and members', () => {
    expect(renderHome(true)).toContain('href="/events/dashboard"');
    expect(renderHome(true, true)).toContain('href="/app"');
  });

  it('exposes each scroll chapter and its matching product destination as native links', () => {
    const html = renderHome();
    for (const id of ['events', 'meetings', 'projects']) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`href="/modules#${id}"`);
    }
  });
});

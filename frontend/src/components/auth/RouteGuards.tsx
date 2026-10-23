import { Navigate, Outlet, useLocation, useParams, Link } from 'react-router-dom';
import { ShieldAlert, Building2, Trophy, Calendar, Plus } from 'lucide-react';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import { Button } from '@/components/ui/Button';

/**
 * Route guard requiring an active authenticated session.
 * Unauthenticated requests are redirected to /auth/login, preserving original location in state.
 */
export function RequireAuth() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-surface-subtle"
        role="status"
        aria-label="Verifying authentication"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-xs font-medium text-slate-500">Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/**
 * Route guard requiring verified platform administrator or support agent status.
 * Unauthenticated users are sent to /auth/login.
 * Authenticated non-platform users are redirected to the organisation workspace (/app).
 */
export function RequirePlatformAdmin() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-surface-subtle"
        role="status"
        aria-label="Verifying platform authorization"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-xs font-medium text-slate-500">Verifying platform authorization...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (!user.isPlatformAdmin) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}

/**
 * Route guard requiring active membership in the target organisation (:orgId).
 * Blocks cross-tenant intrusion, prevents participant/student persona leakage into
 * organisation workspaces, and renders an accessible fail-closed error state with appropriate CTAs.
 */
export function RequireOrgAccess() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { organisations, isLoading: isOrgLoading } = useOrg();
  const location = useLocation();

  const hasAccess = Boolean(orgId && organisations.some((o) => o.id === orgId && o.status === 'active'));

  if (isAuthLoading || isOrgLoading) {
    return (
      <div
        className="min-h-[50vh] flex items-center justify-center bg-surface-subtle"
        role="status"
        aria-label="Verifying organisation access"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span className="text-xs font-medium text-slate-500">Verifying organisation access...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (!hasAccess) {
    const isParticipantOnly = organisations.length === 0;

    return (
      <div className="max-w-2xl mx-auto my-12 p-6" data-testid="org-access-denied">
        <div className="rounded-xl border border-red-200 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Organisation Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
            {isParticipantOnly
              ? 'You are currently signed in with a Participant / Student account without an active organisation membership. Internal organisation modules (Meetings, Projects, Organiser Events) require verified organisation membership.'
              : 'You do not have active membership in this organisation. Access to this workspace and its internal modules is restricted to verified members.'}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {isParticipantOnly ? (
              <>
                <Link to="/events/dashboard">
                  <Button variant="primary" className="gap-2">
                    <Trophy className="h-4 w-4" />
                    <span>Go to Participant Dashboard</span>
                  </Button>
                </Link>
                <Link to="/events">
                  <Button variant="outline" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Browse Public Events</span>
                  </Button>
                </Link>
                <Link to="/app/organisations">
                  <Button variant="ghost" className="gap-2 text-slate-600">
                    <Plus className="h-4 w-4" />
                    <span>Create Organisation</span>
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/app">
                  <Button variant="primary" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    <span>Return to Your Workspace</span>
                  </Button>
                </Link>
                <Link to="/app/organisations">
                  <Button variant="outline" className="gap-2">
                    <span>View Your Organisations ({organisations.length})</span>
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

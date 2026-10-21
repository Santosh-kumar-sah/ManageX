import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/api/AuthContext';

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

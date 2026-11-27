import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Building2, ShieldCheck, UserCheck } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

interface InvitationDetails {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  organisation: {
    id: string;
    name: string;
    slug: string;
  };
  invitedByName: string;
  role: {
    slug: string;
    name: string;
  };
}

export function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { switchOrg, refreshOrganisations } = useOrg();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function fetchInvitation() {
      if (!token) {
        setErrorMsg('This invitation link is incomplete.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setErrorMsg(null);
        const res = await apiClient<{ invitation: InvitationDetails }>(`/invitations/${token}`);
        if (res.data?.invitation) {
          setInvitation(res.data.invitation);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('This invitation could not be opened. It may have expired.');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchInvitation();
  }, [token]);

  async function handleAccept() {
    if (!token) return;

    try {
      setIsAccepting(true);
      setErrorMsg(null);
      const res = await apiClient<{ organisationId: string }>(`/invitations/${token}/accept`, {
        method: 'POST',
      });

      setIsSuccess(true);
      await refreshOrganisations();
      if (res.data?.organisationId) {
        await switchOrg(res.data.organisationId);
      }
      setTimeout(() => {
        navigate('/app');
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to accept invitation. Please try again.');
      }
    } finally {
      setIsAccepting(false);
    }
  }

  const isEmailMatching =
    isAuthenticated &&
    user &&
    invitation &&
    user.email.toLowerCase() === invitation.email.toLowerCase();

  const isExpired = invitation && (invitation.status === 'expired' || new Date(invitation.expiresAt) <= new Date());
  const isRevoked = invitation && invitation.status === 'revoked';
  const isAlreadyAccepted = invitation && invitation.status === 'accepted';

  return (
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <div className="h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
          {isSuccess ? (
            <ShieldCheck className="h-6 w-6 text-green-600" />
          ) : (
            <Building2 className="h-6 w-6" />
          )}
        </div>
        <h1 className="mx-auth-title">
          {isSuccess ? 'Welcome to the team' : 'Workspace invitation'}
        </h1>
        <CardDescription>
          {isSuccess
            ? 'Opening your workspace…'
            : invitation
            ? `${invitation.invitedByName || 'A team administrator'} has invited you to join ${invitation.organisation.name}.`
            : 'Checking your invitation…'}
        </CardDescription>
      </CardHeader>

      <CardContent className="mx-auth-fields space-y-4">
        {errorMsg && (
          <Alert variant="error" title="Couldn’t open invitation">
            {errorMsg}
          </Alert>
        )}

        {isSuccess && (
          <Alert variant="success" title="Invitation accepted">
            You have successfully joined <strong>{invitation?.organisation.name}</strong> with the role {invitation?.role.name}.
          </Alert>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading invitation details…</div>
        ) : invitation ? (
          <div className="space-y-4">
            {/* Metadata Overview */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2.5 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Workspace</span>
                <span className="font-semibold text-slate-800">{invitation.organisation.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Your role</span>
                <Badge variant="brand">{invitation.role.name}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Invited email</span>
                <span className="font-mono text-slate-700">{invitation.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Expires</span>
                <span className="text-slate-600">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Status Checks */}
            {isExpired && (
              <Alert variant="warning" title="Invitation expired">
                This invitation expired on {new Date(invitation.expiresAt).toLocaleDateString()}. Please request a new invitation from your team administrator.
              </Alert>
            )}

            {isRevoked && (
              <Alert variant="error" title="Invitation withdrawn">
                An administrator has withdrawn this invitation.
              </Alert>
            )}

            {isAlreadyAccepted && (
              <Alert variant="info" title="Already accepted">
                This invitation has already been accepted. Sign in to open the workspace.
              </Alert>
            )}

            {/* Not Authenticated State */}
            {!isAuthenticated && !isExpired && !isRevoked && !isAlreadyAccepted && (
              <div className="space-y-3">
                <Alert variant="info" title="Sign in to join">
                  To accept this invitation, you must sign in or register using the invited email address (<strong>{invitation.email}</strong>).
                </Alert>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Link to={`/auth/login?returnUrl=/invitations/${token}/accept`} className="mx-auth-link">Sign in</Link>
                  <Link to={`/auth/register?email=${encodeURIComponent(invitation.email)}`} className="mx-auth-link mx-auth-link-solid">Create account</Link>
                </div>
              </div>
            )}

            {/* Email Mismatch State */}
            {isAuthenticated && !isEmailMatching && !isExpired && !isRevoked && !isAlreadyAccepted && (
              <div className="space-y-3">
                <Alert variant="warning" title="Switch accounts to join">
                  This invitation is for <strong>{invitation.email}</strong>, but you are currently signed in as <strong>{user?.email}</strong>.
                  You must switch accounts to accept this invitation.
                </Alert>
                <Button variant="outline" size="sm" onClick={() => logout()} className="w-full text-sm gap-1.5">
                  <span>Sign out and switch accounts</span>
                </Button>
              </div>
            )}

            {/* Ready to Accept State */}
            {isEmailMatching && !isExpired && !isRevoked && !isAlreadyAccepted && !isSuccess && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-sm text-slate-600 bg-emerald-50/60 p-2.5 rounded border border-emerald-200">
                  <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Signed in as <strong>{user?.email}</strong>.</span>
                </div>
                <Button
                  className="w-full"
                  onClick={handleAccept}
                  isLoading={isAccepting}
                >
                  Join workspace
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="mx-auth-actions flex justify-center border-t border-slate-100 pt-4">
        <Link to="/app" className="text-sm text-slate-500 hover:text-slate-800">
          Open workspace
        </Link>
      </CardFooter>
    </Card>
  );
}

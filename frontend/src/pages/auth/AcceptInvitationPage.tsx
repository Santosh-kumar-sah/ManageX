import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
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
        setErrorMsg('Invitation token is missing.');
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
          setErrorMsg('Failed to inspect invitation. It may be invalid or expired.');
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
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-card">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            {isSuccess ? (
              <ShieldCheck className="h-6 w-6 text-green-600" />
            ) : (
              <Building2 className="h-6 w-6" />
            )}
          </div>
          <CardTitle className="text-xl">
            {isSuccess ? 'Welcome to the Team!' : 'Organisation Invitation'}
          </CardTitle>
          <CardDescription>
            {isSuccess
              ? 'Your membership has been activated. Redirecting to workspace...'
              : invitation
              ? `${invitation.invitedByName || 'A team administrator'} has invited you to join ${invitation.organisation.name}.`
              : 'Checking invitation details...'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMsg && (
            <Alert variant="error" title="Invitation Error">
              {errorMsg}
            </Alert>
          )}

          {isSuccess && (
            <Alert variant="success" title="Invitation Accepted">
              You have successfully joined <strong>{invitation?.organisation.name}</strong> as an {invitation?.role.name}.
            </Alert>
          )}

          {isLoading ? (
            <div className="py-8 text-center text-xs text-slate-400">Verifying invitation details...</div>
          ) : invitation ? (
            <div className="space-y-4">
              {/* Metadata Overview */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-lg space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Workspace</span>
                  <span className="font-semibold text-slate-800">{invitation.organisation.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Assigned Role</span>
                  <Badge variant="brand">{invitation.role.name}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Issued To</span>
                  <span className="font-mono text-slate-700">{invitation.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Expires</span>
                  <span className="text-slate-600">{new Date(invitation.expiresAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Status Checks */}
              {isExpired && (
                <Alert variant="warning" title="Invitation Expired">
                  This invitation expired on {new Date(invitation.expiresAt).toLocaleDateString()}. Please request a new invitation from your team administrator.
                </Alert>
              )}

              {isRevoked && (
                <Alert variant="error" title="Invitation Revoked">
                  This invitation has been revoked by an organisation administrator.
                </Alert>
              )}

              {isAlreadyAccepted && (
                <Alert variant="info" title="Already Accepted">
                  This single-use invitation has already been accepted. You can log in directly to access the workspace.
                </Alert>
              )}

              {/* Not Authenticated State */}
              {!isAuthenticated && !isExpired && !isRevoked && !isAlreadyAccepted && (
                <div className="space-y-3">
                  <Alert variant="info" title="Sign In Required">
                    To accept this invitation, you must sign in or register using the invited email address (<strong>{invitation.email}</strong>).
                  </Alert>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <Link to={`/auth/login?returnUrl=/invitations/${token}/accept`}>
                      <Button variant="outline" className="w-full text-xs">
                        Sign In
                      </Button>
                    </Link>
                    <Link to={`/auth/register?email=${encodeURIComponent(invitation.email)}`}>
                      <Button className="w-full text-xs">
                        Create Account
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Email Mismatch State */}
              {isAuthenticated && !isEmailMatching && !isExpired && !isRevoked && !isAlreadyAccepted && (
                <div className="space-y-3">
                  <Alert variant="warning" title="Email Identity Mismatch">
                    This invitation was issued to <strong>{invitation.email}</strong>, but you are currently signed in as <strong>{user?.email}</strong>.
                    You must switch accounts to accept this invitation.
                  </Alert>
                  <Button variant="outline" size="sm" onClick={() => logout()} className="w-full text-xs gap-1.5">
                    <span>Sign Out & Switch Account</span>
                  </Button>
                </div>
              )}

              {/* Ready to Accept State */}
              {isEmailMatching && !isExpired && !isRevoked && !isAlreadyAccepted && !isSuccess && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600 bg-emerald-50/60 p-2.5 rounded border border-emerald-200">
                    <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Signed in as <strong>{user?.email}</strong>. You are authorized to join.</span>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleAccept}
                    isLoading={isAccepting}
                  >
                    Accept Invitation & Join Workspace
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-slate-100 pt-4">
          <Link to="/app" className="text-xs text-slate-500 hover:text-slate-800">
            Return to ManageX Dashboard
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

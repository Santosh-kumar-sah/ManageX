import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/Card';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';

export function AcceptEvaluationInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function acceptInvitation() {
    if (!token) return;
    setIsAccepting(true);
    setErrorMessage(null);
    try {
      await apiClient(`/invitations/evaluation/${token}/accept`, { method: 'POST' });
      setAccepted(true);
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'The evaluation invitation could not be accepted.');
    } finally {
      setIsAccepting(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <Card className="mx-auth-panel">
        <CardHeader className="mx-auth-heading">
          <h1 className="mx-auth-title">Sign in to accept your judge invitation</h1>
          <CardDescription>Use the verified email address on your invitation.</CardDescription>
        </CardHeader>
        <CardContent className="mx-auth-fields">
          <Link className="mx-auth-link mx-auth-link-solid" to="/auth/login">Sign in</Link>
        </CardContent>
      </Card>
    );
  }

  if (accepted) {
    return (
      <Card className="mx-auth-panel">
        <CardHeader className="mx-auth-heading">
          <h1 className="mx-auth-title">Judge invitation accepted</h1>
          <CardDescription>Open your judge workspace to see your assigned evaluations.</CardDescription>
        </CardHeader>
        <CardContent className="mx-auth-fields">
          <Button onClick={() => navigate('/app/judge/evaluations')}>Open judge workspace</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <h1 className="mx-auth-title">Accept evaluation judge invitation</h1>
        <CardDescription>
          Signed in as {user?.email || 'your account'}. Accept this invitation to review your assigned entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="mx-auth-fields space-y-4">
        {errorMessage && <Alert variant="error" title="Invitation could not be accepted">{errorMessage}</Alert>}
        <Button onClick={acceptInvitation} isLoading={isAccepting} disabled={!token}>Accept invitation</Button>
      </CardContent>
    </Card>
  );
}

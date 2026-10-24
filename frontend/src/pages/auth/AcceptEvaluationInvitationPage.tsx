import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
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
      <Card className="mx-auto mt-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>Sign in to accept your judge invitation</CardTitle>
          <CardDescription>An authenticated, verified account using the invited email is required.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/auth/login">
            <Button>Sign in</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (accepted) {
    return (
      <Card className="mx-auto mt-12 w-full max-w-lg">
        <CardHeader>
          <CardTitle>Judge invitation accepted</CardTitle>
          <CardDescription>Your panel-scoped assignment is active. Organisation membership was not created.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate('/app/judge/evaluations')}>Open judge workspace</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto mt-12 w-full max-w-lg">
      <CardHeader>
        <CardTitle>Accept evaluation judge invitation</CardTitle>
        <CardDescription>
          Signed in as {user?.email || 'your account'}. The server will verify your email, invitation expiry, and assignment scope.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage && <Alert variant="error" title="Invitation could not be accepted">{errorMessage}</Alert>}
        <Button onClick={acceptInvitation} isLoading={isAccepting} disabled={!token}>Accept invitation</Button>
      </CardContent>
    </Card>
  );
}

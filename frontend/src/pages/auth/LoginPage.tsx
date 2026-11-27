import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiClient('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const verifiedUser = await refreshUser();

      const fromState = (location.state as { from?: { pathname?: string } } | null)?.from;
      const targetPath = fromState?.pathname;

      if (verifiedUser?.isPlatformAdmin) {
        // Platform Admins / Support Agents default to /platform, or deep link
        const destination = targetPath || '/platform';
        navigate(destination, { replace: true });
      } else {
        // Regular users route to targetPath if provided
        if (targetPath && !targetPath.startsWith('/platform')) {
          navigate(targetPath, { replace: true });
        } else {
          // If no deep link, check if user has organisation memberships
          try {
            const orgsRes = await apiClient<{ organisations: unknown[] }>('/organisations');
            if (orgsRes.data?.organisations && orgsRes.data.organisations.length > 0) {
              navigate('/app', { replace: true });
            } else {
              // Participant with no organisation membership defaults to participant dashboard
              navigate('/events/dashboard', { replace: true });
            }
          } catch {
            navigate('/events/dashboard', { replace: true });
          }
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unable to sign in right now. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <h1 className="mx-auth-title">Sign In to ManageX</h1>
        <CardDescription>
          Access your events and workspaces.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="mx-auth-fields space-y-4">
          {errorMessage && (
            <Alert variant="error" title="Couldn’t sign in">
              {errorMessage}
            </Alert>
          )}

          <FormField label="Email address" htmlFor="email" required>
            <Input
              id="email"
              autoComplete="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </FormField>

          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </FormField>

          <div className="flex items-center justify-end text-sm">
            <Link to="/auth/forgot-password" className="text-brand-600 hover:text-brand-700 font-medium">
              Forgot password?
            </Link>
          </div>
        </CardContent>
        <CardFooter className="mx-auth-actions flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="text-sm text-center text-slate-500">
            Don't have an account?{' '}
            <Link to="/auth/register" className="text-brand-600 hover:text-brand-700 font-semibold">
              Register
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
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
        setErrorMessage('Unable to connect to authentication service. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Sign In to ManageX</CardTitle>
          <CardDescription>
            Enter your email and password to access your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <Alert variant="error" title="Sign In Failed">
                {errorMessage}
              </Alert>
            )}

            <FormField label="Email address" htmlFor="email" required>
              <Input
                id="email"
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </FormField>

            <div className="flex items-center justify-end text-xs">
              <Link to="/auth/forgot-password" className="text-brand-600 hover:text-brand-700 font-medium">
                Forgot password?
              </Link>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
            <div className="text-xs text-center text-slate-500">
              Don't have an account?{' '}
              <Link to="/auth/register" className="text-brand-600 hover:text-brand-700 font-semibold">
                Register
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}


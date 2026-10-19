import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiClient('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to send recovery instructions. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Password Recovery</CardTitle>
          <CardDescription>
            Enter your account email to receive a password recovery link.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <Alert variant="error" title="Error">
                {errorMessage}
              </Alert>
            )}

            {submitted ? (
              <Alert variant="success" title="Recovery Requested">
                If an account exists for {email}, instructions to reset your password have been dispatched.
              </Alert>
            ) : (
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
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {!submitted && (
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Sending Link...' : 'Send Recovery Link'}
              </Button>
            )}
            <Link to="/auth/login" className="w-full">
              <Button variant="ghost" className="w-full text-xs">
                Back to Sign In
              </Button>
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenParam);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiClient('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to reset password. The link may be expired or invalid.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
          <CardDescription>
            Choose a new strong password for your ManageX account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <Alert variant="error" title="Reset Failed">
                {errorMessage}
              </Alert>
            )}

            {submitted ? (
              <Alert variant="success" title="Password Reset Complete">
                Your password has been updated. All previous sessions have been invalidated.
              </Alert>
            ) : (
              <>
                {!tokenParam && (
                  <FormField label="Reset Token" htmlFor="token" required>
                    <Input
                      id="token"
                      placeholder="Paste your reset token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </FormField>
                )}
                <FormField
                  label="New Password"
                  htmlFor="password"
                  helperText="Must be at least 10 characters with upper, lower, number, and special character."
                  required
                >
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </FormField>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {!submitted ? (
              <Button type="submit" className="w-full" disabled={isLoading || !password || !token}>
                {isLoading ? 'Resetting Password...' : 'Reset Password'}
              </Button>
            ) : (
              <Link to="/auth/login" className="w-full">
                <Button className="w-full">
                  Sign In with New Password
                </Button>
              </Link>
            )}
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}


import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
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
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <h1 className="mx-auth-title">Forgot your password?</h1>
        <CardDescription>
          Enter your email to request a password reset.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="mx-auth-fields space-y-4">
          {errorMessage && (
            <Alert variant="error" title="Error">
              {errorMessage}
            </Alert>
          )}

          {submitted ? (
            <Alert variant="success" title="Request received">
              If {email} belongs to a ManageX account, check its inbox for instructions.
            </Alert>
          ) : (
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
          )}
        </CardContent>
        <CardFooter className="mx-auth-actions flex flex-col gap-3">
          {!submitted && (
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Requesting…' : 'Request reset link'}
            </Button>
          )}
          <Link to="/auth/login" className="mx-auth-link w-full">Back to sign in</Link>
        </CardFooter>
      </form>
    </Card>
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
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <h1 className="mx-auth-title">Choose a new password</h1>
        <CardDescription>
          Use a password you don’t use for other accounts.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="mx-auth-fields space-y-4">
          {errorMessage && (
            <Alert variant="error" title="Couldn’t reset password">
              {errorMessage}
            </Alert>
          )}

          {submitted ? (
            <Alert variant="success" title="Password updated">
              Sign in again with your new password on any devices you use.
            </Alert>
          ) : (
            <>
              {!tokenParam && (
                <FormField label="Reset code" htmlFor="token" required>
                  <Input
                    id="token"
                    placeholder="Paste the code from your reset link"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </FormField>
              )}
              <FormField
                label="New password"
                htmlFor="password"
                helperText="Use at least 10 characters, including an uppercase letter, a lowercase letter, a number and a symbol."
                required
              >
                <Input
                  id="password"
                  autoComplete="new-password"
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
        <CardFooter className="mx-auth-actions flex flex-col gap-3">
          {!submitted ? (
            <Button type="submit" className="w-full" disabled={isLoading || !password || !token}>
              {isLoading ? 'Saving…' : 'Save new password'}
            </Button>
          ) : (
            <Link to="/auth/login" className="mx-auth-link mx-auth-link-solid w-full">Sign in with your new password</Link>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

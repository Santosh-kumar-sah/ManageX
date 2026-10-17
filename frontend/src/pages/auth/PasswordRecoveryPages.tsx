import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
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
            <Alert variant="info" title="Phase 1 UI Shell">
              Password recovery workflows are UI placeholders for Phase 1. Expiring single-use reset tokens will be implemented in Phase 3.
            </Alert>

            {submitted ? (
              <Alert variant="success" title="Recovery Requested">
                If an account exists for {email}, a recovery link will be sent without disclosing account existence.
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
                />
              </FormField>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {!submitted && (
              <Button type="submit" className="w-full">
                Send Recovery Link
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
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
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
            <Alert variant="info" title="Phase 1 UI Shell">
              Reset password token validation and server-side session revocation will be implemented in Phase 3.
            </Alert>

            {submitted ? (
              <Alert variant="success" title="Password Reset Complete">
                Your password has been updated. All previous sessions have been invalidated.
              </Alert>
            ) : (
              <FormField label="New Password" htmlFor="password" helperText="Must be at least 10 characters." required>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </FormField>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            {!submitted ? (
              <Button type="submit" className="w-full">
                Reset Password
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

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RegisterPage() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<'individual' | 'organisation'>('individual');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    if (accountType === 'organisation' && !orgName.trim()) {
      setErrorMessage('Enter a name for your organisation.');
      setIsLoading(false);
      return;
    }

    try {
      await apiClient('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: name,
          email,
          password,
          accountType,
          organisationName: accountType === 'organisation' ? orgName.trim() : undefined,
        }),
      });
      navigate(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unable to complete registration. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <h1 className="mx-auth-title">Create your account</h1>
        <CardDescription>
          {accountType === 'organisation'
            ? 'Create a workspace to host events, plan meetings and manage projects.'
            : 'Register for events and join hackathons as a participant.'}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="mx-auth-fields space-y-4">
          {errorMessage && (
            <Alert variant="error" title="Couldn’t create account">
              {errorMessage}
            </Alert>
          )}

          {/* Account Type Selector Toggle */}
          <div role="group" aria-label="Account type" className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg text-sm font-medium">
            <button
              type="button"
              aria-pressed={accountType === 'individual'}
              disabled={isLoading}
              onClick={() => setAccountType('individual')}
              className={cn(
                'py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5',
                accountType === 'individual'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <User className="h-3.5 w-3.5" />
              <span>Participant</span>
            </button>
            <button
              type="button"
              aria-pressed={accountType === 'organisation'}
              disabled={isLoading}
              onClick={() => setAccountType('organisation')}
              className={cn(
                'py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5',
                accountType === 'organisation'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Organisation</span>
            </button>
          </div>

          <FormField label="Full name" htmlFor="name" required>
            <Input
              id="name"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
            />
          </FormField>

          {accountType === 'organisation' && (
            <FormField
              label="Organisation name"
              htmlFor="orgName"
              helperText="You’ll be the owner of this workspace."
              required
            >
              <Input
                id="orgName"
                autoComplete="organization"
                placeholder="Your organisation name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                disabled={isLoading}
              />
            </FormField>
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

          <FormField
            label="Password"
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
        </CardContent>
        <CardFooter className="mx-auth-actions flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading
              ? 'Creating account…'
              : accountType === 'organisation'
              ? 'Create organisation account'
              : 'Create account'}
          </Button>
          <div className="text-sm text-center text-slate-500">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-brand-600 hover:text-brand-700 font-semibold">
              Sign In
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

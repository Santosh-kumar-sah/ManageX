import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
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
      setErrorMessage('Organisation name is required when registering as an organisation.');
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
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create Account</CardTitle>
          <CardDescription>
            {accountType === 'organisation'
              ? 'Register your company or institution to host events, manage meetings, and collaborate with teams.'
              : 'Create your ManageX account to participate in events and join hackathons.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <Alert variant="error" title="Registration Error">
                {errorMessage}
              </Alert>
            )}

            {/* Account Type Selector Toggle */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium">
              <button
                type="button"
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

            <FormField label="Full Name" htmlFor="name" required>
              <Input
                id="name"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </FormField>

            {accountType === 'organisation' && (
              <FormField
                label="Organisation / Company Name"
                htmlFor="orgName"
                helperText="Your organisation workspace will be created and you will be the Organisation Owner."
                required
              >
                <Input
                  id="orgName"
                  placeholder="e.g. Acme Corporation, Tech Labs"
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
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading
                ? 'Creating Account...'
                : accountType === 'organisation'
                ? 'Create Organisation Account'
                : 'Create Account'}
            </Button>
            <div className="text-xs text-center text-slate-500">
              Already have an account?{' '}
              <Link to="/auth/login" className="text-brand-600 hover:text-brand-700 font-semibold">
                Sign In
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}


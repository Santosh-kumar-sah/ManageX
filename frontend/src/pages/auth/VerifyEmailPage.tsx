import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';
import { MailCheck, CheckCircle2 } from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [tokenInput, setTokenInput] = useState(tokenParam);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tokenParam) {
      handleVerify(tokenParam);
    }
  }, [tokenParam]);

  async function handleVerify(tokenToVerify: string) {
    if (!tokenToVerify) return;
    setIsVerifying(true);
    setErrorMessage(null);

    try {
      await apiClient('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: tokenToVerify }),
      });
      setIsSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Couldn’t verify your email. Check that your verification link is current.');
      }
    } finally {
      setIsVerifying(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleVerify(tokenInput);
  }

  return (
    <Card className="mx-auth-panel">
      <CardHeader className="mx-auth-heading">
        <div className="h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
          {isSuccess ? <CheckCircle2 className="h-6 w-6 text-green-600" /> : <MailCheck className="h-6 w-6" />}
        </div>
        <h1 className="mx-auth-title">
          {isSuccess ? 'Email verified' : 'Verify your email'}
        </h1>
        <CardDescription>
          {isSuccess
            ? 'You can now sign in to ManageX.'
            : emailParam
            ? `Check the inbox for ${emailParam}. Open your verification link or enter its code below.`
            : 'Open the link in your verification email or enter the code from the link.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="mx-auth-fields space-y-4">
        {errorMessage && (
          <Alert variant="error" title="Couldn’t verify email">
            {errorMessage}
          </Alert>
        )}

        {!isSuccess && !tokenParam && (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <FormField label="Verification code" htmlFor="token" required>
              <Input
                id="token"
                placeholder="Code from your verification link"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
                disabled={isVerifying}
              />
            </FormField>
            <Button type="submit" className="w-full" disabled={isVerifying || !tokenInput}>
              {isVerifying ? 'Verifying…' : 'Verify email'}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter className="mx-auth-actions flex flex-col gap-2">
        <Link to="/auth/login" className={isSuccess ? 'mx-auth-link mx-auth-link-solid w-full' : 'mx-auth-link w-full'}>
            {isSuccess ? 'Sign in' : 'Back to sign in'}
          </Link>
      </CardFooter>
    </Card>
  );
}

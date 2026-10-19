import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
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
        setErrorMessage('Failed to verify email. The token may be expired or invalid.');
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
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center shadow-card">
        <CardHeader className="space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            {isSuccess ? <CheckCircle2 className="h-6 w-6 text-green-600" /> : <MailCheck className="h-6 w-6" />}
          </div>
          <CardTitle className="text-xl">
            {isSuccess ? 'Email Verified Successfully!' : 'Verify Your Email'}
          </CardTitle>
          <CardDescription>
            {isSuccess
              ? 'Your account is now active. You may sign in to access your organisation workspace.'
              : emailParam
              ? `We sent a verification link to ${emailParam}. Please click the link or paste your token below.`
              : 'Please enter the verification token received in your email.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="error" title="Verification Failed">
              {errorMessage}
            </Alert>
          )}

          {isSuccess && (
            <Alert variant="success" title="Ready to Sign In">
              Your email address has been verified. You can now log in to ManageX.
            </Alert>
          )}

          {!isSuccess && !tokenParam && (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <FormField label="Verification Token" htmlFor="token" required>
                <Input
                  id="token"
                  placeholder="Paste your 64-character token"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  required
                  disabled={isVerifying}
                />
              </FormField>
              <Button type="submit" className="w-full" disabled={isVerifying || !tokenInput}>
                {isVerifying ? 'Verifying...' : 'Verify Token'}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link to="/auth/login" className="w-full">
            <Button variant={isSuccess ? 'primary' : 'outline'} className="w-full">
              {isSuccess ? 'Proceed to Sign In' : 'Back to Sign In'}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}


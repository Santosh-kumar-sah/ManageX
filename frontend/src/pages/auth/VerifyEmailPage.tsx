import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { MailCheck } from 'lucide-react';

export function VerifyEmailPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center shadow-card">
        <CardHeader className="space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <MailCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Verify Your Email</CardTitle>
          <CardDescription>
            A verification link is dispatched to your registered email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info" title="Phase 1 Placeholder Shell">
            In Phase 1, email delivery and cryptographic verification tokens are simulated. Token generation and SMTP delivery will be integrated in Phase 3.
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Link to="/auth/login" className="w-full">
            <Button variant="outline" className="w-full">
              Back to Sign In
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

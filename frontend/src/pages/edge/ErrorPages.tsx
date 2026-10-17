import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/Card';
import { ShieldAlert, AlertTriangle, FileQuestion } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center p-6 shadow-card">
        <CardHeader className="space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
            <FileQuestion className="h-6 w-6 text-slate-600" />
          </div>
          <CardTitle className="text-2xl font-bold">404 - Page Not Found</CardTitle>
          <CardDescription>
            The page you are looking for does not exist or may have been moved.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center pt-2">
          <Link to="/">
            <Button>Return to Home</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center p-6 shadow-card">
        <CardHeader className="space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">403 - Access Denied</CardTitle>
          <CardDescription>
            You do not have the required permissions or active module entitlement to access this resource.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center gap-3 pt-2">
          <Link to="/app">
            <Button variant="outline">Back to Workspace</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export function ErrorPage({ message = 'An unexpected application error occurred.' }: { message?: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center p-6 shadow-card">
        <CardHeader className="space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">Application Error</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center gap-3 pt-2">
          <Button onClick={() => window.location.reload()}>Reload Application</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Brand } from '@/components/ui/Brand';
import { Button, buttonStyles } from '@/components/ui/Button';

function RecoveryPage({ title, message, children }: { title: string; message: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-50 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <Link to="/" aria-label="ManageX home"><Brand /></Link>
        <div className="mx-auto mt-[16vh] max-w-xl rounded-2xl border border-brand-100 bg-white p-7 shadow-subtle sm:p-12">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600">{message}</p>
          <div className="mt-7 flex flex-wrap gap-3">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <RecoveryPage title="Page not found" message="This link may be out of date. You can find your team’s work in your workspace or browse public events.">
      <Link to="/app" className={buttonStyles()}>Go to workspace <ArrowRight size={16} aria-hidden="true" /></Link>
      <Link to="/events" className={buttonStyles({ variant: 'outline' })}>Browse events</Link>
    </RecoveryPage>
  );
}

export function ForbiddenPage() {
  return (
    <RecoveryPage title="Access is restricted" message="Ask your workspace administrator to check your role and access to this tool.">
      <Link to="/app" className={buttonStyles()}>Back to workspace</Link>
    </RecoveryPage>
  );
}

export function ErrorPage({ message = 'Try loading the page again.' }: { message?: string }) {
  return (
    <RecoveryPage title="We couldn’t load this page" message={message}>
      <Button onClick={() => window.location.reload()}>Reload page</Button>
    </RecoveryPage>
  );
}

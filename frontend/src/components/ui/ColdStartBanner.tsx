import { useEffect, useState } from 'react';
import { subscribeToColdStart, type ColdStartStatus } from '@/api/client';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Non-intrusive status banner displaying cold-start waking state and error guidance.
 * Adheres strictly to docs/deployment.md Section 4 and ADR-018.
 */
export function ColdStartBanner() {
  const [status, setStatus] = useState<ColdStartStatus>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    return subscribeToColdStart((newStatus, msg) => {
      setStatus(newStatus);
      if (msg) setMessage(msg);
    });
  }, []);

  if (status === 'idle') return null;

  if (status === 'waking') {
    return (
      <div
        role="status"
        className="bg-brand-50 border-b border-brand-200 text-brand-900 px-4 py-2 text-xs sm:text-sm flex items-center justify-center gap-2 sticky top-0 z-50 animate-in slide-in-from-top-1"
      >
        <Loader2 className="h-4 w-4 animate-spin text-brand-600 shrink-0" aria-hidden="true" />
        <span className="font-medium">{message || 'ManageX service is waking up, please wait a moment...'}</span>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div
        role="alert"
        className="bg-rose-50 border-b border-rose-200 text-rose-900 px-4 py-2 text-xs sm:text-sm flex items-center justify-between gap-2 sticky top-0 z-50 animate-in slide-in-from-top-1"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
          <span className="font-medium">{message || 'Service did not respond in time.'}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs font-semibold text-rose-700 underline hover:text-rose-900 focus-visible:outline-none"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  return null;
}

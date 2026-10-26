import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id?: string;
  type?: 'success' | 'error' | 'info';
  message: string;
  durationMs?: number;
  onClose: () => void;
}

export function Toast({
  type = 'success',
  message,
  durationMs = 3500,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(() => {
      onClose();
    }, durationMs);

    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  const icons = {
    success: <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />,
    info: <Info className="h-4 w-4 text-brand-600 shrink-0" />,
  };

  const borderStyles = {
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
    error: 'border-red-200 bg-red-50/90 text-red-900',
    info: 'border-brand-200 bg-brand-50/90 text-brand-900',
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 p-3 px-4 rounded-lg border shadow-md transition-all text-sm max-w-md ${borderStyles[type]}`}
      data-testid="toast-notification"
    >
      <div className="flex items-center gap-2.5">
        {icons[type]}
        <span className="font-medium">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close notification"
        className="p-1 rounded hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-auto"
      aria-label="Notifications"
    >
      {children}
    </div>
  );
}

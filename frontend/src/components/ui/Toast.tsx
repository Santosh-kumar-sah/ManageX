import React, { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  id?: string;
  type?: 'success' | 'error' | 'info';
  message: string;
  durationMs?: number;
  onClose: () => void;
}

export function Toast({
  id,
  type = 'success',
  message,
  durationMs = 5000,
  onClose,
}: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (durationMs <= 0) return;

    let startTime = Date.now();
    let remaining = durationMs;
    let paused = false;

    const tick = () => {
      if (!paused && progressRef.current) {
        const elapsed = Date.now() - startTime;
        remaining = durationMs - elapsed;
        const pct = Math.max(0, (remaining / durationMs) * 100);
        progressRef.current.style.width = `${pct}%`;
      }
      if (remaining > 0) {
        timerRef.current = setTimeout(tick, 50);
      } else {
        onClose();
      }
    };

    timerRef.current = setTimeout(tick, 50);

    const handleMouseEnter = () => { paused = true; };
    const handleMouseLeave = () => { paused = false; startTime = Date.now() - (durationMs - remaining); };

    const el = progressRef.current;
    el?.addEventListener('mouseenter', handleMouseEnter);
    el?.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      el?.removeEventListener('mouseenter', handleMouseEnter);
      el?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [durationMs, onClose]);

  const icons = {
    success: <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />,
    error: <AlertCircle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />,
    info: <Info className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />,
  };

  const borderStyles = {
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
    error: 'border-red-200 bg-red-50/90 text-red-900',
    info: 'border-brand-200 bg-brand-50/90 text-brand-900',
  };

  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex items-center justify-between gap-3 p-3 px-4 rounded-lg border shadow-md transition-all text-sm max-w-md ${borderStyles[type]} relative overflow-hidden`}
      data-testid="toast-notification"
    >
      {/* Progress bar */}
      <div className="absolute top-0 left-0 h-1 bg-white/30" />
      <div
        ref={progressRef}
        className="absolute top-0 left-0 h-1 bg-white transition-all duration-[5000ms] ease-linear w-full"
      />

      <div className="flex items-center gap-2.5 flex-1">
        {icons[type]}
        <span className="font-medium">{message}</span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close notification"
        className="p-1 rounded hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 pointer-events-auto"
      aria-label="Notifications"
    >
      {children}
    </div>
  );
}

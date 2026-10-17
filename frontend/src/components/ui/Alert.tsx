import React from 'react';
import { cn } from '@/lib/utils';
import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
}

export function Alert({
  variant = 'info',
  title,
  children,
  className,
  ...props
}: AlertProps) {
  const icons = {
    info: <Info className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />,
    success: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />,
    error: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" aria-hidden="true" />,
  };

  const variants = {
    info: 'bg-brand-50/50 border-brand-200 text-brand-900',
    success: 'bg-emerald-50/50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50/50 border-amber-200 text-amber-900',
    error: 'bg-rose-50/50 border-rose-200 text-rose-900',
  };

  return (
    <div
      role="alert"
      className={cn('flex gap-3 rounded-md border p-4 text-sm', variants[variant], className)}
      {...props}
    >
      {icons[variant]}
      <div className="flex-1 space-y-1">
        {title && <h5 className="font-semibold leading-tight">{title}</h5>}
        <div className="text-slate-600 text-xs sm:text-sm">{children}</div>
      </div>
    </div>
  );
}

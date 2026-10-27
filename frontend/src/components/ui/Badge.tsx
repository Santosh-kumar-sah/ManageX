import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}

export function Badge({
  className,
  variant = 'neutral',
  children,
  ...props
}: BadgeProps) {
  const variants = {
    neutral: 'bg-surface-subtle text-slate-600 border border-border',
    brand: 'bg-brand-50 text-brand-700 border border-brand-100',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-100',
    warning: 'bg-accent-50 text-accent-900 border border-accent-100',
    danger: 'bg-destructive/10 text-destructive border border-destructive/20',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-medium select-none',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

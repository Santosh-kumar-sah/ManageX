import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', hasError = false, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        disabled={disabled}
        aria-invalid={hasError ? true : undefined}
        className={cn(
          'flex h-9 w-full rounded-md border bg-white px-3 py-1 text-sm text-slate-900 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          hasError
            ? 'border-red-400 focus-visible:ring-red-500'
            : 'border-border focus-visible:ring-brand-500 hover:border-slate-300',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

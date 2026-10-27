import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, disabled, children, iconLeft, iconRight, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';

    const variants = {
      primary: 'bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900 focus-visible:ring-brand-500 border border-transparent shadow-subtle',
      secondary: 'bg-surface-subtle text-slate-800 hover:bg-brand-50 active:bg-brand-100 focus-visible:ring-brand-500 border border-border',
      outline: 'border border-border bg-white text-slate-700 hover:bg-slate-50 active:bg-surface-subtle focus-visible:ring-brand-500 shadow-subtle',
      ghost: 'text-slate-600 hover:bg-surface-subtle active:bg-slate-200 focus-visible:ring-brand-500',
      destructive: 'bg-destructive text-white hover:bg-destructive/90 active:bg-destructive focus-visible:ring-destructive border border-transparent shadow-subtle',
    };

    const sizes = {
      sm: 'h-8 px-2.5 text-xs rounded-sm gap-1.5',
      md: 'h-9 px-3.5 text-sm rounded-md gap-2',
      lg: 'h-11 px-4 text-base rounded-lg gap-2.5',
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? true : undefined}
        aria-disabled={disabled || isLoading ? true : undefined}
        {...props}
      >
        {isLoading && (
          <Loader2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {iconLeft && !isLoading && <span className="shrink-0">{iconLeft}</span>}
        {children}
        {iconRight && !isLoading && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

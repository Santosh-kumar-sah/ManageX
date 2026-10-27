import React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  error,
  helperText,
  required,
  className,
  children,
}: FormFieldProps) {
  const hasError = Boolean(error);
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const helperId = htmlFor ? `${htmlFor}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement, {
            id: htmlFor,
            'aria-describedby': describedBy,
            'aria-invalid': hasError || undefined,
          })
        : children}
      {error ? (
        <p id={errorId} className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}

import React from 'react';
import { cn } from '@/lib/utils';
import { Input } from './Input';
import { Select } from './Select';
import { Textarea } from './Textarea';

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
  const generatedId = React.useId();
  const child = React.isValidElement<React.HTMLAttributes<HTMLElement>>(children) ? children : null;
  const fieldId = htmlFor ?? child?.props.id ?? generatedId;
  const messageId = error || helperText ? fieldId + '-message' : undefined;
  // Some fields wrap several controls. Keep the label pointed at the caller's input in those cases.
  const isControl = child && (child.type === Input || child.type === Select || child.type === Textarea
    || child.type === 'input' || child.type === 'select' || child.type === 'textarea');
  const control = isControl ? React.cloneElement(child, {
    id: fieldId,
    'aria-describedby': [child.props['aria-describedby'], messageId].filter(Boolean).join(' ') || undefined,
    'aria-invalid': error ? true : child.props['aria-invalid'],
  }) : children;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={fieldId}
          className="block text-sm font-medium text-slate-700"
        >
          {label}
          {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={messageId} className="text-xs text-red-600 font-medium" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}

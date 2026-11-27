import React, { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

const openDialogs: HTMLDivElement[] = [];

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const dialogId = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(dialog);
    document.body.classList.add('mx-dialog-open');
    dialog.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== dialog || !dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]'
        )).filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      const wasTop = openDialogs[openDialogs.length - 1] === dialog;
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      document.body.classList.toggle('mx-dialog-open', openDialogs.length > 0);
      document.removeEventListener('keydown', handleKeyDown);
      if (wasTop && opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 bg-slate-900/40 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby={title ? dialogId + '-title' : undefined}
      aria-describedby={description ? dialogId + '-description' : undefined}
    >
      <div className="flex min-h-full items-center justify-center py-2 sm:py-4">
        <div
          className={cn(
            'relative w-full max-w-lg rounded-lg border border-border bg-white p-6 shadow-lg duration-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col my-auto',
            className
          )}
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-sm p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 z-10"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>

          {title && (
            <h2 id={dialogId + '-title'} className="text-lg font-semibold text-slate-900 mb-1 pr-6 shrink-0">
              {title}
            </h2>
          )}
          {description && (
            <p id={dialogId + '-description'} className="text-sm text-slate-500 mb-4 shrink-0">{description}</p>
          )}

          <div className="mt-2 overflow-y-auto min-h-0 flex-1 pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'primary';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} description={description}>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

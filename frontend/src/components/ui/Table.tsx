import React from 'react';
import { cn } from '@/lib/utils';
import { FolderOpen } from 'lucide-react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  emptyState?: React.ReactNode;
}

export function Table({ className, emptyState, children, ...props }: TableProps) {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="relative w-full overflow-auto rounded-lg border border-border">
      {hasChildren ? (
        <table className={cn('w-full caption-bottom text-sm text-left', className)} {...props}>
          {children}
        </table>
      ) : emptyState ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-border bg-white">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 border border-slate-100">
            <FolderOpen className="h-10 w-10 text-slate-400 stroke-1" />
          </div>
          <h4 className="text-base font-semibold text-slate-900 mb-1">{'No items found'}</h4>
          <p className="text-sm text-slate-500 max-w-sm">{emptyState}</p>
        </div>
      ) : (
        <table className={cn('w-full caption-bottom text-sm text-left', className)} {...props}>
          {children}
        </table>
      )}
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('bg-slate-50 border-b border-border', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-100',
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, scope = 'col', ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'h-10 px-4 text-xs font-semibold uppercase tracking-wider text-slate-500 align-middle [&:has([role=checkbox])]:pr-0',
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('p-4 align-middle text-slate-700 [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

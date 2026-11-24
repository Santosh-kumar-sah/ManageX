import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 30" fill="currentColor" className={cn('h-6 w-8 shrink-0', className)}>
      <path d="M0 13 10 3v16L0 29zM10 3l10 10v14L10 17zM20 13 39 0v28L29 18l-9 9z" />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return <span className={cn('inline-flex items-center gap-2 font-bold text-2xl leading-none tracking-[-.065em]', className)}><BrandMark />ManageX</span>;
}

import { cn } from '@/lib/utils';

export function SkipLink({ href = '#main-content', label = 'Skip to main content', className }: { href?: string; label?: string; className?: string }) {
  return (
    <a
      href={href}
      className={cn(
        'skip-link',
        className
      )}
    >
      {label}
    </a>
  );
}

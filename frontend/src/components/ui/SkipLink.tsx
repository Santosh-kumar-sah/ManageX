import { cn } from '@/lib/utils';

export interface SkipLinkProps {
  href?: string;
  label?: string;
  className?: string;
}

export function SkipLink({ href = '#main-content', label = 'Skip to main content', className }: SkipLinkProps) {
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

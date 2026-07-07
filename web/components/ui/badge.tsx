import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'destructive' | 'info' | 'outline';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/25',
  destructive: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
  info: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20',
  outline: 'ring-1 ring-inset ring-border text-muted-foreground',
};

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Consistent status → badge mapping across the app. */
export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'READY':
    case 'ACTIVE':
    case 'SENT':
    case 'WON':
    case 'OPEN':
      return 'success';
    case 'ENRICHING':
    case 'WARMUP':
    case 'PAUSED':
    case 'QUEUED':
    case 'CALL_BOOKED':
      return 'warning';
    case 'DO_NOT_CONTACT':
    case 'BOUNCED':
    case 'ERROR':
    case 'FAILED':
    case 'LOST':
      return 'destructive';
    case 'NEW':
    case 'REPLIED':
    case 'COMPLETED':
    case 'RECEIVED':
      return 'info';
    default:
      return 'neutral';
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{status.toLowerCase().replace(/_/g, ' ')}</Badge>;
}

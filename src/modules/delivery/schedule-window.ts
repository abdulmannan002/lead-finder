/** FR-6.1 schedule window checks (pure). Shape per docs/02 M3 ruling. */

export interface ScheduleWindow {
  /** 0–6, Sunday–Saturday. */
  days: number[];
  startHour: number;
  /** Exclusive; 24 = end of day. */
  endHour: number;
  timezone?: string;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(timezone: string, now: Date): { dow: number; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
  }
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '12');
  return { dow: DOW[weekday] ?? 1, hour };
}

/** No window means "always" (FR-6.1 makes it optional until activation UX demands it). */
export function isWithinWindow(
  window: ScheduleWindow | null | undefined,
  fallbackTimezone: string,
  now = new Date(),
): boolean {
  if (!window) return true;
  const { dow, hour } = localParts(window.timezone || fallbackTimezone || 'UTC', now);
  return window.days.includes(dow) && hour >= window.startHour && hour < window.endHour;
}

import { isWithinWindow, ScheduleWindow } from './schedule-window';

// 2026-07-08 is a Wednesday. 12:00 UTC.
const WED_NOON_UTC = new Date('2026-07-08T12:00:00Z');

describe('isWithinWindow (FR-6.1)', () => {
  it('no window means always sendable', () => {
    expect(isWithinWindow(null, 'UTC', WED_NOON_UTC)).toBe(true);
    expect(isWithinWindow(undefined, 'UTC', WED_NOON_UTC)).toBe(true);
  });

  it('matches day-of-week and hour range in the given timezone', () => {
    const window: ScheduleWindow = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, timezone: 'UTC' };
    expect(isWithinWindow(window, 'UTC', WED_NOON_UTC)).toBe(true);
  });

  it('rejects outside the hour range (endHour exclusive)', () => {
    const window: ScheduleWindow = { days: [3], startHour: 9, endHour: 12, timezone: 'UTC' };
    expect(isWithinWindow(window, 'UTC', WED_NOON_UTC)).toBe(false);
  });

  it('rejects on excluded days', () => {
    const weekendOnly: ScheduleWindow = { days: [0, 6], startHour: 0, endHour: 24, timezone: 'UTC' };
    expect(isWithinWindow(weekendOnly, 'UTC', WED_NOON_UTC)).toBe(false);
  });

  it('evaluates in the window timezone (12:00 UTC = 17:00 in Karachi)', () => {
    const nineToFive: ScheduleWindow = { days: [3], startHour: 9, endHour: 17, timezone: 'Asia/Karachi' };
    expect(isWithinWindow(nineToFive, 'UTC', WED_NOON_UTC)).toBe(false); // 17:00 — window closed
    const nineToSix: ScheduleWindow = { days: [3], startHour: 9, endHour: 18, timezone: 'Asia/Karachi' };
    expect(isWithinWindow(nineToSix, 'UTC', WED_NOON_UTC)).toBe(true);
  });

  it('falls back to the tenant timezone when the window has none', () => {
    const window: ScheduleWindow = { days: [3], startHour: 16, endHour: 18 };
    expect(isWithinWindow(window, 'Asia/Karachi', WED_NOON_UTC)).toBe(true); // 17:00 local
    expect(isWithinWindow(window, 'UTC', WED_NOON_UTC)).toBe(false); // 12:00 UTC
  });

  it('survives a bogus timezone by falling back to UTC', () => {
    const window: ScheduleWindow = { days: [3], startHour: 11, endHour: 13, timezone: 'Not/AZone' };
    expect(isWithinWindow(window, 'Also/Bogus', WED_NOON_UTC)).toBe(true);
  });
});

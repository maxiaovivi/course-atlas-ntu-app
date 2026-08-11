export type CalendarEvent = {
  id: string;
  courseCode: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  kind: 'event' | 'deadline';
};

export type CalendarStatus = {
  state: 'idle' | 'running' | 'success' | 'error';
  attemptedAt: string | null;
  lastSuccessAt: string | null;
  eventCount: number;
  errorCode: string | null;
};

export type CalendarPayload = {
  version: 1;
  updatedAt: string | null;
  timezone: 'Asia/Singapore';
  source: 'NTULearn shared calendar';
  ignoredRecurring: number;
  events: CalendarEvent[];
  status: CalendarStatus;
};

export const emptyCalendar: CalendarPayload = {
  version: 1,
  updatedAt: null,
  timezone: 'Asia/Singapore',
  source: 'NTULearn shared calendar',
  ignoredRecurring: 0,
  events: [],
  status: { state: 'idle', attemptedAt: null, lastSuccessAt: null, eventCount: 0, errorCode: null },
};

const CALENDAR_COURSES = new Set(['EE6221', 'EE6406', 'EE6407', 'EE6497', 'NTU']);
const STATUS_STATES = new Set(['idle', 'running', 'success', 'error']);

function isInstant(value: unknown) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function isCalendarDate(value: unknown) {
  if (typeof value !== 'string') return false;
  const match = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function eventTime(event: CalendarEvent) {
  return Date.parse(event.allDay ? `${event.start}T00:00:00+08:00` : event.start);
}

export function singaporeDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function upcomingCalendarEvents(calendar: CalendarPayload, now = new Date(), limit = 6) {
  const startOfToday = new Date(`${singaporeDateKey(now)}T00:00:00+08:00`).getTime();
  const end = startOfToday + 14 * 24 * 60 * 60 * 1000;
  return calendar.events
    .filter((event) => {
      const time = eventTime(event);
      return Number.isFinite(time) && time >= (event.allDay ? startOfToday : now.getTime()) && time < end;
    })
    .sort((left, right) => eventTime(left) - eventTime(right))
    .slice(0, limit);
}

export function isCalendarPayload(value: unknown): value is CalendarPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CalendarPayload>;
  if (payload.version !== 1 || payload.timezone !== 'Asia/Singapore' || payload.source !== 'NTULearn shared calendar') return false;
  if (payload.updatedAt !== null && !isInstant(payload.updatedAt)) return false;
  if (!Number.isInteger(payload.ignoredRecurring) || Number(payload.ignoredRecurring) < 0 || Number(payload.ignoredRecurring) > 2000
    || !Array.isArray(payload.events) || payload.events.length > 512 || !payload.status || typeof payload.status !== 'object') return false;
  const status = payload.status as Partial<CalendarStatus>;
  if (!STATUS_STATES.has(String(status.state))
    || (status.attemptedAt !== null && !isInstant(status.attemptedAt))
    || (status.lastSuccessAt !== null && !isInstant(status.lastSuccessAt))
    || !Number.isInteger(status.eventCount) || Number(status.eventCount) < 0
    || (status.errorCode !== null && (typeof status.errorCode !== 'string' || !/^[a-z_]{3,48}$/.test(status.errorCode)))) return false;
  return payload.events.every((event) => {
    if (!event || typeof event !== 'object' || typeof event.allDay !== 'boolean') return false;
    const startValid = event.allDay ? isCalendarDate(event.start) : isInstant(event.start);
    const endValid = event.end === null || (event.allDay ? isCalendarDate(event.end) : isInstant(event.end));
    return /^[a-z0-9-]{20,40}$/.test(event.id)
      && CALENDAR_COURSES.has(event.courseCode)
      && typeof event.title === 'string' && event.title.length > 0 && event.title.length <= 180
      && startValid && endValid && (event.kind === 'event' || event.kind === 'deadline');
  });
}

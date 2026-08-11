export type LocationStatus = 'confirmed' | 'pending';

export type CourseSession = {
  code: string;
  name: string;
  zh: string;
  weekday: number;
  dayLabel: string;
  start: string;
  end: string;
  section: string | null;
  category: 'General' | 'Specialized';
  location: string;
  locationStatus: LocationStatus;
  locationSource: string;
  note: string | null;
};

export type ScheduleException = {
  id: string;
  courseCode: string;
  date: string;
  start: string;
  end: string;
  label: string;
  location: string;
  note: string;
  replacesDate?: string;
};

export type SchedulePayload = {
  version: number;
  academicYear: string;
  semester: number;
  timezone: 'Asia/Singapore';
  updatedAt: string;
  source: string;
  courses: CourseSession[];
  exceptions: ScheduleException[];
};

export const emptySchedule: SchedulePayload = {
  version: 1,
  academicYear: '',
  semester: 0,
  timezone: 'Asia/Singapore',
  updatedAt: '',
  source: '',
  courses: [],
  exceptions: [],
};

export type NextClass = {
  course: CourseSession;
  dateKey: string;
  dayText: string;
  start: string;
  end: string;
  location: string;
  label?: string;
  minutesAway: number;
};

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function singaporeParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: WEEKDAYS[value('weekday')] ?? 0,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function todayInSingapore(now = new Date()) {
  const current = singaporeParts(now);
  return dateKey(current.year, current.month, current.day);
}

export function getNextClass(schedule: SchedulePayload, now = new Date()): NextClass | null {
  const current = singaporeParts(now);
  const todayUtc = Date.UTC(current.year, current.month - 1, current.day);
  const candidates: NextClass[] = [];

  for (const exception of schedule.exceptions) {
    const [year, month, day] = exception.date.split('-').map(Number);
    const dayDifference = Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86_400_000);
    const endMinutes = timeToMinutes(exception.end);
    if (dayDifference < 0 || (dayDifference === 0 && endMinutes <= current.minutes)) continue;
    const course = schedule.courses.find((item) => item.code === exception.courseCode);
    if (!course) continue;
    candidates.push({
      course,
      dateKey: exception.date,
      dayText: dayDifference === 0 ? '今天' : dayDifference === 1 ? '明天' : exception.date.slice(5).replace('-', '月') + '日',
      start: exception.start,
      end: exception.end,
      location: exception.location,
      label: exception.label,
      minutesAway: dayDifference * 1440 + timeToMinutes(exception.start) - current.minutes,
    });
  }

  for (const course of schedule.courses) {
    let dayDifference = (course.weekday - current.weekday + 7) % 7;
    if (dayDifference === 0 && timeToMinutes(course.end) <= current.minutes) dayDifference = 7;
    const occurrence = new Date(todayUtc + dayDifference * 86_400_000);
    const occurrenceKey = dateKey(occurrence.getUTCFullYear(), occurrence.getUTCMonth() + 1, occurrence.getUTCDate());
    if (schedule.exceptions.some((item) => item.courseCode === course.code && item.replacesDate === occurrenceKey)) continue;
    candidates.push({
      course,
      dateKey: occurrenceKey,
      dayText: dayDifference === 0 ? '今天' : dayDifference === 1 ? '明天' : course.dayLabel,
      start: course.start,
      end: course.end,
      location: course.location,
      minutesAway: dayDifference * 1440 + timeToMinutes(course.start) - current.minutes,
    });
  }

  return candidates.sort((left, right) => left.minutesAway - right.minutesAway)[0] ?? null;
}

export function isSchedulePayload(value: unknown): value is SchedulePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SchedulePayload>;
  return payload.version === 1
    && payload.timezone === 'Asia/Singapore'
    && typeof payload.academicYear === 'string'
    && typeof payload.semester === 'number'
    && typeof payload.updatedAt === 'string'
    && typeof payload.source === 'string'
    && Array.isArray(payload.courses)
    && Array.isArray(payload.exceptions);
}

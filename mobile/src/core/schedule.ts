export type LocationStatus = 'confirmed' | 'pending';

export type AgendaItemType = 'quiz' | 'ca' | 'deadline' | 'academic' | 'notice';
export type AgendaCertainty = 'confirmed' | 'inferred' | 'pending';

export type AgendaItem = {
  id: string;
  type: AgendaItemType;
  courseCode: string | null;
  title: string;
  start: string | null;
  end: string | null;
  location: string | null;
  certainty: AgendaCertainty;
  detail: string | null;
};

export type TeachingBreak = {
  id: string;
  start: string;
  end: string;
  label: string;
};

export type AcademicCalendarKind = 'holiday' | 'recess' | 'exam' | 'vacation';

export type AcademicCalendarItem = {
  id: string;
  kind: AcademicCalendarKind;
  title: string;
  start: string;
  end: string;
};

export type CourseBrief = {
  courseCode: string;
  previousDate: string | null;
  previous: string[];
  nextDate: string | null;
  next: string[];
};

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
  teachingStart?: string;
  teachingEnd?: string;
  teachingBreaks?: TeachingBreak[];
  academicCalendar?: AcademicCalendarItem[];
  courseBriefs?: CourseBrief[];
  courses: CourseSession[];
  exceptions: ScheduleException[];
  agenda?: AgendaItem[];
};

export const emptySchedule: SchedulePayload = {
  version: 1,
  academicYear: '',
  semester: 0,
  timezone: 'Asia/Singapore',
  updatedAt: '',
  source: '',
  teachingBreaks: [],
  academicCalendar: [],
  courseBriefs: [],
  courses: [],
  exceptions: [],
  agenda: [],
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

  const isTeachingDay = (key: string) => {
    if (schedule.teachingStart && key < schedule.teachingStart) return false;
    if (schedule.teachingEnd && key > schedule.teachingEnd) return false;
    return !(schedule.teachingBreaks ?? []).some((item) => key >= item.start && key <= item.end);
  };

  for (const course of schedule.courses) {
    let firstDifference = (course.weekday - current.weekday + 7) % 7;
    if (firstDifference === 0 && timeToMinutes(course.end) <= current.minutes) firstDifference = 7;
    for (let week = 0; week < 24; week += 1) {
      const dayDifference = firstDifference + week * 7;
      const occurrence = new Date(todayUtc + dayDifference * 86_400_000);
      const occurrenceKey = dateKey(occurrence.getUTCFullYear(), occurrence.getUTCMonth() + 1, occurrence.getUTCDate());
      if (!isTeachingDay(occurrenceKey)) continue;
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
      break;
    }
  }

  return candidates.sort((left, right) => left.minutesAway - right.minutesAway)[0] ?? null;
}

export function isSchedulePayload(value: unknown): value is SchedulePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SchedulePayload>;
  const coursesValid = Array.isArray(payload.courses) && payload.courses.length <= 32
    && payload.courses.every((item) => isCourseSession(item));
  const courseCodes = new Set<string>(coursesValid
    ? (payload.courses as CourseSession[]).map((item) => item.code)
    : []);
  const exceptionsValid = Array.isArray(payload.exceptions) && payload.exceptions.length <= 128
    && payload.exceptions.every((item) => isScheduleException(item, courseCodes));
  const agendaValid = payload.agenda === undefined || (Array.isArray(payload.agenda) && payload.agenda.length <= 256
    && payload.agenda.every((item) => isAgendaItem(item)
      && (item.courseCode === null || courseCodes.has(item.courseCode))));
  const teachingBreaksValid = payload.teachingBreaks === undefined || (Array.isArray(payload.teachingBreaks)
    && payload.teachingBreaks.length <= 32
    && payload.teachingBreaks.every((item) => isTeachingBreak(item)));
  const academicCalendarValid = payload.academicCalendar === undefined || (Array.isArray(payload.academicCalendar)
    && payload.academicCalendar.length <= 64
    && payload.academicCalendar.every((item) => isAcademicCalendarItem(item))
    && new Set(payload.academicCalendar.map((item) => item.id)).size === payload.academicCalendar.length);
  const courseBriefsValid = payload.courseBriefs === undefined || (Array.isArray(payload.courseBriefs)
    && payload.courseBriefs.length <= 32
    && payload.courseBriefs.every((item) => isCourseBrief(item, courseCodes))
    && new Set(payload.courseBriefs.map((item) => item.courseCode)).size === payload.courseBriefs.length);
  const teachingBoundsValid = (payload.teachingStart === undefined && payload.teachingEnd === undefined)
    || (isAgendaDate(payload.teachingStart) && isAgendaDate(payload.teachingEnd)
      && typeof payload.teachingStart === 'string' && typeof payload.teachingEnd === 'string'
      && /^20\d{2}-\d{2}-\d{2}$/.test(payload.teachingStart)
      && /^20\d{2}-\d{2}-\d{2}$/.test(payload.teachingEnd)
      && payload.teachingStart <= payload.teachingEnd);
  return payload.version === 1
    && payload.timezone === 'Asia/Singapore'
    && typeof payload.academicYear === 'string' && payload.academicYear.length <= 32
    && Number.isInteger(payload.semester) && Number(payload.semester) >= 1 && Number(payload.semester) <= 3
    && typeof payload.updatedAt === 'string' && Number.isFinite(Date.parse(payload.updatedAt))
    && typeof payload.source === 'string' && payload.source.length > 0 && payload.source.length <= 240
    && coursesValid
    && exceptionsValid
    && agendaValid
    && teachingBreaksValid
    && academicCalendarValid
    && courseBriefsValid
    && teachingBoundsValid;
}

const AGENDA_TYPES = new Set<AgendaItemType>(['quiz', 'ca', 'deadline', 'academic', 'notice']);
const AGENDA_CERTAINTIES = new Set<AgendaCertainty>(['confirmed', 'inferred', 'pending']);
const ACADEMIC_CALENDAR_KINDS = new Set<AcademicCalendarKind>(['holiday', 'recess', 'exam', 'vacation']);
const ACADEMIC_CALENDAR_KEYS = new Set(['id', 'kind', 'title', 'start', 'end']);
const COURSE_BRIEF_KEYS = new Set(['courseCode', 'previousDate', 'previous', 'nextDate', 'next']);
const COURSE_CODE_PATTERN = /^[A-Z]{2,4}\d{4}[A-Z]?$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isText(value: unknown, max: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isCourseSession(value: unknown): value is CourseSession {
  if (!value || typeof value !== 'object') return false;
  const course = value as Partial<CourseSession>;
  return typeof course.code === 'string' && COURSE_CODE_PATTERN.test(course.code)
    && isText(course.name, 240) && isText(course.zh, 240)
    && Number.isInteger(course.weekday) && Number(course.weekday) >= 0 && Number(course.weekday) <= 6
    && isText(course.dayLabel, 8)
    && typeof course.start === 'string' && TIME_PATTERN.test(course.start)
    && typeof course.end === 'string' && TIME_PATTERN.test(course.end)
    && isNullableText(course.section, 80)
    && (course.category === 'General' || course.category === 'Specialized')
    && isText(course.location, 240)
    && (course.locationStatus === 'confirmed' || course.locationStatus === 'pending')
    && isText(course.locationSource, 240)
    && isNullableText(course.note, 500);
}

function isScheduleException(value: unknown, courseCodes: Set<string>): value is ScheduleException {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ScheduleException>;
  return typeof item.id === 'string' && /^[a-z0-9-]{8,120}$/.test(item.id)
    && typeof item.courseCode === 'string' && courseCodes.has(item.courseCode)
    && typeof item.date === 'string' && isAgendaDate(item.date)
    && typeof item.start === 'string' && TIME_PATTERN.test(item.start)
    && typeof item.end === 'string' && TIME_PATTERN.test(item.end)
    && isText(item.label, 120) && isText(item.location, 240) && isText(item.note, 500)
    && (item.replacesDate === undefined
      || (typeof item.replacesDate === 'string' && isAgendaDate(item.replacesDate)));
}

function isAgendaDate(value: unknown) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 40) return false;
  if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  }
  return Number.isFinite(Date.parse(value));
}

function isNullableText(value: unknown, max: number) {
  return value === null || (typeof value === 'string' && value.length <= max);
}

function isTeachingBreak(value: unknown): value is TeachingBreak {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TeachingBreak>;
  return typeof item.id === 'string' && /^[a-z0-9-]{8,120}$/.test(item.id)
    && typeof item.start === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(item.start) && isAgendaDate(item.start)
    && typeof item.end === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(item.end) && isAgendaDate(item.end)
    && item.start <= item.end
    && typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 120;
}

function isAcademicCalendarItem(value: unknown): value is AcademicCalendarItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AcademicCalendarItem>;
  const keys = Object.keys(value);
  return keys.length === ACADEMIC_CALENDAR_KEYS.size
    && keys.every((key) => ACADEMIC_CALENDAR_KEYS.has(key))
    && typeof item.id === 'string' && /^[a-z0-9-]{8,120}$/.test(item.id)
    && ACADEMIC_CALENDAR_KINDS.has(item.kind as AcademicCalendarKind)
    && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 120
    && typeof item.start === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(item.start) && isAgendaDate(item.start)
    && typeof item.end === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(item.end) && isAgendaDate(item.end)
    && item.start <= item.end;
}

function isCourseBrief(value: unknown, courseCodes: Set<string>): value is CourseBrief {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CourseBrief>;
  const keys = Object.keys(value);
  const validDate = (date: unknown): date is string | null => date === null
    || (typeof date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(date) && isAgendaDate(date));
  const validList = (list: unknown): list is string[] => Array.isArray(list)
    && list.length <= 3
    && list.every((entry) => typeof entry === 'string'
      && entry.length > 0 && entry.length <= 120 && entry.trim() === entry
      && !/[\u0000-\u001f\u007f]/.test(entry))
    && new Set(list).size === list.length;
  return keys.length === COURSE_BRIEF_KEYS.size
    && keys.every((key) => COURSE_BRIEF_KEYS.has(key))
    && typeof item.courseCode === 'string' && courseCodes.has(item.courseCode)
    && validDate(item.previousDate)
    && validList(item.previous)
    && validDate(item.nextDate)
    && validList(item.next)
    && (item.previous.length > 0 || item.next.length > 0)
    && ((item.previous.length === 0 && item.previousDate === null)
      || (item.previous.length > 0 && item.previousDate !== null))
    && ((item.next.length === 0 && item.nextDate === null)
      || (item.next.length > 0 && item.nextDate !== null))
    && (item.previousDate === null || item.nextDate === null || item.previousDate < item.nextDate);
}

export function isAgendaItem(value: unknown): value is AgendaItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AgendaItem>;
  return typeof item.id === 'string' && /^[a-z0-9-]{8,120}$/.test(item.id)
    && AGENDA_TYPES.has(item.type as AgendaItemType)
    && (item.courseCode === null || (typeof item.courseCode === 'string' && COURSE_CODE_PATTERN.test(item.courseCode)))
    && typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 180
    && isAgendaDate(item.start) && isAgendaDate(item.end)
    && isNullableText(item.location, 240)
    && AGENDA_CERTAINTIES.has(item.certainty as AgendaCertainty)
    && isNullableText(item.detail, 1000);
}

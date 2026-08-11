import { CalendarEvent, CalendarPayload, singaporeDateKey } from '@/core/calendar';
import { AgendaCertainty, AgendaItem, AgendaItemType, SchedulePayload } from '@/core/schedule';

export type AgendaViewItem = AgendaItem & {
  sourceLabel: string;
  allDay: boolean;
};

const TYPE_LABELS: Record<AgendaItemType, string> = {
  quiz: 'Quiz',
  ca: 'CA',
  deadline: '截止',
  academic: '校历',
  notice: '通知',
};

const CERTAINTY_LABELS: Record<AgendaCertainty, string> = {
  confirmed: '已确认',
  inferred: '推定',
  pending: '待公布',
};

function dateOnly(value: string) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(value);
}

function agendaTimestamp(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Date.parse(dateOnly(value) ? `${value}T00:00:00+08:00` : value);
}

function previousCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day) - 86_400_000);
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}-${String(previous.getUTCDate()).padStart(2, '0')}`;
}

function inclusiveCalendarEnd(start: string, end: string | null) {
  if (!end || !dateOnly(start) || !dateOnly(end)) return end;
  const inclusive = previousCalendarDate(end);
  return inclusive >= start ? inclusive : start;
}

function agendaDayKey(item: AgendaViewItem) {
  if (!item.start || !item.courseCode || !['quiz', 'ca', 'deadline'].includes(item.type)) return null;
  const day = dateOnly(item.start) ? item.start : singaporeDateKey(new Date(item.start));
  return `${item.courseCode}|${item.type}|${day}`;
}

function inferCalendarType(event: CalendarEvent): AgendaItemType {
  if (/\bquiz\b|测验/i.test(event.title)) return 'quiz';
  if (/(^|\W)ca\s*\d*($|\W)|continuous assessment/i.test(event.title)) return 'ca';
  return event.kind === 'deadline' ? 'deadline' : 'notice';
}

function calendarAgendaItem(event: CalendarEvent, sourceLabel: string): AgendaViewItem {
  return {
    id: `calendar-${event.id}`,
    type: inferCalendarType(event),
    courseCode: event.courseCode === 'NTU' ? null : event.courseCode,
    title: event.title,
    start: event.start,
    end: event.allDay ? inclusiveCalendarEnd(event.start, event.end) : event.end,
    location: null,
    certainty: 'confirmed',
    detail: null,
    sourceLabel,
    allDay: event.allDay,
  };
}

function scheduleAgendaItem(item: AgendaItem, sourceLabel: string): AgendaViewItem {
  return {
    ...item,
    id: `schedule-${item.id}`,
    sourceLabel,
    allDay: Boolean(item.start && dateOnly(item.start)),
  };
}

export function upcomingAgendaItems(
  schedule: SchedulePayload,
  calendar: CalendarPayload,
  now = new Date(),
  limit = 6,
) {
  const today = new Date(`${singaporeDateKey(now)}T00:00:00+08:00`).getTime();
  const scheduled = (schedule.agenda ?? []).map((item) => scheduleAgendaItem(item, schedule.source));
  const learned = calendar.events.map((event) => calendarAgendaItem(event, calendar.source));
  const scheduledKeys = new Set(scheduled.map(agendaDayKey).filter((key): key is string => Boolean(key)));

  return [...scheduled, ...learned.filter((item) => {
    const key = agendaDayKey(item);
    return !key || !scheduledKeys.has(key);
  })]
    .filter((item) => {
      if (!item.start) return true;
      const comparison = item.end ?? item.start;
      const time = agendaTimestamp(comparison);
      const threshold = item.allDay ? today : now.getTime();
      return Number.isFinite(time) && time >= threshold;
    })
    .sort((left, right) => {
      const timeDifference = agendaTimestamp(left.start) - agendaTimestamp(right.start);
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      return left.title.localeCompare(right.title, 'zh-CN');
    })
    .slice(0, limit);
}

export function agendaTypeLabel(type: AgendaItemType) {
  return TYPE_LABELS[type];
}

export function agendaCertaintyLabel(certainty: AgendaCertainty) {
  return CERTAINTY_LABELS[certainty];
}

export function agendaDateParts(item: Pick<AgendaViewItem, 'type' | 'start' | 'end' | 'allDay' | 'certainty' | 'location'>) {
  if (!item.start) return { date: '待定', time: '时间待公布' };
  const start = new Date(item.allDay ? `${item.start}T00:00:00+08:00` : item.start);
  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', month: 'numeric', day: 'numeric', weekday: 'short',
  });
  const date = dateFormatter.format(start);
  if (item.allDay) {
    const endDate = item.end && dateOnly(item.end)
      ? dateFormatter.format(new Date(`${item.end}T00:00:00+08:00`))
      : null;
    const dateRange = endDate && endDate !== date ? `${date} — ${endDate}` : date;
    if (item.type === 'quiz' || item.type === 'ca') {
      return { date, time: item.location?.includes('课堂内') ? '课堂内 · 具体时间待公布' : '具体时间待公布' };
    }
    if (item.type === 'deadline') return { date: dateRange, time: '具体截止时刻待公布' };
    return { date: dateRange, time: item.certainty === 'pending' ? '日期待确认' : '全天' };
  }
  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const startTime = timeFormatter.format(start);
  const endTime = item.end ? timeFormatter.format(new Date(item.end)) : null;
  const time = endTime ? `${startTime} — ${endTime}` : startTime;
  return { date, time: item.certainty === 'inferred' ? `约 ${time}` : time };
}

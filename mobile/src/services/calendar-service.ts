import AsyncStorage from '@react-native-async-storage/async-storage';

import { CalendarPayload, isCalendarPayload } from '@/core/calendar';

const CACHE_KEY = 'course-atlas.calendar.v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');

async function requestCalendar(path: string, method = 'GET'): Promise<CalendarPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 14_000 : 4_500);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const value: unknown = await response.json().catch(() => null);
    const calendar = method === 'POST' && value && typeof value === 'object'
      ? (value as { calendar?: unknown }).calendar
      : value;
    if (!response.ok || !isCalendarPayload(calendar)) throw new Error(`Calendar request failed: ${response.status}`);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(calendar));
    return calendar;
  } finally {
    clearTimeout(timeout);
  }
}

export async function readCachedCalendar(): Promise<CalendarPayload | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    return isCalendarPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function fetchCalendar() {
  return requestCalendar('/api/calendar');
}

export function refreshCalendar() {
  return requestCalendar('/api/calendar/refresh', 'POST');
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isSchedulePayload, SchedulePayload } from '@/core/schedule';

const CACHE_KEY = 'course-atlas.schedule.v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');

export type ScheduleSource = 'empty' | 'cache' | 'live';

export async function readCachedSchedule(): Promise<SchedulePayload | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed: unknown = JSON.parse(cached);
    return isSchedulePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchSchedule(): Promise<SchedulePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE_URL}/api/schedule`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Schedule request failed: ${response.status}`);
    const payload: unknown = await response.json();
    if (!isSchedulePayload(payload)) throw new Error('Schedule response is invalid');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyStudyCards, isStudyCardsPayload, StudyCardsPayload } from '@/core/study-cards';

const CACHE_KEY = 'course-atlas.study-cards.v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');
const MAX_RESPONSE_CHARS = 256 * 1024;

export type StudyCardSource = 'empty' | 'cache' | 'live';

function parseStudyCards(value: string): StudyCardsPayload | null {
  if (value.length === 0 || value.length > MAX_RESPONSE_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isStudyCardsPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCachedStudyCards() {
  try {
    const value = await AsyncStorage.getItem(CACHE_KEY);
    if (!value) return null;
    const parsed = parseStudyCards(value);
    if (!parsed) await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchStudyCards(): Promise<StudyCardsPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE_URL}/api/study-cards`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok || contentLength > MAX_RESPONSE_CHARS) throw new Error(`Study-card request failed: ${response.status}`);
    const cards = parseStudyCards(await response.text());
    if (!cards) throw new Error('Study-card response is invalid');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cards));
    return cards;
  } finally {
    clearTimeout(timeout);
  }
}

export { emptyStudyCards };

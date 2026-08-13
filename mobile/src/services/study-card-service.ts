import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyStudyCards, isStudyCardsPayload, StudyCardsPayload } from '@/core/study-cards';

const CACHE_KEY = 'course-atlas.study-cards.v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');
const MAX_RESPONSE_CHARS = 256 * 1024;
// Production latency probes measured ~3.0s / 6.0s / 17.2s; the previous 4.5s
// abort made slow-but-healthy responses look like failures and pinned the UI
// to stale cache. Cache paints first, so this fetch runs in the background
// and can afford to wait out a slow origin.
const FETCH_TIMEOUT_MS = 20_000;

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
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // A refresh must observe the latest R2 snapshot. The public endpoint may
    // otherwise legally serve a stale response for up to ten minutes, which
    // previously left an updated 108-card deck appearing as the cached 103.
    const response = await fetch(`${API_BASE_URL}/api/study-cards?refresh=${Date.now()}`, {
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

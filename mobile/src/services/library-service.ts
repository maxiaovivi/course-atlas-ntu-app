import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLibraryPayload, LibraryPayload } from '@/core/library';

const CACHE_KEY = 'course-atlas.library.v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');
const MAX_RESPONSE_CHARS = 1024 * 1024;

export type LibrarySource = 'empty' | 'cache' | 'live';

function parseLibrary(value: string): LibraryPayload | null {
  if (value.length === 0 || value.length > MAX_RESPONSE_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isLibraryPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readCachedLibrary(): Promise<LibraryPayload | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const library = parseLibrary(cached);
    if (!library) await AsyncStorage.removeItem(CACHE_KEY).catch(() => undefined);
    return library;
  } catch {
    return null;
  }
}

export async function fetchLibrary(): Promise<LibraryPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`${API_BASE_URL}/api/library`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (!response.ok || contentLength > MAX_RESPONSE_CHARS) {
      throw new Error(`Library request failed: ${response.status}`);
    }
    const library = parseLibrary(await response.text());
    if (!library) throw new Error('Library response is invalid');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(library));
    return library;
  } finally {
    clearTimeout(timeout);
  }
}

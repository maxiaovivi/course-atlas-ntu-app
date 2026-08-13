import AsyncStorage from '@react-native-async-storage/async-storage';

import { DeckCursor, isDeckCursor } from '@/core/deck';

const STORE_KEY = 'course-atlas.memory.deck.v1';
// Cursor key used by builds before the shuffled deck; read once for continuity.
const LEGACY_POSITION_KEY = 'course-atlas.memory.position.v1';

export type DeckState = {
  version: 1;
  home: DeckCursor | null;
  courses: Record<string, DeckCursor>;
  lastViewedId: string | null;
};

const emptyState = (): DeckState => ({ version: 1, home: null, courses: {}, lastViewedId: null });

function parseState(raw: string | null, legacyId: string | null): DeckState {
  const fallbackId = legacyId && /^[a-z0-9-]{8,96}$/.test(legacyId) ? legacyId : null;
  if (!raw) return { ...emptyState(), lastViewedId: fallbackId };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...emptyState(), lastViewedId: fallbackId };
    const value = parsed as Partial<DeckState>;
    if (value.version !== 1) return { ...emptyState(), lastViewedId: fallbackId };
    const courses: Record<string, DeckCursor> = {};
    if (value.courses && typeof value.courses === 'object') {
      for (const [code, cursor] of Object.entries(value.courses)) {
        if (/^[A-Z]{2}\d{4}$/.test(code) && isDeckCursor(cursor)) courses[code] = cursor;
      }
    }
    return {
      version: 1,
      home: isDeckCursor(value.home) ? value.home : null,
      courses,
      lastViewedId: typeof value.lastViewedId === 'string' && /^[a-z0-9-]{8,96}$/.test(value.lastViewedId)
        ? value.lastViewedId
        : fallbackId,
    };
  } catch {
    return { ...emptyState(), lastViewedId: fallbackId };
  }
}

let state: DeckState | null = null;
let loadPromise: Promise<DeckState> | null = null;

export function loadDeckState(): Promise<DeckState> {
  if (state) return Promise.resolve(state);
  if (!loadPromise) {
    loadPromise = Promise.all([
      AsyncStorage.getItem(STORE_KEY).catch(() => null),
      AsyncStorage.getItem(LEGACY_POSITION_KEY).catch(() => null),
    ]).then(([raw, legacyId]) => {
      state = state ?? parseState(raw, legacyId);
      return state;
    });
  }
  return loadPromise;
}

export function getDeckState(): DeckState | null {
  return state;
}

// Writes are chained on a single promise so they can never interleave, and
// coalesced so a burst of quick swipes produces one write of the newest state
// instead of a racing sequence that could resurrect an older cursor.
let writeChain: Promise<void> = Promise.resolve();
let writeQueued = false;

function persist() {
  if (writeQueued) return;
  writeQueued = true;
  writeChain = writeChain.then(async () => {
    writeQueued = false;
    if (!state) return;
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(state)).catch(() => undefined);
  });
}

// Callers must wait for loadDeckState first; mutating before hydration would
// risk overwriting the stored cursors with an empty document.
export function updateDeckState(mutate: (current: DeckState) => DeckState): DeckState {
  const current = state ?? emptyState();
  const next = mutate(current);
  if (state !== null && next !== current) {
    state = next;
    persist();
  }
  return next;
}

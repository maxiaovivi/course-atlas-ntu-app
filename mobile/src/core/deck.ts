// Seeded, deterministic review-deck ordering. All randomness flows from a
// stored integer seed, so a given (seed, card set) always yields the same
// order — nothing here may call Math.random().

export type DeckCard = { id: string; courseCode: string };

export type DeckCursor = {
  order: string[];
  index: number;
  seed: number;
  // Consecutive forward steps since the most recent backward gesture. A new
  // shuffle is earned only after a complete forward pass, so left→right at a
  // boundary remains reversible instead of unexpectedly changing the deck.
  forwardRun?: number;
};

// FNV-1a hash mixed with an existing seed; used to derive a deterministic
// seed for reconciliation inserts, so render-time reconciliation is pure.
export function deriveSeed(seed: number, text: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// mulberry32: small, fast, deterministic PRNG.
export function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(items: T[], rng: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Shuffle within each course, then interleave by drawing from the course with
// the lowest served/total ratio (ties broken by the rng), skipping the
// previous course whenever another course still has cards. This guarantees no
// two consecutive same-course cards while alternatives exist and keeps all
// four courses visible throughout the cycle instead of front-loading two.
export function buildDeckOrder(cards: DeckCard[], seed: number): string[] {
  const rng = createRng(seed);
  const groups = new Map<string, string[]>();
  for (const card of cards) {
    const group = groups.get(card.courseCode);
    if (group) group.push(card.id);
    else groups.set(card.courseCode, [card.id]);
  }
  const courses = Array.from(groups.keys()).sort();
  for (const course of courses) shuffleInPlace(groups.get(course)!, rng);
  const totals = new Map(courses.map((course) => [course, groups.get(course)!.length]));
  const served = new Map(courses.map((course) => [course, 0]));

  const order: string[] = [];
  let previous: string | null = null;
  let remaining = cards.length;
  while (remaining > 0) {
    let candidates = courses.filter((course) => groups.get(course)!.length > 0);
    if (candidates.length > 1 && previous !== null) {
      const others = candidates.filter((course) => course !== previous);
      if (others.length > 0) candidates = others;
    }
    let best = candidates[0];
    for (const course of candidates.slice(1)) {
      if (served.get(course)! * totals.get(best)! < served.get(best)! * totals.get(course)!) best = course;
    }
    const top = candidates.filter((course) => (
      served.get(course)! * totals.get(best)! === served.get(best)! * totals.get(course)!
    ));
    const pick = top[Math.floor(rng() * top.length)];
    order.push(groups.get(pick)!.pop()!);
    served.set(pick, served.get(pick)! + 1);
    previous = pick;
    remaining -= 1;
  }
  return order;
}

function sameIdSet(order: string[], cards: DeckCard[]) {
  if (order.length !== cards.length) return false;
  const ids = new Set(order);
  return cards.every((card) => ids.has(card.id));
}

// Reconcile a stored cursor with the current card set:
// - surviving ids keep their relative order and the visible card is preserved;
// - deleted ids are dropped; if the visible card was deleted, the cursor moves
//   to the next surviving id in the old order (wrapping);
// - new ids are seeded-inserted, preferring positions that do not create
//   consecutive same-course neighbours.
export function reconcileDeckCursor(cursor: DeckCursor, cards: DeckCard[], seedForNew: number): DeckCursor {
  if (cards.length === 0) return cursor;
  if (sameIdSet(cursor.order, cards)) {
    const index = Math.min(Math.max(cursor.index, 0), cursor.order.length - 1);
    return index === cursor.index ? cursor : { ...cursor, index };
  }

  const courseById = new Map(cards.map((card) => [card.id, card.courseCode]));
  const kept = cursor.order.filter((id) => courseById.has(id));
  if (kept.length === 0) {
    return { order: buildDeckOrder(cards, seedForNew), index: 0, seed: seedForNew };
  }

  const safeIndex = Math.min(Math.max(cursor.index, 0), cursor.order.length - 1);
  let currentId = cursor.order[safeIndex];
  if (!courseById.has(currentId)) {
    for (let step = 1; step <= cursor.order.length; step += 1) {
      const candidate = cursor.order[(safeIndex + step) % cursor.order.length];
      if (courseById.has(candidate)) {
        currentId = candidate;
        break;
      }
    }
  }

  const known = new Set(cursor.order);
  const rng = createRng(seedForNew);
  const fresh = shuffleInPlace(cards.filter((card) => !known.has(card.id)).map((card) => card.id), rng);
  const order = kept.slice();
  for (const id of fresh) {
    const course = courseById.get(id);
    const safePositions: number[] = [];
    for (let candidate = 0; candidate <= order.length; candidate += 1) {
      const before = candidate > 0 ? courseById.get(order[candidate - 1]) : null;
      const after = candidate < order.length ? courseById.get(order[candidate]) : null;
      if (before !== course && after !== course) safePositions.push(candidate);
    }
    const position = safePositions.length > 0
      ? safePositions[Math.floor(rng() * safePositions.length)]
      : Math.floor(rng() * (order.length + 1));
    order.splice(position, 0, id);
  }
  return { order, index: Math.max(0, order.indexOf(currentId)), seed: cursor.seed };
}

// Move the cursor one step. Completing a forward cycle generates a fresh
// order from nextSeed (never repeating the just-seen card first); wrapping
// backwards keeps the existing order untouched.
export function advanceDeckCursor(cursor: DeckCursor, direction: -1 | 1, cards: DeckCard[], nextSeed: number): DeckCursor {
  const size = cursor.order.length;
  if (size < 2) return cursor;
  const next = cursor.index + direction;
  if (direction === -1) {
    return { ...cursor, index: next >= 0 ? next : size - 1, forwardRun: 0 };
  }
  const forwardRun = Math.min(size, (cursor.forwardRun ?? 0) + 1);
  if (next < size) return { ...cursor, index: next, forwardRun };
  if (forwardRun < size) return { ...cursor, index: 0, forwardRun };

  const lastSeen = cursor.order[cursor.index];
  const order = buildDeckOrder(cards, nextSeed);
  if (order.length > 1 && order[0] === lastSeen) {
    [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
  }
  return { order, index: 0, seed: nextSeed, forwardRun: 0 };
}

const ID_PATTERN = /^[a-z0-9-]{8,96}$/;

export function isDeckCursor(value: unknown): value is DeckCursor {
  if (!value || typeof value !== 'object') return false;
  const cursor = value as Partial<DeckCursor>;
  return Array.isArray(cursor.order)
    && cursor.order.length > 0 && cursor.order.length <= 512
    && cursor.order.every((id) => typeof id === 'string' && ID_PATTERN.test(id))
    && new Set(cursor.order).size === cursor.order.length
    && Number.isInteger(cursor.index) && Number(cursor.index) >= 0 && Number(cursor.index) < cursor.order.length
    && Number.isInteger(cursor.seed) && Number(cursor.seed) >= 0
    && (cursor.forwardRun === undefined
      || (Number.isInteger(cursor.forwardRun) && Number(cursor.forwardRun) >= 0 && Number(cursor.forwardRun) <= cursor.order.length));
}

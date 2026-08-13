import assert from 'node:assert/strict';
import test from 'node:test';

import {
  advanceDeckCursor,
  buildDeckOrder,
  createRng,
  deriveSeed,
  isDeckCursor,
  reconcileDeckCursor,
} from '../src/core/deck.ts';

// Mirrors the live corpus shape: EE6221 24 / EE6406 23 / EE6407 32 / EE6497 29.
function makeCards(counts = { ee6221: 24, ee6406: 23, ee6407: 32, ee6497: 29 }) {
  const cards = [];
  for (const [course, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) {
      cards.push({ id: `${course}-card-${String(i).padStart(3, '0')}`, courseCode: course.toUpperCase() });
    }
  }
  return cards;
}

function courseOf(cards, id) {
  return cards.find((card) => card.id === id).courseCode;
}

test('buildDeckOrder is a deterministic permutation of the card ids', () => {
  const cards = makeCards();
  const first = buildDeckOrder(cards, 12345);
  const second = buildDeckOrder(cards, 12345);
  assert.deepEqual(first, second);
  assert.equal(first.length, cards.length);
  assert.equal(new Set(first).size, cards.length);
  assert.notDeepEqual(buildDeckOrder(cards, 54321), first);
});

test('buildDeckOrder never places two same-course cards next to each other', () => {
  const cards = makeCards();
  for (const seed of [1, 2, 3, 99, 2026]) {
    const order = buildDeckOrder(cards, seed);
    for (let i = 1; i < order.length; i += 1) {
      assert.notEqual(courseOf(cards, order[i - 1]), courseOf(cards, order[i]), `seed ${seed} position ${i}`);
    }
  }
});

test('buildDeckOrder keeps all four courses represented in every eight-card window', () => {
  const cards = makeCards();
  for (let seed = 0; seed < 200; seed += 1) {
    const order = buildDeckOrder(cards, seed);
    for (let i = 0; i + 7 < order.length; i += 1) {
      const courses = new Set(order.slice(i, i + 8).map((id) => courseOf(cards, id)));
      assert.equal(courses.size, 4, `seed ${seed} window ${i}`);
    }
  }
});

test('advanceDeckCursor steps forward and backward without reshuffling mid-cycle', () => {
  const cards = makeCards({ ee6221: 3, ee6406: 3 });
  const cursor = { order: buildDeckOrder(cards, 7), index: 2, seed: 7 };
  const forward = advanceDeckCursor(cursor, 1, cards, 999);
  assert.deepEqual(forward.order, cursor.order);
  assert.equal(forward.index, 3);
  const backward = advanceDeckCursor(cursor, -1, cards, 999);
  assert.deepEqual(backward.order, cursor.order);
  assert.equal(backward.index, 1);
});

test('advanceDeckCursor backward wrap keeps the existing order', () => {
  const cards = makeCards({ ee6221: 4, ee6406: 4 });
  const cursor = { order: buildDeckOrder(cards, 11), index: 0, seed: 11 };
  const wrapped = advanceDeckCursor(cursor, -1, cards, 999);
  assert.deepEqual(wrapped.order, cursor.order);
  assert.equal(wrapped.index, cursor.order.length - 1);
});

test('a backward boundary wrap followed by forward is reversible', () => {
  const cards = makeCards({ ee6221: 4, ee6406: 4 });
  const cursor = { order: buildDeckOrder(cards, 13), index: 0, seed: 13 };
  const backward = advanceDeckCursor(cursor, -1, cards, 999);
  const returned = advanceDeckCursor(backward, 1, cards, 888);
  assert.deepEqual(returned.order, cursor.order);
  assert.equal(returned.index, 0);
  assert.equal(returned.seed, cursor.seed);
});

test('advanceDeckCursor forward wrap reshuffles and never repeats the last-seen card first', () => {
  const cards = makeCards({ ee6221: 5, ee6406: 5 });
  const order = buildDeckOrder(cards, 21);
  const cursor = { order, index: order.length - 1, seed: 21, forwardRun: order.length - 1 };
  for (const nextSeed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const wrapped = advanceDeckCursor(cursor, 1, cards, nextSeed);
    assert.equal(wrapped.index, 0);
    assert.equal(wrapped.seed, nextSeed);
    assert.equal(new Set(wrapped.order).size, cards.length);
    assert.notEqual(wrapped.order[0], order[order.length - 1]);
    assert.deepEqual(advanceDeckCursor(cursor, 1, cards, nextSeed), wrapped);
  }
});

test('reconcileDeckCursor returns the same cursor object when nothing changed', () => {
  const cards = makeCards({ ee6221: 4, ee6406: 4 });
  const cursor = { order: buildDeckOrder(cards, 31), index: 5, seed: 31 };
  assert.equal(reconcileDeckCursor(cursor, cards, 777), cursor);
});

test('reconcileDeckCursor keeps the visible card and relative order across additions', () => {
  const before = makeCards({ ee6221: 4, ee6406: 4 });
  const cursor = { order: buildDeckOrder(before, 41), index: 3, seed: 41 };
  const visible = cursor.order[3];
  const after = [...before, { id: 'ee6407-card-900', courseCode: 'EE6407' }, { id: 'ee6407-card-901', courseCode: 'EE6407' }];
  const next = reconcileDeckCursor(cursor, after, 555);
  assert.equal(next.order[next.index], visible);
  assert.equal(next.order.length, after.length);
  const surviving = next.order.filter((id) => cursor.order.includes(id));
  assert.deepEqual(surviving, cursor.order);
  assert.deepEqual(reconcileDeckCursor(cursor, after, 555), next);
});

test('reconcileDeckCursor moves a deleted visible card to the next surviving old id', () => {
  const cards = makeCards({ ee6221: 3, ee6406: 3 });
  const cursor = { order: buildDeckOrder(cards, 51), index: 2, seed: 51 };
  const deleted = cursor.order[2];
  const expected = cursor.order[3];
  const remaining = cards.filter((card) => card.id !== deleted);
  const next = reconcileDeckCursor(cursor, remaining, 888);
  assert.equal(next.order[next.index], expected);
  assert.ok(!next.order.includes(deleted));
});

test('reconcileDeckCursor rebuilds from scratch when no stored id survives', () => {
  const cursor = { order: ['ee6221-card-000', 'ee6406-card-000'], index: 1, seed: 61 };
  const replacement = makeCards({ ee6407: 4, ee6497: 4 });
  const next = reconcileDeckCursor(cursor, replacement, 909);
  assert.equal(next.index, 0);
  assert.equal(next.seed, 909);
  assert.equal(new Set(next.order).size, replacement.length);
});

test('isDeckCursor accepts valid cursors and rejects malformed ones', () => {
  const valid = { order: ['ee6221-card-000', 'ee6406-card-001'], index: 1, seed: 42 };
  assert.ok(isDeckCursor(valid));
  assert.ok(!isDeckCursor(null));
  assert.ok(!isDeckCursor({ ...valid, index: 2 }));
  assert.ok(!isDeckCursor({ ...valid, index: -1 }));
  assert.ok(!isDeckCursor({ ...valid, seed: 1.5 }));
  assert.ok(isDeckCursor({ ...valid, forwardRun: 1 }));
  assert.ok(!isDeckCursor({ ...valid, forwardRun: 3 }));
  assert.ok(!isDeckCursor({ ...valid, forwardRun: -1 }));
  assert.ok(!isDeckCursor({ ...valid, order: [] }));
  assert.ok(!isDeckCursor({ ...valid, order: ['ee6221-card-000', 'ee6221-card-000'], index: 0 }));
  assert.ok(!isDeckCursor({ ...valid, order: ['SHOUTING-ID!', 'ee6406-card-001'] }));
});

test('deriveSeed and createRng are deterministic', () => {
  assert.equal(deriveSeed(7, 'abc'), deriveSeed(7, 'abc'));
  assert.notEqual(deriveSeed(7, 'abc'), deriveSeed(8, 'abc'));
  const a = createRng(1234);
  const b = createRng(1234);
  for (let i = 0; i < 32; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

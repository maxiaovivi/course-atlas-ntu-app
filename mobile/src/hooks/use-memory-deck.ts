/* eslint-disable react-hooks/set-state-in-effect -- Deck cursors follow asynchronously hydrated storage and backend data. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  advanceDeckCursor, buildDeckOrder, DeckCard, DeckCursor, deriveSeed, reconcileDeckCursor,
} from '@/core/deck';
import { StudyCard, studyCardCourses } from '@/core/study-cards';
import { getDeckState, loadDeckState, updateDeckState } from '@/services/deck-store';

// Entropy for brand-new cycles only; never called during render.
let seedCounter = 0;
function freshSeed() {
  seedCounter = (seedCounter + 1) & 0xffff;
  return (((Date.now() & 0xffffffff) ^ Math.imul(seedCounter, 0x9e3779b1)) >>> 0);
}

function useDeckHydration() {
  const [ready, setReady] = useState(() => getDeckState() !== null);
  useEffect(() => {
    let live = true;
    void loadDeckState().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  return ready;
}

function toDeckCards(cards: StudyCard[]): DeckCard[] {
  return cards.map((card) => ({ id: card.id, courseCode: card.courseCode }));
}

function idSignature(cards: DeckCard[]) {
  return cards.map((card) => card.id).join('\n');
}

export function useHomeDeck(cards: StudyCard[]) {
  // Home needs the hydrated cursor itself, not only a ready flag. Otherwise a
  // cold process could create a new seed before adopting the persisted order.
  const [ready, setReady] = useState(() => getDeckState() !== null);
  const [home, setHome] = useState<DeckCursor | null>(() => getDeckState()?.home ?? null);
  const deckCards = useMemo(() => toDeckCards(cards), [cards]);
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  useEffect(() => {
    let live = true;
    void loadDeckState().then((stored) => {
      if (!live) return;
      setHome(stored.home);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  // Pure, deterministic view of the stored cursor against the current card
  // set, so cache→live and pull-refresh never flash a wrong card while the
  // committed state catches up.
  const display = useMemo(() => {
    if (!home || deckCards.length === 0) return null;
    return reconcileDeckCursor(home, deckCards, deriveSeed(home.seed, idSignature(deckCards)));
  }, [home, deckCards]);

  // Commit: create the first-ever shuffled cycle, or persist reconciliation.
  useEffect(() => {
    if (!ready || deckCards.length === 0) return;
    if (!home) {
      const seed = freshSeed();
      let cursor: DeckCursor = { order: buildDeckOrder(deckCards, seed), index: 0, seed };
      const lastViewed = getDeckState()?.lastViewedId;
      if (lastViewed) {
        const at = cursor.order.indexOf(lastViewed);
        if (at > 0) cursor = { ...cursor, index: at };
      }
      setHome(updateDeckState((state) => ({ ...state, home: cursor })).home);
      return;
    }
    if (display && display !== home) {
      setHome(updateDeckState((state) => ({ ...state, home: display })).home);
    }
  }, [ready, deckCards, home, display]);

  // Adopt cursor movement made in the full-screen reader.
  useFocusEffect(useCallback(() => {
    const state = getDeckState();
    if (!state?.home) return;
    if (state.lastViewedId) {
      const at = state.home.order.indexOf(state.lastViewedId);
      if (at >= 0 && at !== state.home.index) {
        const moved = { ...state.home, index: at, forwardRun: 0 };
        setHome(updateDeckState((current) => ({ ...current, home: moved })).home);
        return;
      }
    }
    setHome(state.home);
  }, []));

  const move = useCallback((direction: -1 | 1) => {
    const seed = freshSeed();
    let moved = false;
    const next = updateDeckState((state) => {
      if (!state.home || state.home.order.length < 2) return state;
      const cursor = advanceDeckCursor(state.home, direction, deckCards, seed);
      if (cursor === state.home) return state;
      moved = true;
      return { ...state, home: cursor, lastViewedId: cursor.order[cursor.index] };
    });
    if (moved) setHome(next.home);
    return moved;
  }, [deckCards]);

  const card = display ? byId.get(display.order[display.index]) ?? null : null;
  return {
    ready,
    card,
    index: display?.index ?? 0,
    total: display?.order.length ?? 0,
    move,
  };
}

export function useReaderDeck(cards: StudyCard[], initialCardId?: string) {
  const ready = useDeckHydration();
  const deckCards = useMemo(() => toDeckCards(cards), [cards]);
  const byId = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const courses = useMemo(() => studyCardCourses(cards), [cards]);
  const initialCard = useMemo(
    () => cards.find((card) => card.id === initialCardId) ?? null,
    [cards, initialCardId],
  );
  const [course, setCourse] = useState('');
  const [cursor, setCursor] = useState<DeckCursor | null>(null);
  const appliedInitial = useRef(false);

  const activateCourse = useCallback((code: string, focusId: string | null) => {
    const courseCards = deckCards.filter((card) => card.courseCode === code);
    if (courseCards.length === 0) return;
    const next = updateDeckState((state) => {
      const existing = state.courses[code] ?? null;
      let resolved: DeckCursor;
      if (existing) {
        resolved = reconcileDeckCursor(existing, courseCards, deriveSeed(existing.seed, idSignature(courseCards)));
      } else {
        const seed = freshSeed();
        resolved = { order: buildDeckOrder(courseCards, seed), index: 0, seed };
      }
      if (focusId) {
        const at = resolved.order.indexOf(focusId);
        if (at >= 0 && at !== resolved.index) resolved = { ...resolved, index: at, forwardRun: 0 };
      }
      const lastViewedId = resolved.order[resolved.index];
      if (resolved === existing && lastViewedId === state.lastViewedId) return state;
      return { ...state, courses: { ...state.courses, [code]: resolved }, lastViewedId };
    });
    setCourse(code);
    setCursor(next.courses[code] ?? null);
  }, [deckCards]);

  // Open on the exact tapped card once; otherwise land on the first course.
  useEffect(() => {
    if (!ready || deckCards.length === 0) return;
    if (initialCard && !appliedInitial.current) {
      appliedInitial.current = true;
      activateCourse(initialCard.courseCode, initialCard.id);
      return;
    }
    const courseStillExists = courses.some((code) => code === course);
    if (course && courseStillExists) {
      // Reconcile the open course when data refreshes underneath the reader.
      activateCourse(course, null);
    } else if ((!initialCardId || !initialCard || !courseStillExists) && courses.length > 0) {
      // No requested card, or it no longer exists: land on the first course
      // instead of waiting forever for an id that will never arrive.
      activateCourse(courses[0], null);
    }
  }, [ready, deckCards, initialCard, initialCardId, course, courses, activateCourse]);

  const move = useCallback((direction: -1 | 1) => {
    if (!course) return false;
    const courseCards = deckCards.filter((card) => card.courseCode === course);
    const seed = freshSeed();
    let moved = false;
    const next = updateDeckState((state) => {
      const existing = state.courses[course];
      if (!existing || existing.order.length < 2) return state;
      const advanced = advanceDeckCursor(existing, direction, courseCards, seed);
      if (advanced === existing) return state;
      moved = true;
      return { ...state, courses: { ...state.courses, [course]: advanced }, lastViewedId: advanced.order[advanced.index] };
    });
    if (moved) setCursor(next.courses[course] ?? null);
    return moved;
  }, [course, deckCards]);

  const current = cursor ? byId.get(cursor.order[cursor.index]) ?? null : null;
  return {
    ready,
    courses,
    course,
    current,
    index: cursor?.index ?? 0,
    total: cursor?.order.length ?? 0,
    move,
    selectCourse: (code: string) => activateCourse(code, null),
  };
}

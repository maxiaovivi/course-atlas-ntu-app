/* eslint-disable react-hooks/set-state-in-effect -- The selected card follows asynchronously loaded backend data. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NativeMathFormula } from '@/components/native-math-formula';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { StudyCard, studyCardCourses, studyCardDeck, studyCardsForCourse } from '@/core/study-cards';

const POSITION_KEY = 'course-atlas.memory.position.v1';

export function MemoryCardCarousel({ cards, onOpen }: { cards: StudyCard[]; onOpen: (card: StudyCard) => void }) {
  const reducedMotion = useReducedMotion();
  const deck = useMemo(() => studyCardDeck(cards), [cards]);
  const [selectedId, setSelectedId] = useState(deck[0]?.id ?? '');
  const dragX = useSharedValue(0);
  const index = Math.max(0, deck.findIndex((card) => card.id === selectedId));
  const card = deck[index] ?? deck[0] ?? null;

  useEffect(() => {
    if (card && selectedId !== card.id) setSelectedId(card.id);
  }, [card, selectedId]);

  // Resume from the card last seen here or in the full-screen reader.
  useFocusEffect(useCallback(() => {
    let active = true;
    void AsyncStorage.getItem(POSITION_KEY).then((value) => {
      if (active && value && deck.some((item) => item.id === value)) setSelectedId(value);
    });
    return () => { active = false; };
  }, [deck]));

  const move = useCallback((direction: -1 | 1) => {
    if (deck.length < 2) return;
    const next = (index + direction + deck.length) % deck.length;
    setSelectedId(deck[next].id);
    void AsyncStorage.setItem(POSITION_KEY, deck[next].id).catch(() => undefined);
    void Haptics.selectionAsync();
  }, [deck, index]);

  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-13, 13])
    .onUpdate((event) => { dragX.value = Math.max(-82, Math.min(82, event.translationX)); })
    .onEnd((event) => {
      if (event.translationX < -48 || event.velocityX < -600) runOnJS(move)(1);
      else if (event.translationX > 48 || event.velocityX > 600) runOnJS(move)(-1);
      dragX.value = reducedMotion ? 0 : withSpring(0, { damping: 20, stiffness: 250, mass: 0.56 });
    });
  const swipeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dragX.value) / 260, 0.2),
    transform: [{ translateX: dragX.value }],
  }));

  if (!card) return null;
  const formula = card.latex[0] ?? null;
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={swipeStyle}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`记忆卡 ${index + 1}，共 ${deck.length} 张，${card.courseCode}，${card.prompt}，左右滑切换，点开查看答案`}
          onPress={() => onOpen(card)}
          style={styles.preview}>
          <View style={styles.previewTop}>
            <Text style={styles.previewTitle}>记忆</Text>
            <Text numberOfLines={1} style={styles.previewMeta}>{card.courseCode} · {card.signal}</Text>
          </View>
          <Text numberOfLines={2} style={styles.previewPrompt}>{card.prompt}</Text>
          {formula && <View pointerEvents="none" style={styles.previewFormula}>
            <NativeMathFormula
              latex={formula}
              fontSize={19}
            />
          </View>}
          <View style={styles.previewBottom}>
            <Text style={styles.previewProgress}>{index + 1} / {deck.length}</Text>
            <View style={styles.previewAction}>
              <Text style={styles.previewHint}>左右滑 · 点开答案</Text>
              <Text style={styles.previewArrow}>›</Text>
            </View>
          </View>
        </PressableScale>
      </Animated.View>
    </GestureDetector>
  );
}

type ReaderProps = {
  cards: StudyCard[];
  initialCardId?: string;
  onClose: () => void;
};

export function MemoryReader({ cards, initialCardId, onClose }: ReaderProps) {
  const reducedMotion = useReducedMotion();
  const initialCard = useMemo(
    () => cards.find((card) => card.id === initialCardId) ?? null,
    [cards, initialCardId],
  );
  const courses = useMemo(() => studyCardCourses(cards), [cards]);
  const [course, setCourse] = useState<string>(initialCard?.courseCode ?? '');
  const [selectedId, setSelectedId] = useState(initialCard?.id ?? '');
  const appliedInitialId = useRef<string | null>(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const dragX = useSharedValue(0);

  useEffect(() => {
    if (!initialCard || appliedInitialId.current === initialCard.id) return;
    appliedInitialId.current = initialCard.id;
    setCourse(initialCard.courseCode);
    setSelectedId(initialCard.id);
  }, [initialCard]);

  useEffect(() => {
    if (!course && courses.length > 0) setCourse(courses[0]);
  }, [course, courses]);

  const deck = useMemo(() => studyCardsForCourse(cards, course), [cards, course]);
  const currentIndex = Math.max(0, deck.findIndex((card) => card.id === selectedId));
  const current = deck[currentIndex] ?? deck[0] ?? null;
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (current && current.id !== selectedId) setSelectedId(current.id);
  }, [current, selectedId]);

  useEffect(() => {
    if (!currentId) return;
    contentScrollRef.current?.scrollTo({ y: 0, animated: false });
    void AsyncStorage.setItem(POSITION_KEY, currentId).catch(() => undefined);
  }, [course, currentId]);

  const move = useCallback((direction: -1 | 1) => {
    if (deck.length < 2) return;
    const next = (currentIndex + direction + deck.length) % deck.length;
    setSelectedId(deck[next].id);
    void Haptics.selectionAsync();
  }, [currentIndex, deck]);

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((event) => { dragX.value = Math.max(-78, Math.min(78, event.translationX)); })
    .onEnd((event) => {
      if (event.translationX < -52 || event.velocityX < -620) runOnJS(move)(1);
      else if (event.translationX > 52 || event.velocityX > 620) runOnJS(move)(-1);
      dragX.value = reducedMotion ? 0 : withSpring(0, { damping: 20, stiffness: 250, mass: 0.58 });
    });
  const cardGesture = Gesture.Simultaneous(pan, Gesture.Native());
  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dragX.value) / 250, 0.16),
    transform: [{ translateX: dragX.value }],
  }));

  const selectCourse = useCallback((code: string) => {
    const first = studyCardsForCourse(cards, code)[0];
    if (!first) return;
    setCourse(code);
    setSelectedId(first.id);
    void Haptics.selectionAsync();
  }, [cards]);

  return (
    <LinearGradient colors={['#E7FAFD', '#F8FDFC', '#F8F2E4']} locations={[0, 0.7, 1]} style={styles.readerBackground}>
      <View pointerEvents="none" style={styles.readerGlow} />
      <View pointerEvents="none" style={styles.readerShore} />
      <SafeAreaView style={styles.readerSafe}>
        <View style={styles.readerHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <Text style={styles.readerTitle}>记忆</Text>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={current ? `${current.courseCode} 记忆卡 ${currentIndex + 1}，共 ${deck.length} 张` : '记忆卡正在载入'}
            accessibilityActions={[
              { name: 'decrement', label: '上一张' },
              { name: 'increment', label: '下一张' },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'decrement') move(-1);
              if (event.nativeEvent.actionName === 'increment') move(1);
            }}
            style={styles.readerProgressWrap}>
            <Text style={styles.readerProgress}>{current ? `${currentIndex + 1} / ${deck.length}` : '—'}</Text>
          </View>
        </View>

        <View accessibilityRole="tablist" style={styles.courseTabs}>
          {courses.map((code) => {
            const active = code === course;
            const count = cards.filter((card) => card.courseCode === code).length;
            return <PressableScale
              key={code}
              accessibilityRole="tab"
              accessibilityLabel={`${code}，${count} 张`}
              accessibilityState={{ selected: active, disabled: count === 0 }}
              disabled={count === 0}
              onPress={() => selectCourse(code)}
              style={[styles.courseTab, active && styles.courseTabActive, count === 0 && styles.courseTabDisabled]}>
              <Text style={[styles.courseTabText, active && styles.courseTabTextActive]}>{code}</Text>
            </PressableScale>;
          })}
        </View>

        {current ? <GestureDetector gesture={cardGesture}>
          <Animated.View style={[styles.readerBody, cardStyle]}>
            <ScrollView
              ref={contentScrollRef}
              nestedScrollEnabled
              overScrollMode="never"
              showsVerticalScrollIndicator
              style={styles.readerScroll}
              contentContainerStyle={styles.readerContent}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTopic}>{current.topic}</Text>
                <Text style={styles.cardSignal}>{current.signal}</Text>
              </View>
              <Text style={styles.cardPrompt}>{current.prompt}</Text>

              {current.latex.length > 0 && <View pointerEvents="none" style={styles.formulaGroup}>
                {current.latex.map((latex, index) => (
                  <NativeMathFormula
                    key={`${current.id}-formula-${index}`}
                    latex={latex}
                    fontSize={22}
                  />
                ))}
              </View>}

              <View style={styles.answerSection}>
                <Text style={styles.answerLabel}>记住</Text>
                {current.answer.map((answer, index) => <View key={answer} style={styles.answerRow}>
                  <Text style={styles.answerIndex}>{index + 1}</Text>
                  <Text style={styles.answerText}>{answer}</Text>
                </View>)}
              </View>

              {current.terms.length > 0 && <View style={styles.termSection}>
                {current.terms.map((term, index) => <View key={term.term} style={[styles.termRow, index < current.terms.length - 1 && styles.termRowBorder]}>
                  <Text style={styles.termName}>{term.term}</Text>
                  <Text style={styles.termMeaning}>{term.meaning}</Text>
                </View>)}
              </View>}

              {current.trap && <View style={styles.trap}>
                <Text style={styles.trapLabel}>易错</Text>
                <Text style={styles.trapText}>{current.trap}</Text>
              </View>}
            </ScrollView>
          </Animated.View>
        </GestureDetector> : <View style={styles.readerEmpty}>
          <Text style={styles.readerEmptyText}>正在载入记忆卡</Text>
        </View>}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 166, marginTop: 15, paddingHorizontal: 19, paddingTop: 17, paddingBottom: 14, borderWidth: 1, borderColor: 'rgba(20,142,166,0.17)', borderRadius: 23, backgroundColor: 'rgba(255,255,252,0.86)', shadowColor: '#2E7786', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  previewTitle: { color: palette.cyanDeep, fontSize: 22, lineHeight: 29, fontFamily: typography.display },
  previewMeta: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'right', fontFamily: typography.medium },
  previewPrompt: { marginTop: 9, color: palette.ink, fontSize: 20, lineHeight: 28, fontFamily: typography.medium, letterSpacing: -0.2 },
  previewFormula: { marginTop: 10, marginHorizontal: -4 },
  previewBottom: { minHeight: 24, marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewProgress: { color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  previewAction: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewHint: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.regular },
  previewArrow: { color: '#70A8B4', fontSize: 21, lineHeight: 24, fontFamily: typography.regular },
  readerBackground: { flex: 1 },
  readerGlow: { position: 'absolute', top: -200, right: -180, width: 390, height: 390, borderRadius: 200, backgroundColor: 'rgba(63,211,228,0.11)' },
  readerShore: { position: 'absolute', left: -130, right: -120, bottom: -280, height: 390, borderTopLeftRadius: 280, borderTopRightRadius: 220, backgroundColor: 'rgba(255,248,225,0.38)', transform: [{ rotate: '-4deg' }] },
  readerSafe: { flex: 1 },
  readerHeader: { height: 55, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(29,137,158,0.10)' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  backButtonPressed: { backgroundColor: 'rgba(255,255,255,0.58)' },
  backArrow: { marginTop: -3, color: palette.inkSoft, fontSize: 36, lineHeight: 40, fontFamily: typography.regular },
  readerTitle: { flex: 1, color: palette.ink, fontSize: 29, lineHeight: 38, fontFamily: typography.display },
  readerProgressWrap: { minWidth: 62, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  readerProgress: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  courseTabs: { height: 48, marginHorizontal: 17, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 7 },
  courseTab: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.52)' },
  courseTabActive: { borderColor: 'rgba(18,159,187,0.34)', backgroundColor: '#DAF5F7' },
  courseTabDisabled: { opacity: 0.36 },
  courseTabText: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.medium },
  courseTabTextActive: { color: palette.cyanDeep },
  readerBody: { flex: 1, minHeight: 0 },
  readerScroll: { flex: 1 },
  readerContent: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 23, paddingTop: 20, paddingBottom: 72 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  cardTopic: { flex: 1, color: palette.cyanDeep, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  cardSignal: { color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.regular },
  cardPrompt: { marginTop: 14, color: palette.ink, fontSize: 29, lineHeight: 39, fontFamily: typography.medium, letterSpacing: -0.5 },
  formulaGroup: { marginTop: 20, marginHorizontal: -5, gap: 18 },
  answerSection: { marginTop: 25, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  answerLabel: { marginBottom: 13, color: palette.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  answerRow: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  answerIndex: { width: 21, height: 21, paddingTop: 1, borderRadius: 11, color: palette.cyanDeep, backgroundColor: '#E0F6F8', fontSize: 10, lineHeight: 19, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  answerText: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 25, fontFamily: typography.regular },
  termSection: { marginTop: 21, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  termRow: { minHeight: 50, paddingVertical: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  termRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  termName: { width: 96, color: palette.ink, fontSize: 13, lineHeight: 20, fontFamily: typography.medium },
  termMeaning: { flex: 1, color: palette.inkSoft, fontSize: 13, lineHeight: 20, fontFamily: typography.regular },
  trap: { marginTop: 22, paddingLeft: 15, paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: palette.quiz },
  trapLabel: { color: palette.quiz, fontSize: 10, lineHeight: 15, fontFamily: typography.medium },
  trapText: { marginTop: 4, color: palette.inkSoft, fontSize: 14, lineHeight: 22, fontFamily: typography.regular },
  readerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 72 },
  readerEmptyText: { color: palette.muted, fontSize: 14, lineHeight: 20, fontFamily: typography.regular },
});

import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MathText } from '@/components/math-text';
import { NativeMathFormula } from '@/components/native-math-formula';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { StudyCard } from '@/core/study-cards';
import { useHomeDeck, useReaderDeck } from '@/hooks/use-memory-deck';
import { getDeckState } from '@/services/deck-store';

export function MemoryCardCarousel({ cards, onOpen }: { cards: StudyCard[]; onOpen: (card: StudyCard) => void }) {
  const reducedMotion = useReducedMotion();
  const { ready, card, index, total, move } = useHomeDeck(cards);
  const dragX = useSharedValue(0);
  // Separate shared value for the one-time cue, so gesture handlers never
  // touch a value that an effect depends on (react-hooks/immutability).
  const cueX = useSharedValue(0);

  const swipe = useCallback((direction: -1 | 1) => {
    if (move(direction)) void Haptics.selectionAsync();
  }, [move]);

  // One-time discovery cue replacing the old permanent "左右滑" caption: a
  // gentle nudge, only before the very first swipe/open, never on relaunch.
  const cueDone = useRef(false);
  useEffect(() => {
    if (cueDone.current || !ready || !card) return;
    cueDone.current = true;
    if (reducedMotion || getDeckState()?.lastViewedId) return;
    cueX.value = withDelay(700, withSequence(
      withTiming(-20, { duration: 240 }),
      withSpring(0, { damping: 15, stiffness: 180, mass: 0.6 }),
    ));
  }, [ready, card, reducedMotion, cueX]);

  const pan = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-13, 13])
    .onUpdate((event) => { dragX.value = Math.max(-82, Math.min(82, event.translationX)); })
    .onEnd((event) => {
      if (event.translationX < -48 || event.velocityX < -600) runOnJS(swipe)(1);
      else if (event.translationX > 48 || event.velocityX > 600) runOnJS(swipe)(-1);
      dragX.value = reducedMotion ? 0 : withSpring(0, { damping: 20, stiffness: 250, mass: 0.56 });
    });
  const swipeStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dragX.value) / 260, 0.2),
    transform: [{ translateX: dragX.value + cueX.value }],
  }));

  if (!ready || !card) return null;
  const formula = card.latex[0] ?? null;
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={swipeStyle}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`记忆卡 ${index + 1}，共 ${total} 张，${card.courseCode}，${card.prompt}，左右滑切换，点开查看答案`}
          onPress={() => onOpen(card)}
          style={styles.preview}>
          <View style={styles.previewTop}>
            <Text style={styles.previewTitle}>记忆</Text>
            <Text numberOfLines={1} style={styles.previewMeta}>{card.courseCode} · {card.signal}</Text>
          </View>
          <View style={styles.previewPromptWrap}>
            <MathText
              text={card.prompt}
              fontSize={23}
              color={palette.ink}
              fontFamily={typography.medium}
              numberOfLines={2}
              style={styles.previewPromptText}
            />
          </View>
          {formula && <View pointerEvents="none" style={styles.previewFormula}>
            <NativeMathFormula
              latex={formula}
              fontSize={21}
              color={palette.ink}
            />
          </View>}
          <View style={styles.previewBottom}>
            <Text style={styles.previewProgress}>{index + 1} / {total}</Text>
            <Text style={styles.previewArrow}>›</Text>
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
  const { courses, course, current, index, total, move, selectCourse } = useReaderDeck(cards, initialCardId);
  const contentScrollRef = useRef<ScrollView>(null);
  const dragX = useSharedValue(0);
  const currentId = current?.id ?? null;

  useEffect(() => {
    if (!currentId) return;
    contentScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [course, currentId]);

  const swipe = useCallback((direction: -1 | 1) => {
    if (move(direction)) void Haptics.selectionAsync();
  }, [move]);

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((event) => { dragX.value = Math.max(-78, Math.min(78, event.translationX)); })
    .onEnd((event) => {
      if (event.translationX < -52 || event.velocityX < -620) runOnJS(swipe)(1);
      else if (event.translationX > 52 || event.velocityX > 620) runOnJS(swipe)(-1);
      dragX.value = reducedMotion ? 0 : withSpring(0, { damping: 20, stiffness: 250, mass: 0.58 });
    });
  const cardGesture = Gesture.Simultaneous(pan, Gesture.Native());
  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dragX.value) / 250, 0.16),
    transform: [{ translateX: dragX.value }],
  }));

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
            accessibilityLabel={current ? `${current.courseCode} 记忆卡 ${index + 1}，共 ${total} 张` : '记忆卡正在载入'}
            accessibilityActions={[
              { name: 'decrement', label: '上一张' },
              { name: 'increment', label: '下一张' },
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'decrement') swipe(-1);
              if (event.nativeEvent.actionName === 'increment') swipe(1);
            }}
            style={styles.readerProgressWrap}>
            <Text style={styles.readerProgress}>{current ? `${index + 1} / ${total}` : '—'}</Text>
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
              onPress={() => {
                selectCourse(code);
                void Haptics.selectionAsync();
              }}
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
              <View style={styles.cardPromptWrap}>
                <MathText
                  text={current.prompt}
                  fontSize={29}
                  color={palette.ink}
                  fontFamily={typography.medium}
                  style={styles.cardPromptText}
                />
              </View>

              {current.latex.length > 0 && <View pointerEvents="none" style={styles.formulaGroup}>
                {current.latex.map((latex, formulaIndex) => (
                  <NativeMathFormula
                    key={`${current.id}-formula-${formulaIndex}`}
                    latex={latex}
                    fontSize={22}
                  />
                ))}
              </View>}

              <View style={styles.answerSection}>
                <Text style={styles.answerLabel}>记住</Text>
                {current.answer.map((answer, answerIndex) => <View key={answer} style={styles.answerRow}>
                  <Text style={styles.answerIndex}>{answerIndex + 1}</Text>
                  <View style={styles.answerBody}>
                    <MathText
                      text={answer}
                      fontSize={16}
                      color={palette.ink}
                      fontFamily={typography.regular}
                      style={styles.answerText}
                    />
                  </View>
                </View>)}
              </View>

              {current.terms.length > 0 && <View style={styles.termSection}>
                {current.terms.map((term, termIndex) => <View key={term.term} style={[styles.termRow, termIndex < current.terms.length - 1 && styles.termRowBorder]}>
                  <View style={styles.termNameWrap}>
                    <MathText
                      text={term.term}
                      fontSize={13}
                      color={palette.ink}
                      fontFamily={typography.medium}
                      style={styles.termText}
                    />
                  </View>
                  <View style={styles.termMeaningWrap}>
                    <MathText
                      text={term.meaning}
                      fontSize={13}
                      color={palette.inkSoft}
                      fontFamily={typography.regular}
                      style={styles.termText}
                    />
                  </View>
                </View>)}
              </View>}

              {current.trap && <View style={styles.trap}>
                <Text style={styles.trapLabel}>易错</Text>
                <View style={styles.trapBody}>
                  <MathText
                    text={current.trap}
                    fontSize={14}
                    color={palette.inkSoft}
                    fontFamily={typography.regular}
                    style={styles.trapText}
                  />
                </View>
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
  preview: { minHeight: 170, marginTop: 15, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, borderWidth: 1, borderColor: 'rgba(18,150,176,0.19)', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.90)', shadowColor: '#1D89A0', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
  previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  previewTitle: { color: palette.cyanDeep, fontSize: 24, lineHeight: 30, fontFamily: typography.display },
  previewMeta: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'right', fontFamily: typography.medium },
  previewPromptWrap: { marginTop: 10 },
  previewPromptText: { lineHeight: 31, letterSpacing: -0.2 },
  previewFormula: { marginTop: 14 },
  previewBottom: { minHeight: 24, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewProgress: { color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  previewArrow: { color: '#70A8B4', fontSize: 22, lineHeight: 25, fontFamily: typography.regular },
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
  cardPromptWrap: { marginTop: 14 },
  cardPromptText: { lineHeight: 39, letterSpacing: -0.5 },
  formulaGroup: { marginTop: 20, marginHorizontal: -5, gap: 18 },
  answerSection: { marginTop: 25, paddingTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  answerLabel: { marginBottom: 13, color: palette.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  answerRow: { minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  answerIndex: { width: 21, height: 21, paddingTop: 1, borderRadius: 11, color: palette.cyanDeep, backgroundColor: '#E0F6F8', fontSize: 10, lineHeight: 19, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  answerBody: { flex: 1, minWidth: 0 },
  answerText: { lineHeight: 25 },
  termSection: { marginTop: 21, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  termRow: { minHeight: 50, paddingVertical: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  termRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  termNameWrap: { width: 96 },
  termMeaningWrap: { flex: 1, minWidth: 0 },
  termText: { lineHeight: 20 },
  trap: { marginTop: 22, paddingLeft: 15, paddingVertical: 4, borderLeftWidth: 3, borderLeftColor: palette.quiz },
  trapLabel: { color: palette.quiz, fontSize: 10, lineHeight: 15, fontFamily: typography.medium },
  trapBody: { marginTop: 4 },
  trapText: { lineHeight: 22 },
  readerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 72 },
  readerEmptyText: { color: palette.muted, fontSize: 14, lineHeight: 20, fontFamily: typography.regular },
});

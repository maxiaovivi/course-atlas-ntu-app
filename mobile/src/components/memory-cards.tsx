/* eslint-disable react-hooks/set-state-in-effect -- Modal state resets to the card opened from the carousel. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import MathFormula from '@/components/math-formula.dom';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { StudyCard, studyCardDeck, studyCardsForCourse } from '@/core/study-cards';

const COURSES = ['EE6221', 'EE6406', 'EE6407', 'EE6497'] as const;

function formulaHeight(latex: string, detail = false) {
  if (/\\begin\{(?:bmatrix|matrix|aligned|cases)\}/.test(latex)) return detail ? 132 : 86;
  if (latex.length > 150) return detail ? 106 : 74;
  return detail ? 78 : 58;
}

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

  const move = useCallback((direction: -1 | 1) => {
    if (deck.length < 2) return;
    const next = (index + direction + deck.length) % deck.length;
    setSelectedId(deck[next].id);
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
            <Text style={styles.previewTitle}>记憶</Text>
            <Text numberOfLines={1} style={styles.previewMeta}>{card.courseCode} · {card.signal}</Text>
          </View>
          <Text numberOfLines={2} style={styles.previewPrompt}>{card.prompt}</Text>
          {formula && <View pointerEvents="none" style={[styles.previewFormula, { height: formulaHeight(formula) }]}>
            <MathFormula
              latex={formula}
              fontSize={formula.length > 120 ? 15 : 17}
              dom={{ scrollEnabled: false, showsVerticalScrollIndicator: false, showsHorizontalScrollIndicator: false }}
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

type SheetProps = {
  cards: StudyCard[];
  initialCard: StudyCard | null;
  visible: boolean;
  onClose: () => void;
};

export function MemorySheet({ cards, initialCard, visible, onClose }: SheetProps) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [course, setCourse] = useState<string>(initialCard?.courseCode ?? COURSES[0]);
  const [selectedId, setSelectedId] = useState(initialCard?.id ?? '');
  const dragX = useSharedValue(0);

  useEffect(() => {
    if (!visible || !initialCard) return;
    setCourse(initialCard.courseCode);
    setSelectedId(initialCard.id);
  }, [initialCard, visible]);

  const deck = useMemo(() => studyCardsForCourse(cards, course), [cards, course]);
  const currentIndex = Math.max(0, deck.findIndex((card) => card.id === selectedId));
  const current = deck[currentIndex] ?? deck[0] ?? null;

  useEffect(() => {
    if (current && current.id !== selectedId) setSelectedId(current.id);
  }, [current, selectedId]);

  const move = useCallback((direction: -1 | 1) => {
    if (deck.length < 2) return;
    const next = (currentIndex + direction + deck.length) % deck.length;
    setSelectedId(deck[next].id);
    void Haptics.selectionAsync();
  }, [currentIndex, deck]);

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((event) => { dragX.value = Math.max(-72, Math.min(72, event.translationX)); })
    .onEnd((event) => {
      if (event.translationX < -55 || event.velocityX < -650) runOnJS(move)(1);
      else if (event.translationX > 55 || event.velocityX > 650) runOnJS(move)(-1);
      dragX.value = reducedMotion ? 0 : withSpring(0, { damping: 20, stiffness: 250, mass: 0.58 });
    });
  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.abs(dragX.value) / 250, 0.18),
    transform: [{ translateX: dragX.value }],
  }));

  if (!current) return null;
  return (
    <Modal transparent visible={visible} hardwareAccelerated statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(224,249,251,0.93)', 'rgba(251,253,249,0.98)', 'rgba(248,241,226,0.96)']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetTitle}>记憶</Text>
              <Text style={styles.sheetSubtitle}>左右滑，切换知识点</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭记忆卡" hitSlop={12} style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseTabs}>
            {COURSES.map((code) => {
              const active = code === course;
              const count = cards.filter((card) => card.courseCode === code).length;
              return <PressableScale
                key={code}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                disabled={count === 0}
                onPress={() => {
                  const first = studyCardsForCourse(cards, code)[0];
                  if (!first) return;
                  setCourse(code);
                  setSelectedId(first.id);
                }}
                style={[styles.courseTab, active && styles.courseTabActive, count === 0 && styles.courseTabDisabled]}>
                <Text style={[styles.courseTabText, active && styles.courseTabTextActive]}>{code}</Text>
              </PressableScale>;
            })}
          </ScrollView>

          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.deckCard, { width: Math.min(width - 32, 520) }, cardStyle]}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.deckContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTopic}>{current.topic}</Text>
                  <Text style={styles.cardSignal}>{current.signal}</Text>
                </View>
                <Text style={styles.cardPrompt}>{current.prompt}</Text>

                {current.latex.map((latex) => <View key={latex} pointerEvents="none" style={[styles.formula, { height: formulaHeight(latex, true) }]}>
                  <MathFormula
                    latex={latex}
                    fontSize={latex.length > 160 ? 15 : 18}
                    dom={{ scrollEnabled: false, showsVerticalScrollIndicator: false, showsHorizontalScrollIndicator: false }}
                  />
                </View>)}

                <View style={styles.answerSection}>
                  <Text style={styles.answerLabel}>记住</Text>
                  {current.answer.map((answer, index) => <View key={answer} style={styles.answerRow}>
                    <Text style={styles.answerIndex}>{index + 1}</Text>
                    <Text style={styles.answerText}>{answer}</Text>
                  </View>)}
                </View>

                {current.terms.length > 0 && <View style={styles.termSection}>
                  {current.terms.map((term) => <View key={term.term} style={styles.termRow}>
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
          </GestureDetector>

          <View style={styles.deckFooter}>
            <PressableScale accessibilityRole="button" accessibilityLabel="上一张" onPress={() => move(-1)} style={styles.navButton}>
              <Text style={styles.navArrow}>‹</Text>
            </PressableScale>
            <Text style={styles.progress}>{currentIndex + 1} / {deck.length}</Text>
            <PressableScale accessibilityRole="button" accessibilityLabel="下一张" onPress={() => move(1)} style={styles.navButton}>
              <Text style={styles.navArrow}>›</Text>
            </PressableScale>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  preview: { minHeight: 166, marginTop: 15, paddingHorizontal: 19, paddingTop: 17, paddingBottom: 14, borderWidth: 1, borderColor: 'rgba(20,142,166,0.17)', borderRadius: 23, backgroundColor: 'rgba(255,255,252,0.86)', shadowColor: '#2E7786', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  previewTitle: { color: palette.cyanDeep, fontSize: 22, lineHeight: 29, fontFamily: typography.display },
  previewMeta: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'right', fontFamily: typography.medium },
  previewPrompt: { marginTop: 9, color: palette.ink, fontSize: 20, lineHeight: 28, fontFamily: typography.medium, letterSpacing: -0.2 },
  previewFormula: { marginTop: 8, marginHorizontal: -4, overflow: 'hidden' },
  previewBottom: { minHeight: 24, marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  previewProgress: { color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  previewAction: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  previewHint: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.regular },
  previewArrow: { color: '#70A8B4', fontSize: 21, lineHeight: 24, fontFamily: typography.regular },
  modalRoot: { flex: 1, backgroundColor: 'rgba(16,69,80,0.1)' },
  modalSafe: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },
  sheetTop: { width: '100%', minHeight: 78, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: palette.ink, fontSize: 31, lineHeight: 40, fontFamily: typography.display },
  sheetSubtitle: { marginTop: -2, color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.regular },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.68)' },
  closeText: { marginTop: -2, color: palette.inkSoft, fontSize: 27, lineHeight: 31, fontFamily: typography.regular },
  courseTabs: { minHeight: 47, paddingVertical: 5, paddingHorizontal: 1, gap: 7 },
  courseTab: { minWidth: 75, height: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.55)' },
  courseTabActive: { borderColor: 'rgba(18,159,187,0.34)', backgroundColor: '#DAF5F7' },
  courseTabDisabled: { opacity: 0.38 },
  courseTabText: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.medium },
  courseTabTextActive: { color: palette.cyanDeep },
  deckCard: { flex: 1, minHeight: 0, marginTop: 10, borderWidth: 1, borderColor: 'rgba(20,142,166,0.16)', borderRadius: 29, backgroundColor: 'rgba(255,255,253,0.94)', shadowColor: '#155B6B', shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8, overflow: 'hidden' },
  deckContent: { paddingHorizontal: 23, paddingTop: 22, paddingBottom: 28 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTopic: { flex: 1, color: palette.cyanDeep, fontSize: 11, lineHeight: 16, fontFamily: typography.medium },
  cardSignal: { color: palette.muted, fontSize: 10, lineHeight: 15, fontFamily: typography.regular },
  cardPrompt: { marginTop: 12, color: palette.ink, fontSize: 27, lineHeight: 36, fontFamily: typography.medium, letterSpacing: -0.45 },
  formula: { marginTop: 14, marginHorizontal: -8, borderRadius: 15, backgroundColor: 'rgba(229,248,250,0.46)', overflow: 'hidden' },
  answerSection: { marginTop: 22, paddingTop: 17, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  answerLabel: { marginBottom: 12, color: palette.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  answerRow: { minHeight: 32, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  answerIndex: { width: 20, height: 20, paddingTop: 1, borderRadius: 10, color: palette.cyanDeep, backgroundColor: '#E0F6F8', fontSize: 10, lineHeight: 18, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  answerText: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 23, fontFamily: typography.regular },
  termSection: { marginTop: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 17, backgroundColor: 'rgba(248,252,250,0.78)' },
  termRow: { minHeight: 45, paddingVertical: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  termName: { width: 88, color: palette.ink, fontSize: 12, lineHeight: 18, fontFamily: typography.medium },
  termMeaning: { flex: 1, color: palette.inkSoft, fontSize: 12, lineHeight: 18, fontFamily: typography.regular },
  trap: { marginTop: 18, paddingHorizontal: 15, paddingVertical: 13, borderLeftWidth: 3, borderLeftColor: palette.quiz, borderRadius: 12, backgroundColor: 'rgba(250,234,227,0.64)' },
  trapLabel: { color: palette.quiz, fontSize: 10, lineHeight: 15, fontFamily: typography.medium },
  trapText: { marginTop: 3, color: palette.inkSoft, fontSize: 13, lineHeight: 20, fontFamily: typography.regular },
  deckFooter: { width: '100%', minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.66)' },
  navArrow: { marginTop: -2, color: palette.cyanDeep, fontSize: 27, lineHeight: 32, fontFamily: typography.regular },
  progress: { minWidth: 56, color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
});

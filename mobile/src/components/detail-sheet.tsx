/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutable UI-thread refs. */
/* eslint-disable react-hooks/set-state-in-effect -- The sheet retains its selection while the exit animation completes. */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { agendaCertaintyLabel, agendaDateParts, agendaTypeLabel, AgendaViewItem } from '@/core/agenda';
import { CourseSession } from '@/core/schedule';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';

export type DetailSelection =
  | { kind: 'course'; course: CourseSession; source: string; agenda: AgendaViewItem[] }
  | { kind: 'agenda'; item: AgendaViewItem };

type Props = {
  selection: DetailSelection | null;
  visible: boolean;
  onClose: () => void;
};

function CourseDetails({ course, source, agenda }: { course: CourseSession; source: string; agenda: AgendaViewItem[] }) {
  const confirmed = course.locationStatus === 'confirmed';
  return (
    <>
      <Text style={styles.overline}>课程详情</Text>
      <Text style={styles.code}>{course.code}</Text>
      <Text style={styles.title}>{course.name}</Text>
      <Text style={styles.zh}>{course.zh}</Text>

      <View style={styles.primaryRow}>
        <View>
          <Text style={styles.primaryLabel}>{course.dayLabel}</Text>
          <Text style={styles.secondaryText}>{course.category === 'Specialized' ? '专业选修' : '普通选修'}</Text>
        </View>
        <Text style={styles.primaryTime}>{course.start} — {course.end}</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoTopline}>
          <Text style={styles.infoLabel}>上课地点</Text>
          <View style={[styles.certaintyPill, confirmed ? styles.confirmedPill : styles.pendingPill]}>
            <Text style={[styles.certaintyText, confirmed ? styles.confirmedText : styles.pendingText]}>{confirmed ? '已确认' : '待确认'}</Text>
          </View>
        </View>
        <Text style={styles.infoValue}>{course.location}</Text>
        <Text style={styles.infoHint}>{confirmed ? `地点来源：${course.locationSource}` : `等待 ${course.locationSource} 的当届教室安排`}</Text>
      </View>

      {course.section && <View style={styles.detailLine}><Text style={styles.detailLabel}>班级</Text><Text style={styles.detailValue}>{course.section}</Text></View>}
      {course.note && <View style={styles.note}><Text style={styles.noteText}>{course.note}</Text></View>}

      {agenda.length > 0 && <View style={styles.relatedSection}>
        <Text style={styles.relatedHeading}>课程事项</Text>
        {agenda.map((item, index) => {
          const date = agendaDateParts(item);
          return <View key={item.id} style={[styles.relatedItem, index < agenda.length - 1 && styles.relatedBorder]}>
            <View style={styles.relatedTopline}>
              <Text style={styles.relatedType}>{agendaTypeLabel(item.type)}</Text>
              <Text style={styles.relatedCertainty}>{agendaCertaintyLabel(item.certainty)}</Text>
            </View>
            <Text style={styles.relatedTitle}>{item.title}</Text>
            <Text style={styles.relatedMeta}>{date.date} · {date.time}</Text>
            {item.detail && <Text style={styles.relatedDetail}>{item.detail}</Text>}
          </View>;
        })}
      </View>}
      <View style={styles.sourceLine}><Text style={styles.sourceLabel}>数据来源</Text><Text style={styles.sourceValue}>{source}</Text></View>
    </>
  );
}

function AgendaDetails({ item }: { item: AgendaViewItem }) {
  const date = agendaDateParts(item);
  return (
    <>
      <Text style={styles.overline}>{agendaTypeLabel(item.type)}</Text>
      <View style={styles.agendaHeaderRow}>
        {item.courseCode && <Text style={styles.code}>{item.courseCode}</Text>}
        <View style={[styles.certaintyPill, item.certainty === 'confirmed' ? styles.confirmedPill : styles.pendingPill]}>
          <Text style={[styles.certaintyText, item.certainty === 'confirmed' ? styles.confirmedText : styles.pendingText]}>{agendaCertaintyLabel(item.certainty)}</Text>
        </View>
      </View>
      <Text style={styles.agendaTitle}>{item.title}</Text>

      <View style={styles.primaryRow}>
        <View>
          <Text style={styles.primaryLabel}>{date.date}</Text>
          <Text style={styles.secondaryText}>{agendaTypeLabel(item.type)}</Text>
        </View>
        <Text style={styles.primaryTime}>{date.time}</Text>
      </View>

      {item.location && <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>地点</Text>
        <Text style={styles.infoValue}>{item.location}</Text>
      </View>}
      {item.detail && <View style={styles.note}><Text style={styles.noteText}>{item.detail}</Text></View>}
      <View style={styles.sourceLine}><Text style={styles.sourceLabel}>数据来源</Text><Text style={styles.sourceValue}>{item.sourceLabel}</Text></View>
    </>
  );
}

export function DetailSheet({ selection, visible, onClose }: Props) {
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [shownSelection, setShownSelection] = useState(selection);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = Math.min(680, height * 0.8);

  useEffect(() => {
    if (visible) {
      if (selection) setShownSelection(selection);
      setMounted(true);
      dragY.value = 0;
      progress.value = reducedMotion ? 1 : withTiming(1, { duration: 240 });
      void Haptics.selectionAsync();
      return;
    }
    if (reducedMotion) {
      progress.value = 0;
      setMounted(false);
      setShownSelection(null);
      return;
    }
    progress.value = withTiming(0, { duration: 190 }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
        runOnJS(setShownSelection)(null);
      }
    });
  }, [dragY, progress, reducedMotion, selection, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [sheetHeight + 32, 0]) + dragY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => { dragY.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      if (dragY.value > 105 || event.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        dragY.value = reducedMotion ? 0 : withSpring(0, { damping: 23, stiffness: 270, mass: 0.62 });
      }
    });

  if (!mounted || !shownSelection) return null;

  return (
    <Modal transparent visible={mounted} hardwareAccelerated statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView intensity={22} tint="light" style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="关闭详情" style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { maxHeight: sheetHeight }, sheetStyle]}>
          <GestureDetector gesture={pan}>
            <View style={styles.dragArea}><View style={styles.handle} /></View>
          </GestureDetector>
          <View style={styles.closeRow}>
            <View />
            <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={12} style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={styles.content}>
            {shownSelection.kind === 'course'
              ? <CourseDetails course={shownSelection.course} source={shownSelection.source} agenda={shownSelection.agenda} />
              : <AgendaDetails item={shownSelection.item} />}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 70, 82, 0.13)' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: 'rgba(249, 254, 254, 0.99)', shadowColor: '#0A5268', shadowOpacity: 0.18, shadowRadius: 34, shadowOffset: { width: 0, height: -10 }, elevation: 28, overflow: 'hidden' },
  dragArea: { height: 28, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 42, height: 4, borderRadius: 4, backgroundColor: 'rgba(48, 124, 143, 0.22)' },
  closeRow: { height: 42, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#E7F7F9' },
  closeText: { marginTop: -2, color: palette.inkSoft, fontSize: 27, fontWeight: '300', fontFamily: typography.regular },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 34 },
  overline: { color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.medium, letterSpacing: 1.2 },
  code: { marginTop: 6, color: palette.cyanDeep, fontSize: 17, lineHeight: 23, fontFamily: typography.medium, letterSpacing: 0.6 },
  title: { marginTop: 20, color: palette.ink, fontSize: 25, lineHeight: 33, fontFamily: typography.medium, letterSpacing: -0.35 },
  agendaTitle: { marginTop: 18, color: palette.ink, fontSize: 24, lineHeight: 33, fontFamily: typography.medium, letterSpacing: -0.2 },
  zh: { marginTop: 6, color: palette.muted, fontSize: 15, lineHeight: 22, fontFamily: typography.regular },
  agendaHeaderRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryRow: { marginTop: 25, paddingVertical: 18, gap: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  primaryLabel: { color: palette.ink, fontSize: 20, lineHeight: 27, fontFamily: typography.medium },
  primaryTime: { flexShrink: 1, color: palette.ink, fontSize: 18, lineHeight: 25, textAlign: 'right', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  secondaryText: { marginTop: 4, color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.regular },
  infoCard: { marginTop: 18, padding: 17, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: '#ECFAFB' },
  infoTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.medium, letterSpacing: 0.4 },
  infoValue: { marginTop: 7, color: palette.ink, fontSize: 17, lineHeight: 24, fontFamily: typography.medium },
  infoHint: { marginTop: 5, color: '#6F9098', fontSize: 12, lineHeight: 18, fontFamily: typography.regular },
  certaintyPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 14 },
  confirmedPill: { backgroundColor: '#DDF5EE' },
  pendingPill: { backgroundColor: '#FFF0D8' },
  certaintyText: { fontSize: 11, lineHeight: 15, fontFamily: typography.medium },
  confirmedText: { color: '#277D69' },
  pendingText: { color: palette.warning },
  detailLine: { marginTop: 15, paddingHorizontal: 3, flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: palette.muted, fontSize: 13, lineHeight: 19, fontFamily: typography.regular },
  detailValue: { color: palette.ink, fontSize: 13, lineHeight: 19, fontFamily: typography.medium },
  note: { marginTop: 16, padding: 16, borderRadius: 17, backgroundColor: '#F1F7F6' },
  noteText: { color: palette.inkSoft, fontSize: 14, lineHeight: 22, fontFamily: typography.regular },
  relatedSection: { marginTop: 20, paddingHorizontal: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)' },
  relatedHeading: { paddingTop: 15, paddingBottom: 5, color: palette.ink, fontSize: 15, lineHeight: 21, fontFamily: typography.medium },
  relatedItem: { paddingVertical: 13 },
  relatedBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  relatedTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  relatedType: { color: palette.cyanDeep, fontSize: 11, lineHeight: 15, fontFamily: typography.medium },
  relatedCertainty: { color: palette.muted, fontSize: 11, lineHeight: 15, fontFamily: typography.regular },
  relatedTitle: { marginTop: 4, color: palette.ink, fontSize: 14, lineHeight: 20, fontFamily: typography.medium },
  relatedMeta: { marginTop: 4, color: palette.muted, fontSize: 12, lineHeight: 18, fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  relatedDetail: { marginTop: 6, color: palette.inkSoft, fontSize: 13, lineHeight: 20, fontFamily: typography.regular },
  sourceLine: { marginTop: 20, paddingTop: 17, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  sourceLabel: { color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.regular },
  sourceValue: { flex: 1, color: palette.inkSoft, fontSize: 12, lineHeight: 17, textAlign: 'right', fontFamily: typography.regular },
});

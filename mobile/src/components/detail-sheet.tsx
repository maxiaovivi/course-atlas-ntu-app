/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutable UI-thread refs. */
/* eslint-disable react-hooks/set-state-in-effect -- The sheet retains its selection while the exit animation completes. */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { agendaDateParts, agendaTypeLabel, AgendaViewItem } from '@/core/agenda';
import { singaporeDateKey } from '@/core/calendar';
import { formatMaterialSize, LibraryMaterial, MaterialShelf } from '@/core/library';
import { AcademicCalendarItem, CourseBrief, CourseSession } from '@/core/schedule';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';

export type DetailSelection =
  | { kind: 'course'; course: CourseSession; brief: CourseBrief | null; materials: LibraryMaterial[] }
  | { kind: 'agenda'; item: AgendaViewItem }
  | { kind: 'calendar'; items: AcademicCalendarItem[] };

type Props = {
  selection: DetailSelection | null;
  visible: boolean;
  onClose: () => void;
};

function locationForTime(location: string | null, time: string) {
  if (!location) return null;
  return time === '课堂内' ? location.replace(/^课堂内\s*·\s*/, '') : location;
}

function compactDate(value: string) {
  const [, month, day] = value.split('-').map(Number);
  return `${month}.${day}`;
}

function compactDateRange(item: AcademicCalendarItem) {
  return item.start === item.end ? compactDate(item.start) : `${compactDate(item.start)}—${compactDate(item.end)}`;
}

function CourseBriefBlock({
  label,
  date,
  items,
  accent = false,
  stale = false,
}: {
  label: string;
  date: string | null;
  items: string[];
  accent?: boolean;
  stale?: boolean;
}) {
  const visibleItems = stale ? [] : items;
  return (
    <View
      accessible
      accessibilityLabel={`${label}${date ? `，${date}` : ''}，${stale ? '待更新' : visibleItems.length > 0 ? visibleItems.join('，') : '暂无'}`}
      style={[styles.briefBlock, accent && styles.briefBlockAccent]}>
      <View style={styles.briefHeader}>
        <Text style={[styles.briefLabel, accent && styles.briefLabelAccent]}>{label}</Text>
        {date && !stale && <Text style={styles.briefDate}>{compactDate(date)}</Text>}
      </View>
      {visibleItems.length > 0
        ? <View style={styles.briefItems}>{visibleItems.map((item) => <View key={item} style={styles.briefItem}>
          <View style={[styles.briefDot, accent && styles.briefDotAccent]} />
          <Text style={styles.briefText}>{item}</Text>
        </View>)}</View>
        : <Text style={styles.briefEmpty}>{stale ? '待更新' : '暂无'}</Text>}
    </View>
  );
}

const SHELF_LABELS: Record<MaterialShelf, string> = {
  Lectures: '讲义',
  Assignments: '作业',
  'Study aids': '辅助',
  Quiz: '测验',
  Exams: '试卷',
};

function CourseMaterials({ materials }: { materials: LibraryMaterial[] }) {
  if (materials.length === 0) return null;
  const displayTitle = (material: LibraryMaterial) => material.title
    .replace(/\.pdf$/i, '')
    .replace(new RegExp(`^${material.course}[\\s_·-]*`, 'i'), '');
  return (
    <View style={styles.materialSection}>
      <View style={styles.materialHeading}>
        <Text style={styles.materialHeadingText}>资料</Text>
        <Text style={styles.materialCount}>{materials.length}</Text>
      </View>
      <View style={styles.materialList}>
        {materials.map((material, index) => <PressableScale
          key={material.id}
          accessibilityRole="link"
          accessibilityLabel={`${displayTitle(material)}，${SHELF_LABELS[material.shelf]}，${formatMaterialSize(material.size)}${material.readable ? '' : '，需要所有者登录'}`}
          style={[styles.materialRow, index < materials.length - 1 && styles.materialBorder]}
          onPress={() => void Linking.openURL(`https://fatemeeting.site/?material=${encodeURIComponent(material.id)}`)}>
          <View style={styles.pdfMark}><Text style={styles.pdfMarkText}>PDF</Text></View>
          <View style={styles.materialCopy}>
            <Text numberOfLines={2} style={styles.materialTitle}>{displayTitle(material)}</Text>
            <Text style={styles.materialMeta}>{SHELF_LABELS[material.shelf]} · {formatMaterialSize(material.size)}</Text>
          </View>
          <Text style={styles.materialArrow}>›</Text>
        </PressableScale>)}
      </View>
    </View>
  );
}

function CourseDetails({ course, brief, materials }: { course: CourseSession; brief: CourseBrief | null; materials: LibraryMaterial[] }) {
  const now = new Date();
  const stale = Boolean(brief?.nextDate && (
    brief.nextDate < singaporeDateKey(now)
    || (brief.nextDate === singaporeDateKey(now)
      && Date.parse(`${brief.nextDate}T${course.end}:00+08:00`) < now.getTime())
  ));
  return (
    <>
      <Text style={styles.code}>{course.code}</Text>
      <Text numberOfLines={2} style={styles.title}>{course.name}</Text>
      {brief ? <View style={styles.briefStack}>
        <CourseBriefBlock
          label="上节课后"
          date={brief?.previousDate ?? null}
          items={brief?.previous ?? []}
          stale={stale}
        />
        <CourseBriefBlock
          label="下节课前"
          date={brief?.nextDate ?? null}
          items={brief?.next ?? []}
          accent
          stale={stale}
        />
      </View> : <View accessible accessibilityLabel="课程内容未更新" style={styles.briefMissing}>
        <Text style={styles.briefMissingText}>未更新</Text>
      </View>}
      <CourseMaterials materials={materials} />
      {(course.note || course.locationSource) && <Disclosure>
        {course.note && <Text style={styles.explanation}>{course.note}</Text>}
        {course.locationSource && <Text style={styles.sourceText}>{course.locationSource}</Text>}
      </Disclosure>}
    </>
  );
}

function AgendaDetails({ item }: { item: AgendaViewItem }) {
  const date = agendaDateParts(item);
  const location = locationForTime(item.location, date.time);
  const certainty = item.certainty === 'inferred' && !/(预计|约|推定)/.test(item.title) && !date.time.startsWith('约')
    ? '推定'
    : item.certainty === 'pending' && item.start && !/待(定|公布|确认)/.test(item.title) ? '待定' : null;
  return (
    <>
      <View style={styles.agendaHeaderRow}>
        <Text style={styles.overline}>{item.courseCode ?? agendaTypeLabel(item.type)}</Text>
        {certainty && <Text style={styles.inferred}>{certainty}</Text>}
      </View>
      <Text style={styles.agendaTitle}>{item.title}</Text>
      <Text numberOfLines={1} style={styles.detailLine}>{date.date} · {date.time}{location ? ` · ${location}` : ''}</Text>
      {(item.detail || item.sourceLabel) && <Disclosure>
        {item.detail && <Text style={styles.explanation}>{item.detail}</Text>}
        {item.sourceLabel && <Text style={styles.sourceText}>{item.sourceLabel}</Text>}
      </Disclosure>}
    </>
  );
}

function CalendarDetails({ items }: { items: AcademicCalendarItem[] }) {
  return (
    <>
      <Text style={styles.calendarTitle}>校曆</Text>
      <View style={styles.calendarList}>
        {items.map((item, index) => <View
          key={item.id}
          accessibilityLabel={`${item.title}，${item.start} 到 ${item.end}`}
          style={[styles.calendarRow, index < items.length - 1 && styles.calendarBorder]}>
          <View style={[styles.calendarDot, item.kind === 'exam' && styles.calendarDotExam]} />
          <Text style={styles.calendarDate}>{compactDateRange(item)}</Text>
          <Text numberOfLines={1} style={styles.calendarName}>{item.title}</Text>
        </View>)}
      </View>
    </>
  );
}

function Disclosure({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? '收起说明' : '展开说明'}
        hitSlop={8}
        style={styles.disclosureButton}
        onPress={() => setOpen((value) => !value)}>
        <Text style={styles.disclosureLabel}>说明</Text>
        <Text style={styles.disclosureIcon}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open && <View style={styles.disclosureBody}>{children}</View>}
    </View>
  );
}

export function DetailSheet({ selection, visible, onClose }: Props) {
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [shownSelection, setShownSelection] = useState(selection);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = Math.min(650, height * 0.76);

  useEffect(() => {
    if (visible) {
      if (selection) setShownSelection(selection);
      setMounted(true);
      dragY.value = 0;
      progress.value = reducedMotion ? 1 : withTiming(1, { duration: 220 });
      void Haptics.selectionAsync();
      return;
    }
    if (reducedMotion) {
      progress.value = 0;
      setMounted(false);
      setShownSelection(null);
      return;
    }
    progress.value = withTiming(0, { duration: 180 }, (finished) => {
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
              ? <CourseDetails key={shownSelection.course.code} course={shownSelection.course} brief={shownSelection.brief} materials={shownSelection.materials} />
              : shownSelection.kind === 'agenda'
                ? <AgendaDetails key={shownSelection.item.id} item={shownSelection.item} />
                : <CalendarDetails items={shownSelection.items} />}
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
  closeRow: { height: 40, paddingHorizontal: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#E7F7F9' },
  closeText: { marginTop: -2, color: palette.inkSoft, fontSize: 26, fontWeight: '300', fontFamily: typography.regular },
  content: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 34 },
  overline: { color: palette.cyanDeep, fontSize: 12, lineHeight: 17, fontFamily: typography.medium, letterSpacing: 0.7 },
  code: { color: palette.cyanDeep, fontSize: 17, lineHeight: 23, fontFamily: typography.medium, letterSpacing: 0.6 },
  title: { marginTop: 8, color: palette.ink, fontSize: 25, lineHeight: 33, fontFamily: typography.medium, letterSpacing: -0.35 },
  briefStack: { marginTop: 25, gap: 11 },
  briefBlock: { minHeight: 104, paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)' },
  briefBlockAccent: { borderColor: 'rgba(34,181,210,0.22)', backgroundColor: 'rgba(224,249,251,0.76)' },
  briefHeader: { minHeight: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  briefLabel: { color: palette.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  briefLabelAccent: { color: palette.cyanDeep },
  briefDate: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  briefItems: { marginTop: 11, gap: 8 },
  briefItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  briefDot: { width: 4, height: 4, marginTop: 8, borderRadius: 2, backgroundColor: palette.muted },
  briefDotAccent: { backgroundColor: palette.cyan },
  briefText: { flex: 1, color: palette.ink, fontSize: 15, lineHeight: 22, fontFamily: typography.regular },
  briefEmpty: { marginTop: 12, color: palette.muted, fontSize: 14, lineHeight: 20, fontFamily: typography.regular },
  briefMissing: { minHeight: 92, marginTop: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.62)' },
  briefMissingText: { color: palette.muted, fontSize: 14, lineHeight: 20, fontFamily: typography.regular },
  materialSection: { marginTop: 24 },
  materialHeading: { minHeight: 29, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  materialHeadingText: { color: palette.ink, fontSize: 16, lineHeight: 22, fontFamily: typography.medium },
  materialCount: { color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  materialList: { marginTop: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.72)' },
  materialRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 },
  materialBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  pdfMark: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#E2F7FA' },
  pdfMarkText: { color: palette.cyanDeep, fontSize: 9, lineHeight: 12, fontFamily: typography.medium, letterSpacing: 0.4 },
  materialCopy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  materialTitle: { color: palette.ink, fontSize: 13, lineHeight: 18, fontFamily: typography.medium },
  materialMeta: { marginTop: 3, color: palette.muted, fontSize: 10, lineHeight: 14, fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  materialArrow: { width: 13, color: '#70A8B4', textAlign: 'right', fontSize: 20, lineHeight: 25, fontFamily: typography.regular },
  agendaHeaderRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  agendaTitle: { marginTop: 10, color: palette.ink, fontSize: 24, lineHeight: 32, fontFamily: typography.medium, letterSpacing: -0.2 },
  inferred: { color: palette.warning, fontSize: 11, lineHeight: 15, fontFamily: typography.medium },
  detailLine: { marginTop: 24, paddingVertical: 17, color: palette.inkSoft, fontSize: 15, lineHeight: 21, fontFamily: typography.medium, fontVariant: ['tabular-nums'], borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  calendarTitle: { color: palette.ink, fontSize: 32, lineHeight: 42, fontFamily: typography.display },
  calendarList: { marginTop: 18, paddingHorizontal: 15, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)' },
  calendarRow: { minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 11 },
  calendarBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  calendarDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.cyan },
  calendarDotExam: { backgroundColor: palette.quiz },
  calendarDate: { width: 92, color: palette.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  calendarName: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 20, fontFamily: typography.medium },
  disclosure: { marginTop: 13 },
  disclosureButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureLabel: { color: palette.muted, fontSize: 12, lineHeight: 18, fontFamily: typography.medium },
  disclosureIcon: { color: palette.muted, fontSize: 19, lineHeight: 23, fontFamily: typography.regular },
  disclosureBody: { paddingBottom: 4 },
  explanation: { padding: 13, borderRadius: 15, color: palette.inkSoft, backgroundColor: '#F1F7F6', fontSize: 13, lineHeight: 20, fontFamily: typography.regular },
  sourceText: { marginTop: 8, color: palette.muted, fontSize: 11, lineHeight: 17, fontFamily: typography.regular },
});

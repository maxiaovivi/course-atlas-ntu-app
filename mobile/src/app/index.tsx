import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { DetailSelection, DetailSheet } from '@/components/detail-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { agendaDateParts, agendaTypeLabel, AgendaViewItem, upcomingAgendaItems } from '@/core/agenda';
import { singaporeDateKey } from '@/core/calendar';
import { materialsForCourse } from '@/core/library';
import { AcademicCalendarItem, CourseSession, getNextClass } from '@/core/schedule';
import { useCalendar } from '@/hooks/use-calendar';
import { useLibrary } from '@/hooks/use-library';
import { useNow } from '@/hooks/use-now';
import { useSchedule } from '@/hooks/use-schedule';

function todayLabel(now: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', weekday: 'long',
  }).format(now);
}

function compactDate(value: string) {
  const [, month, day] = value.split('-').map(Number);
  return `${month}.${day}`;
}

function compactDateRange(start: string, end: string) {
  return start === end ? compactDate(start) : `${compactDate(start)}—${compactDate(end)}`;
}

function compactAgendaDate(item: AgendaViewItem) {
  if (!item.start) return '待定';
  const date = new Date(item.allDay ? `${item.start}T00:00:00+08:00` : item.start);
  const format = (value: Date) => new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', month: 'numeric', day: 'numeric',
  }).format(value).replace('/', '.');
  const start = format(date);
  if (!item.allDay || !item.end || item.end === item.start) return start;
  const end = format(new Date(`${item.end}T00:00:00+08:00`));
  const [startMonth] = start.split('.');
  const [endMonth, endDay] = end.split('.');
  return startMonth === endMonth ? `${start}—${endDay}` : `${start}—${end}`;
}

function agendaAccent(item: AgendaViewItem) {
  if (item.type === 'quiz' || item.type === 'ca') return palette.quiz;
  if (item.type === 'deadline') return palette.deadline;
  return palette.notice;
}

function displayLocation(location: string, pending: boolean) {
  if (!pending || location.includes('待')) return location;
  return `${location} · 待确认`;
}

function agendaLocation(item: AgendaViewItem, timeLabel: string) {
  if (!item.location) return null;
  if (timeLabel === '课堂内') return item.location.replace(/^课堂内\s*·\s*/, '');
  return item.location;
}

function futureCalendarItems(items: AcademicCalendarItem[], now: Date) {
  const today = singaporeDateKey(now);
  return items
    .filter((item) => item.end >= today)
    .sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title, 'zh-CN'));
}

function breakCountdown(item: AcademicCalendarItem, now: Date) {
  const today = singaporeDateKey(now);
  if (today >= item.start && today <= item.end) return '进行中';
  const start = Date.parse(`${item.start}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return `${Math.max(0, Math.round((start - current) / 86_400_000))}天`;
}

export default function HomeScreen() {
  const { schedule, refreshing: scheduleRefreshing, error: scheduleError, refresh: refreshSchedule } = useSchedule();
  const { calendar, source: calendarSource, state: calendarState, activate } = useCalendar();
  const { library, source: librarySource, refreshing: libraryRefreshing, error: libraryError, refresh: refreshLibrary } = useLibrary();
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const now = useNow();
  const nextClass = useMemo(() => getNextClass(schedule, now), [now, schedule]);
  const teachingFinished = Boolean(schedule.teachingEnd && singaporeDateKey(now) > schedule.teachingEnd);
  const allAgenda = useMemo(() => upcomingAgendaItems(schedule, calendar, now, 256), [calendar, now, schedule]);
  const agenda = useMemo(() => allAgenda.filter((item) => item.type !== 'academic').slice(0, 3), [allAgenda]);
  const calendarItems = useMemo(() => futureCalendarItems(schedule.academicCalendar ?? [], now), [now, schedule.academicCalendar]);
  const nextBreak = useMemo(
    () => calendarItems.find((item) => item.kind === 'holiday' || item.kind === 'recess' || item.kind === 'vacation') ?? null,
    [calendarItems],
  );
  const otherCourses = useMemo(
    () => (nextClass ? schedule.courses.filter((course) => course.code !== nextClass.course.code) : schedule.courses)
      .slice().sort((left, right) => left.weekday - right.weekday || left.start.localeCompare(right.start)),
    [nextClass, schedule.courses],
  );
  const reducedMotion = useReducedMotion();
  const syncOpacity = useSharedValue(1);
  const syncing = scheduleRefreshing || calendarState === 'refreshing' || libraryRefreshing;

  useEffect(() => {
    cancelAnimation(syncOpacity);
    syncOpacity.value = syncing && !reducedMotion
      ? withRepeat(withSequence(withTiming(0.28, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false)
      : 1;
  }, [reducedMotion, syncOpacity, syncing]);
  const syncDotStyle = useAnimatedStyle(() => ({ opacity: syncOpacity.value }));

  const refreshIssue = scheduleError || calendarState === 'error' || libraryError
    ? '失败'
    : calendarSource === 'cache' || librarySource === 'cache' ? '离线' : null;
  const refreshAll = useCallback(async () => {
    if (syncing) return;
    await Promise.allSettled([refreshSchedule(), activate(), refreshLibrary()]);
  }, [activate, refreshLibrary, refreshSchedule, syncing]);
  const handlePullRefresh = useCallback(async () => {
    if (syncing || pullRefreshing) return;
    setPullRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setPullRefreshing(false);
    }
  }, [pullRefreshing, refreshAll, syncing]);
  const selectCourse = useCallback((course: CourseSession) => {
    const brief = schedule.courseBriefs?.find((item) => item.courseCode === course.code) ?? null;
    const materials = materialsForCourse(library.materials, course.code);
    setSelection({ kind: 'course', course, brief, materials });
  }, [library.materials, schedule.courseBriefs]);
  const resolvedSelection = useMemo<DetailSelection | null>(() => {
    if (!selection || selection.kind !== 'course') return selection;
    const course = schedule.courses.find((item) => item.code === selection.course.code) ?? selection.course;
    const brief = schedule.courseBriefs?.find((item) => item.courseCode === course.code) ?? null;
    return { kind: 'course', course, brief, materials: materialsForCourse(library.materials, course.code) };
  }, [library.materials, schedule.courseBriefs, schedule.courses, selection]);

  return (
    <LinearGradient colors={['#E7FAFD', '#F7FDFC', '#F8F2E3']} locations={[0, 0.62, 1]} style={styles.background}>
      <View pointerEvents="none" style={styles.glow} />
      <View pointerEvents="none" style={styles.shore} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={(<RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            colors={[palette.cyanDeep, palette.cyan, palette.aqua]}
            progressBackgroundColor={palette.foam}
            tintColor={palette.cyanDeep}
          />)}>
          <View style={styles.topbar}>
            <Text style={styles.brand}>知嶼</Text>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="刷新课程、测验、校历和资料"
              disabled={syncing}
              hitSlop={8}
              onPress={() => void refreshAll()}
              style={[styles.refreshButton, Boolean(refreshIssue || syncing) && styles.refreshButtonWide]}>
              {syncing && <Animated.View style={[styles.syncDot, syncDotStyle]} />}
              <Text style={[styles.refreshText, refreshIssue && styles.refreshError]}>{syncing ? '同步' : refreshIssue ?? '↻'}</Text>
            </PressableScale>
          </View>

          <View style={styles.heading}>
            <Text style={styles.overline}>{todayLabel(now)}</Text>
            <Text style={styles.title}>今日</Text>
          </View>

          {nextClass ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`下一节课程 ${nextClass.course.code}，${nextClass.start} 到 ${nextClass.end}，${nextClass.location}`}
              style={styles.nextCard}
              onPress={() => selectCourse(nextClass.course)}>
              <LinearGradient colors={['#169FBE', '#38C5D0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextGradient}>
                <View style={styles.nextTop}>
                  <Text style={styles.nextLabel}>下一课</Text>
                  <Text style={styles.nextDay}>{nextClass.dayText}</Text>
                </View>
                <Text style={styles.nextCode}>{nextClass.course.code}</Text>
                <View style={styles.nextBottom}>
                  <Text style={styles.nextTime}>{nextClass.start}—{nextClass.end}</Text>
                  <Text numberOfLines={1} style={styles.nextLocationText}>{displayLocation(nextClass.location, nextClass.course.locationStatus === 'pending' && nextClass.location === nextClass.course.location)}</Text>
                </View>
              </LinearGradient>
            </PressableScale>
          ) : (
            <PressableScale accessibilityRole="button" accessibilityLabel="刷新课表" style={styles.emptyCard} onPress={() => void refreshAll()}>
              <View style={styles.emptyPulse} />
              <Text style={styles.emptyTitle}>{scheduleRefreshing ? '正在同步' : teachingFinished ? '课程已结束' : '暂无课表'}</Text>
            </PressableScale>
          )}

          {nextBreak && <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`校历，${nextBreak.title}，${nextBreak.start} 到 ${nextBreak.end}`}
            style={styles.calendarCard}
            onPress={() => setSelection({ kind: 'calendar', items: calendarItems })}>
            <Text style={styles.calendarHeading}>校曆</Text>
            <Text numberOfLines={1} style={styles.calendarSummary}>
              {nextBreak.title} · {compactDateRange(nextBreak.start, nextBreak.end)} · {breakCountdown(nextBreak, now)}
            </Text>
            <Text style={styles.calendarArrow}>›</Text>
          </PressableScale>}

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>近期</Text></View>
          <View style={styles.agendaList}>
            {agenda.length === 0
              ? <Text style={styles.listEmpty}>{calendar.updatedAt || schedule.updatedAt ? '暂无事项' : '刷新'}</Text>
              : agenda.map((item, index) => {
                const date = agendaDateParts(item);
                const accent = agendaAccent(item);
                const location = agendaLocation(item, date.time);
                const certainty = item.certainty === 'inferred' && !/(预计|约|推定)/.test(item.title) && !date.time.startsWith('约')
                  ? '推定'
                  : item.certainty === 'pending' && item.start && !/待(定|公布|确认)/.test(item.title) ? '待定' : null;
                return (
                  <PressableScale
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${agendaTypeLabel(item.type)}，${item.title}，${date.date}，${date.time}`}
                    style={[styles.agendaRow, index < agenda.length - 1 && styles.rowBorder]}
                    onPress={() => setSelection({ kind: 'agenda', item })}>
                    <Text style={[styles.agendaDateText, { color: accent }]}>{compactAgendaDate(item)}</Text>
                    <View style={styles.agendaCopy}>
                      <View style={styles.agendaTitleRow}>
                        <Text numberOfLines={1} style={styles.agendaTitle}>{item.title}</Text>
                        {certainty && <Text style={styles.agendaCertainty}>{certainty}</Text>}
                      </View>
                      <Text numberOfLines={1} style={styles.agendaMeta}>{item.courseCode ? `${item.courseCode} · ` : ''}{date.time}{location ? ` · ${location}` : ''}</Text>
                    </View>
                    <Text style={styles.arrow}>›</Text>
                  </PressableScale>
                );
              })}
          </View>

          {otherCourses.length > 0 && <>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>课表</Text></View>
            <View style={styles.courseList}>
              {otherCourses.map((course, index) => (
                <PressableScale
                  key={`${course.code}-${course.weekday}-${course.start}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${course.dayLabel} ${course.code} ${course.start} 到 ${course.end}，${course.location}`}
                  style={[styles.courseRow, index < otherCourses.length - 1 && styles.rowBorder]}
                  onPress={() => selectCourse(course)}>
                  <Text style={styles.courseDay}>{course.dayLabel}</Text>
                  <Text style={styles.courseCode}>{course.code}</Text>
                  <Text style={styles.courseTime}>{course.start}—{course.end}</Text>
                  <Text numberOfLines={1} style={styles.courseLocation}>{displayLocation(course.location, course.locationStatus === 'pending')}</Text>
                  <Text style={styles.smallArrow}>›</Text>
                </PressableScale>
              ))}
            </View>
          </>}
        </ScrollView>
      </SafeAreaView>
      <DetailSheet selection={resolvedSelection} visible={Boolean(selection)} onClose={() => setSelection(null)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  glow: { position: 'absolute', top: -90, right: -110, width: 315, height: 315, borderRadius: 165, backgroundColor: 'rgba(63, 211, 228, 0.21)' },
  shore: { position: 'absolute', left: -80, right: -100, bottom: -150, height: 330, borderTopLeftRadius: 250, borderTopRightRadius: 180, backgroundColor: 'rgba(255, 248, 225, 0.62)', transform: [{ rotate: '-5deg' }] },
  topbar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: palette.ink, fontSize: 27, lineHeight: 34, fontFamily: typography.display },
  refreshButton: { width: 36, minHeight: 34, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.66)' },
  refreshButtonWide: { width: 'auto', minWidth: 64 },
  refreshText: { color: palette.inkSoft, fontSize: 16, lineHeight: 20, fontFamily: typography.medium },
  refreshError: { color: palette.deadline, fontSize: 12 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.cyan },
  heading: { marginTop: 18, marginBottom: 16 },
  overline: { color: '#4F8997', fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  title: { marginTop: 3, color: palette.ink, fontSize: 39, lineHeight: 49, fontFamily: typography.display },
  nextCard: { borderRadius: 24, shadowColor: '#0788A9', shadowOpacity: 0.17, shadowRadius: 20, shadowOffset: { width: 0, height: 11 }, elevation: 9 },
  nextGradient: { minHeight: 144, padding: 20, borderRadius: 24, overflow: 'hidden' },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  nextDay: { color: 'white', fontSize: 14, lineHeight: 19, fontFamily: typography.medium },
  nextCode: { marginTop: 11, color: 'white', fontSize: 29, lineHeight: 35, fontFamily: typography.medium, letterSpacing: 0.4 },
  nextBottom: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  nextTime: { color: 'white', fontSize: 15, lineHeight: 20, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  nextLocationText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, textAlign: 'right', fontFamily: typography.medium },
  emptyCard: { minHeight: 122, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.76)' },
  emptyPulse: { width: 9, height: 9, marginBottom: 12, borderRadius: 5, backgroundColor: palette.cyan },
  emptyTitle: { color: palette.ink, fontSize: 17, lineHeight: 23, fontFamily: typography.medium },
  calendarCard: { minHeight: 66, marginTop: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)' },
  calendarHeading: { color: palette.cyanDeep, fontSize: 22, lineHeight: 30, fontFamily: typography.display },
  calendarSummary: { flex: 1, color: palette.inkSoft, fontSize: 13, lineHeight: 19, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  calendarArrow: { color: '#70A8B4', fontSize: 23, lineHeight: 28, fontFamily: typography.regular },
  sectionHeader: { marginTop: 23, marginBottom: 8, paddingHorizontal: 2 },
  sectionTitle: { color: palette.ink, fontSize: 17, lineHeight: 23, fontFamily: typography.medium },
  agendaList: { paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: palette.glass },
  agendaRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  agendaDateText: { width: 45, fontSize: 12, lineHeight: 17, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  agendaCopy: { flex: 1, minWidth: 0, paddingVertical: 10 },
  agendaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agendaTitle: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 19, fontFamily: typography.medium },
  agendaCertainty: { color: palette.muted, fontSize: 10, lineHeight: 14, fontFamily: typography.regular },
  agendaMeta: { marginTop: 3, color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  listEmpty: { paddingVertical: 20, color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', fontFamily: typography.regular },
  arrow: { width: 16, color: '#70A8B4', textAlign: 'right', fontSize: 22, lineHeight: 27, fontFamily: typography.regular },
  courseList: { paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: palette.glass },
  courseRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9 },
  courseDay: { width: 30, color: palette.cyanDeep, fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
  courseCode: { width: 62, color: palette.ink, fontSize: 14, lineHeight: 19, fontFamily: typography.medium },
  courseTime: { width: 91, color: palette.inkSoft, fontSize: 12, lineHeight: 17, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  courseLocation: { flex: 1, color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: 'right', fontFamily: typography.regular },
  smallArrow: { width: 11, color: '#70A8B4', fontSize: 19, lineHeight: 23, fontFamily: typography.regular },
});

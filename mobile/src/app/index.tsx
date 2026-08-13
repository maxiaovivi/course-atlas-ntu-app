import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DetailSelection, DetailSheet } from '@/components/detail-sheet';
import { MemoryCardCarousel } from '@/components/memory-cards';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { agendaDateParts, agendaTypeLabel, AgendaViewItem, upcomingAgendaItems } from '@/core/agenda';
import { singaporeDateKey } from '@/core/calendar';
import { materialsForCourse } from '@/core/library';
import { AcademicCalendarItem, CourseSession, getNextClass, NextClass } from '@/core/schedule';
import { useCalendar } from '@/hooks/use-calendar';
import { useLibrary } from '@/hooks/use-library';
import { useNow } from '@/hooks/use-now';
import { useSchedule } from '@/hooks/use-schedule';
import { useStudyCards } from '@/hooks/use-study-cards';

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

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

// minutesAway <= 0 means the class has started but not yet ended.
function nextClassStatus(next: NextClass) {
  if (next.minutesAway <= 0) {
    const remaining = timeToMinutes(next.end) - timeToMinutes(next.start) + next.minutesAway;
    return { label: '正在上课', when: `还剩 ${Math.max(1, remaining)} 分钟` };
  }
  if (next.minutesAway < 60) return { label: '下一课', when: `${next.minutesAway} 分钟后` };
  if (next.dayText === '今天') return { label: '下一课', when: `${Math.round(next.minutesAway / 60)} 小时后` };
  return { label: '下一课', when: next.dayText };
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

function dataUpdatedLabel(updatedAt: string) {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return null;
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(time)).map((part) => [part.type, part.value]));
  return `数据 ${Number(values.month)}.${Number(values.day)} ${values.hour}:${values.minute}`;
}

function updateVersionLabel(createdAt: Date | undefined, isEmbeddedLaunch: boolean, isEmergencyLaunch: boolean) {
  if (!createdAt || Number.isNaN(createdAt.getTime())) return '本地预览';
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(createdAt).map((part) => [part.type, part.value]));
  const source = isEmergencyLaunch ? '内置回退' : isEmbeddedLaunch ? '内置' : 'OTA';
  return `${source} · ${values.year}.${String(Number(values.month)).padStart(2, '0')}.${String(Number(values.day)).padStart(2, '0')} ${values.hour}:${values.minute}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { currentlyRunning, isUpdatePending } = Updates.useUpdates();
  const { schedule, refreshing: scheduleRefreshing, error: scheduleError, refresh: refreshSchedule } = useSchedule();
  const { calendar, source: calendarSource, state: calendarState, activate } = useCalendar();
  const { library, source: librarySource, refreshing: libraryRefreshing, error: libraryError, refresh: refreshLibrary } = useLibrary();
  const { payload: studyCards, source: studyCardSource, refreshing: studyCardRefreshing, error: studyCardError, refresh: refreshStudyCards } = useStudyCards();
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const now = useNow();
  const nextClass = useMemo(() => getNextClass(schedule, now), [now, schedule]);
  const nextStatus = nextClass ? nextClassStatus(nextClass) : null;
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
  const syncing = scheduleRefreshing || calendarState === 'refreshing' || libraryRefreshing || studyCardRefreshing;
  const versionLabel = updateVersionLabel(
    currentlyRunning.createdAt,
    currentlyRunning.isEmbeddedLaunch,
    currentlyRunning.isEmergencyLaunch,
  );

  const syncFailed = scheduleError || calendarState === 'error' || libraryError || studyCardError;
  const usingCache = calendarSource === 'cache' || librarySource === 'cache' || studyCardSource === 'cache';
  const dataLabel = dataUpdatedLabel(schedule.updatedAt);
  const lastRefreshAt = useRef(0);
  useEffect(() => { lastRefreshAt.current = Date.now(); }, []);
  const refreshAll = useCallback(async () => {
    if (syncing) return;
    lastRefreshAt.current = Date.now();
    await Promise.allSettled([refreshSchedule(), activate(), refreshLibrary(), refreshStudyCards()]);
  }, [activate, refreshLibrary, refreshSchedule, refreshStudyCards, syncing]);

  // Data is fetched on launch; refresh again when the app returns to the
  // foreground after a while, so a long-lived process does not go stale.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastRefreshAt.current > 10 * 60_000) void refreshAll();
    });
    return () => subscription.remove();
  }, [refreshAll]);
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
            <Text style={styles.brand}>知屿</Text>
            <Text style={styles.topDate}>{todayLabel(now)}</Text>
          </View>
          {syncFailed && !syncing && <Text style={styles.syncHint}>同步失败 · 正在显示缓存数据</Text>}

          {nextClass && nextStatus ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${nextStatus.label} ${nextClass.course.code}，${nextStatus.when}，${nextClass.start} 到 ${nextClass.end}，${nextClass.location}`}
              style={styles.nextCard}
              onPress={() => selectCourse(nextClass.course)}>
              <LinearGradient colors={['#169FBE', '#38C5D0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextGradient}>
                <View style={styles.nextTop}>
                  <Text style={styles.nextLabel}>{nextStatus.label}</Text>
                  <Text style={styles.nextDay}>{nextStatus.when}</Text>
                </View>
                <Text style={styles.nextCode}>{nextClass.course.code}</Text>
                <View style={styles.nextBottom}>
                  <Text style={styles.nextTime}>{nextClass.start}—{nextClass.end}</Text>
                  <Text numberOfLines={1} style={styles.nextLocationText}>{displayLocation(nextClass.location, nextClass.course.locationStatus === 'pending' && nextClass.location === nextClass.course.location)}</Text>
                </View>
              </LinearGradient>
            </PressableScale>
          ) : (
            <View accessibilityLabel="暂无课表，下拉刷新" style={styles.emptyCard}>
              <View style={styles.emptyPulse} />
              <Text style={styles.emptyTitle}>{scheduleRefreshing ? '正在同步' : teachingFinished ? '课程已结束' : '暂无课表'}</Text>
              {!scheduleRefreshing && !teachingFinished && <Text style={styles.emptyHint}>下拉刷新</Text>}
            </View>
          )}

          <MemoryCardCarousel
            cards={studyCards.cards}
            onOpen={(card) => router.push({ pathname: '/memory', params: { cardId: card.id } })}
          />

          {nextBreak && <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`校历，${nextBreak.title}，${nextBreak.start} 到 ${nextBreak.end}`}
            style={styles.calendarCard}
            onPress={() => setSelection({ kind: 'calendar', items: calendarItems })}>
            <Text style={styles.calendarHeading}>校历</Text>
            <Text numberOfLines={1} style={styles.calendarSummary}>
              {nextBreak.title} · {compactDateRange(nextBreak.start, nextBreak.end)} · {breakCountdown(nextBreak, now)}
            </Text>
            <Text style={styles.calendarArrow}>›</Text>
          </PressableScale>}

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>近期</Text></View>
          <View style={styles.agendaList}>
            {agenda.length === 0
              ? <Text style={styles.listEmpty}>暂无事项</Text>
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

          <Text
            accessibilityLabel={`当前运行版本，${versionLabel}${dataLabel ? `，${dataLabel}` : ''}${isUpdatePending ? '，新版待重启' : ''}${usingCache && !syncFailed ? '，离线缓存' : ''}`}
            style={[styles.versionText, syncFailed && styles.versionIssue]}>
            {versionLabel}{dataLabel ? ` · ${dataLabel}` : ''}{isUpdatePending ? ' · 新版待重启' : ''}{usingCache && !syncFailed ? ' · 离线缓存' : ''}
          </Text>
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
  glow: { position: 'absolute', top: -130, right: -140, width: 315, height: 315, borderRadius: 165, backgroundColor: 'rgba(63, 211, 228, 0.12)' },
  shore: { position: 'absolute', left: -80, right: -100, bottom: -210, height: 330, borderTopLeftRadius: 250, borderTopRightRadius: 180, backgroundColor: 'rgba(255, 248, 225, 0.4)', transform: [{ rotate: '-4deg' }] },
  topbar: { minHeight: 64, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { color: palette.ink, fontSize: 31, lineHeight: 42, fontFamily: typography.display },
  topDate: { color: '#4F8997', fontSize: 13, lineHeight: 18, fontFamily: typography.medium },
  syncHint: { marginTop: -4, marginBottom: 10, color: 'rgba(184, 91, 73, 0.85)', fontSize: 12, lineHeight: 17, fontFamily: typography.medium },
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
  emptyHint: { marginTop: 5, color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: typography.regular },
  calendarCard: { minHeight: 66, marginTop: 15, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: palette.line, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.72)' },
  calendarHeading: { color: palette.cyanDeep, fontSize: 22, lineHeight: 30, fontFamily: typography.display },
  calendarSummary: { flex: 1, color: palette.inkSoft, fontSize: 13, lineHeight: 19, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  calendarArrow: { color: '#70A8B4', fontSize: 23, lineHeight: 28, fontFamily: typography.regular },
  sectionHeader: { marginTop: 24, marginBottom: 8, paddingHorizontal: 2 },
  sectionTitle: { color: palette.ink, fontSize: 21, lineHeight: 30, fontFamily: typography.display },
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
  versionText: { marginTop: 22, color: 'rgba(67, 119, 129, 0.58)', fontSize: 10, lineHeight: 15, textAlign: 'center', fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  versionIssue: { color: 'rgba(184, 91, 73, 0.72)' },
});

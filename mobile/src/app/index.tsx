import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { DetailSelection, DetailSheet } from '@/components/detail-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';
import { agendaCertaintyLabel, agendaDateParts, agendaTypeLabel, AgendaViewItem, upcomingAgendaItems } from '@/core/agenda';
import { singaporeDateKey } from '@/core/calendar';
import { CourseSession, getNextClass } from '@/core/schedule';
import { useCalendar } from '@/hooks/use-calendar';
import { useNow } from '@/hooks/use-now';
import { useSchedule } from '@/hooks/use-schedule';

function calendarUpdateLabel(updatedAt: string) {
  const updated = new Date(updatedAt);
  if (singaporeDateKey(updated) === singaporeDateKey(new Date())) {
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(updated);
  }
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Singapore', month: 'numeric', day: 'numeric' }).format(updated);
}

function todayLabel(now: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', weekday: 'long',
  }).format(now);
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
  return startMonth === endMonth ? `${start}–${endDay}` : `${start}–${end}`;
}

function agendaAccent(item: AgendaViewItem) {
  if (item.type === 'quiz' || item.type === 'ca') return palette.quiz;
  if (item.type === 'deadline') return palette.deadline;
  if (item.type === 'academic') return palette.academic;
  return palette.notice;
}

function titleIncludesAgendaType(item: AgendaViewItem) {
  if (item.type === 'quiz') return /(\bquiz\b|\u6d4b\u9a8c)/i.test(item.title);
  if (item.type === 'ca') return /\bca(?:\s*\d+)?\b/i.test(item.title);
  if (item.type === 'deadline') return /(\u622a\u6b62|\u622a\u6b62\u65e5\u671f|\bdue\b)/i.test(item.title);
  if (item.type === 'notice') return /(\u901a\u77e5|\bnotice\b)/i.test(item.title);
  return false;
}

function titleIncludesCertainty(item: AgendaViewItem) {
  if (item.certainty === 'pending') return /(\u5f85\u516c\u5e03|\u5c1a\u672a\u516c\u5e03|\u5f85\u5b9a|\u5f85\u786e\u8ba4)/.test(item.title);
  if (item.certainty === 'inferred') return /(\u9884\u8ba1|\u7ea6|\u63a8\u5b9a)/.test(item.title);
  return true;
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

export default function HomeScreen() {
  const { schedule, refreshing: scheduleRefreshing, error: scheduleError, refresh: refreshSchedule } = useSchedule();
  const { calendar, source: calendarSource, state: calendarState, activate } = useCalendar();
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const now = useNow();
  const nextClass = useMemo(() => getNextClass(schedule, now), [now, schedule]);
  const teachingFinished = Boolean(schedule.teachingEnd && singaporeDateKey(now) > schedule.teachingEnd);
  const allAgenda = useMemo(() => upcomingAgendaItems(schedule, calendar, now, 256), [calendar, now, schedule]);
  const agenda = useMemo(() => allAgenda.slice(0, 6), [allAgenda]);
  const visibleAgendaIds = useMemo(() => new Set(agenda.map((item) => item.id)), [agenda]);
  const otherCourses = useMemo(
    () => nextClass ? schedule.courses.filter((course) => course.code !== nextClass.course.code) : schedule.courses,
    [nextClass, schedule.courses],
  );
  const reducedMotion = useReducedMotion();
  const syncOpacity = useSharedValue(1);
  const syncing = scheduleRefreshing || calendarState === 'refreshing';

  useEffect(() => {
    cancelAnimation(syncOpacity);
    syncOpacity.value = syncing && !reducedMotion
      ? withRepeat(withSequence(withTiming(0.3, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false)
      : 1;
  }, [reducedMotion, syncOpacity, syncing]);
  const syncDotStyle = useAnimatedStyle(() => ({ opacity: syncOpacity.value }));

  const calendarLabel = syncing
    ? '正在同步'
    : scheduleError || calendarState === 'error'
      ? '更新失败'
      : calendarSource === 'cache'
        ? '离线缓存'
        : calendar.updatedAt ? `更新于 ${calendarUpdateLabel(calendar.updatedAt)}` : '刷新';
  const refreshAll = useCallback(async () => {
    if (syncing) return;
    await Promise.allSettled([refreshSchedule(), activate()]);
  }, [activate, refreshSchedule, syncing]);
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
    setSelection({
      kind: 'course',
      course,
      agenda: allAgenda.filter((item) => item.courseCode === course.code && !visibleAgendaIds.has(item.id)).slice(0, 8),
    });
  }, [allAgenda, visibleAgendaIds]);

  return (
    <LinearGradient colors={['#E7FAFD', '#F7FDFC', '#F8F2E3']} locations={[0, 0.62, 1]} style={styles.background}>
      <View pointerEvents="none" style={styles.glow} />
      <View pointerEvents="none" style={styles.shore} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={(
            <RefreshControl
              refreshing={pullRefreshing}
              onRefresh={handlePullRefresh}
              colors={[palette.cyanDeep, palette.cyan, palette.aqua]}
              progressBackgroundColor={palette.foam}
              tintColor={palette.cyanDeep}
            />
          )}>
          <View style={styles.topbar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>知</Text></View>
              <View>
                <Text style={styles.brand}>知屿</Text>
                <Text style={styles.brandCaption}>NTU COURSE ATLAS</Text>
              </View>
            </View>
            <PressableScale accessibilityRole="button" accessibilityLabel="刷新课程、测验和校历" disabled={syncing} hitSlop={8} onPress={() => void refreshAll()} style={styles.syncPill}>
              <Animated.View style={[styles.syncDot, (scheduleError || calendarState === 'error' || calendarSource === 'cache') && styles.syncDotOffline, syncDotStyle]} />
              <Text numberOfLines={1} style={styles.syncPillText}>{calendarLabel}</Text>
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
                  <Text style={styles.nextLabel}>{nextClass.label ?? '下一节课'}</Text>
                  <Text style={styles.nextDay}>{nextClass.dayText}</Text>
                </View>
                <View style={styles.nextIdentity}>
                  <Text style={styles.nextCode}>{nextClass.course.code}</Text>
                  <Text numberOfLines={2} style={styles.nextName}>{nextClass.course.name}</Text>
                </View>
                <Text style={styles.nextTime}>{nextClass.start} — {nextClass.end}</Text>
                <View style={styles.nextLocation}>
                  <View style={styles.nextLocationDot} />
                  <Text numberOfLines={1} style={styles.nextLocationText}>{displayLocation(nextClass.location, nextClass.course.locationStatus === 'pending' && nextClass.location === nextClass.course.location)}</Text>
                </View>
              </LinearGradient>
            </PressableScale>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyPulse} />
              <Text style={styles.emptyTitle}>{scheduleRefreshing ? '正在获取课表' : teachingFinished ? '本学期课程已结束' : '暂无课表'}</Text>
              <Text style={styles.emptyText}>{scheduleRefreshing ? '完成一次同步后即可离线查看。' : teachingFinished ? '仍可查看下方课表与事项。' : '点击右上角刷新。'}</Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>近期事项</Text>
          </View>
          <View style={styles.agendaList}>
            {agenda.length === 0
              ? <Text style={styles.listEmpty}>{calendar.updatedAt || schedule.updatedAt ? '暂无近期事项' : '刷新后显示近期事项'}</Text>
              : agenda.map((item, index) => {
                const date = agendaDateParts(item);
                const accent = agendaAccent(item);
                const showType = !titleIncludesAgendaType(item);
                const showCertainty = item.certainty !== 'confirmed' && !titleIncludesCertainty(item);
                const location = agendaLocation(item, date.time);
                return (
                  <PressableScale
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${agendaTypeLabel(item.type)}，${item.title}，${date.date}，${date.time}`}
                    style={[styles.agendaRow, index < agenda.length - 1 && styles.rowBorder]}
                    onPress={() => setSelection({ kind: 'agenda', item })}>
                    <View style={[styles.agendaDate, { borderColor: `${accent}33`, backgroundColor: `${accent}12` }]}>
                      <Text style={[styles.agendaDateText, { color: accent }]}>{compactAgendaDate(item)}</Text>
                    </View>
                    <View style={styles.agendaCopy}>
                      {(showType || showCertainty) && <View style={styles.agendaTags}>
                        {showType && <Text style={[styles.agendaType, { color: accent }]}>{agendaTypeLabel(item.type)}</Text>}
                        {showCertainty && <Text style={styles.agendaCertainty}>{agendaCertaintyLabel(item.certainty)}</Text>}
                      </View>}
                      <Text numberOfLines={2} style={styles.agendaTitle}>{item.title}</Text>
                      <Text numberOfLines={1} style={styles.agendaMeta}>{item.courseCode ? `${item.courseCode} · ` : ''}{date.time}{location ? ` · ${location}` : ''}</Text>
                    </View>
                    <Text style={styles.arrow}>›</Text>
                  </PressableScale>
                );
              })}
          </View>

          {otherCourses.length > 0 && <>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{nextClass ? '其他课程' : '本周课程'}</Text></View>
            <View style={styles.courseList}>
              {otherCourses.map((course, index) => (
                <PressableScale
                  key={`${course.code}-${course.weekday}-${course.start}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${course.dayLabel} ${course.code} ${course.start} 到 ${course.end}，${course.location}`}
                  style={styles.courseCard}
                  onPress={() => selectCourse(course)}>
                  <View style={styles.dayColumn}>
                    <Text style={styles.dayEnglish}>{course.dayLabel}</Text>
                    {index < otherCourses.length - 1 && <View style={styles.dayLine} />}
                  </View>
                  <View style={[styles.courseMain, index === otherCourses.length - 1 && styles.courseMainLast]}>
                    <View style={styles.courseTitleRow}>
                      <Text style={styles.courseCode}>{course.code}</Text>
                      {course.section && <Text style={styles.group}>{course.section}</Text>}
                    </View>
                    <Text numberOfLines={1} style={styles.courseName}>{course.name}</Text>
                    <Text style={styles.courseTime}>{course.start} — {course.end}</Text>
                    <View style={styles.locationRow}>
                      <View style={[styles.locationDot, course.locationStatus === 'confirmed' && styles.locationDotConfirmed]} />
                      <Text numberOfLines={1} style={styles.locationText}>{displayLocation(course.location, course.locationStatus === 'pending')}</Text>
                    </View>
                  </View>
                  <Text style={styles.arrow}>›</Text>
                </PressableScale>
              ))}
            </View>
          </>}
        </ScrollView>
      </SafeAreaView>
      <DetailSheet selection={selection} visible={Boolean(selection)} onClose={() => setSelection(null)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  glow: { position: 'absolute', top: -90, right: -110, width: 315, height: 315, borderRadius: 165, backgroundColor: 'rgba(63, 211, 228, 0.21)' },
  shore: { position: 'absolute', left: -80, right: -100, bottom: -150, height: 330, borderTopLeftRadius: 250, borderTopRightRadius: 180, backgroundColor: 'rgba(255, 248, 225, 0.62)', transform: [{ rotate: '-5deg' }] },
  topbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 41, height: 41, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(29, 162, 195, 0.2)', borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.78)' },
  brandMarkText: { color: palette.cyanDeep, fontSize: 22, lineHeight: 28, fontFamily: typography.display },
  brand: { color: palette.ink, fontSize: 25, lineHeight: 29, fontFamily: typography.display },
  brandCaption: { marginTop: 1, color: palette.muted, fontSize: 9, lineHeight: 12, fontFamily: typography.medium, letterSpacing: 1.2 },
  syncPill: { maxWidth: 128, minHeight: 34, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.66)' },
  syncPillText: { flexShrink: 1, color: palette.inkSoft, fontSize: 12, lineHeight: 16, fontFamily: typography.medium },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ABC94' },
  syncDotOffline: { backgroundColor: palette.deadline },
  heading: { marginTop: 24, marginBottom: 21 },
  overline: { color: '#4F8997', fontSize: 12, lineHeight: 17, fontFamily: typography.medium, letterSpacing: 0.45 },
  title: { marginTop: 5, color: palette.ink, fontSize: 38, lineHeight: 48, fontFamily: typography.display },
  nextCard: { borderRadius: 25, shadowColor: '#0788A9', shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  nextGradient: { minHeight: 182, padding: 21, borderRadius: 25, overflow: 'hidden' },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 17, fontFamily: typography.medium, letterSpacing: 0.6 },
  nextDay: { color: 'white', fontSize: 14, lineHeight: 19, fontFamily: typography.medium },
  nextIdentity: { marginTop: 17 },
  nextCode: { color: 'white', fontSize: 30, lineHeight: 36, fontFamily: typography.medium, letterSpacing: 0.5 },
  nextName: { maxWidth: '92%', marginTop: 2, color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 19, fontFamily: typography.regular },
  nextTime: { marginTop: 18, color: 'white', fontSize: 19, lineHeight: 25, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  nextLocation: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 7 },
  nextLocationDot: { width: 7, height: 7, borderWidth: 1.5, borderColor: 'white', borderRadius: 4 },
  nextLocationText: { flexShrink: 1, color: 'rgba(255,255,255,0.84)', fontSize: 13, lineHeight: 18, fontFamily: typography.medium },
  emptyCard: { minHeight: 164, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.76)' },
  emptyPulse: { width: 11, height: 11, marginBottom: 15, borderRadius: 6, backgroundColor: palette.cyan },
  emptyTitle: { color: palette.ink, fontSize: 18, lineHeight: 25, fontFamily: typography.medium },
  emptyText: { maxWidth: 260, marginTop: 7, color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', fontFamily: typography.regular },
  sectionHeader: { marginTop: 28, marginBottom: 11, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  sectionTitle: { color: palette.ink, fontSize: 18, lineHeight: 25, fontFamily: typography.medium },
  sectionHint: { flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: 'right', fontFamily: typography.regular },
  agendaList: { paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 22, backgroundColor: palette.glass },
  agendaRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  agendaDate: { width: 54, minHeight: 43, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 13 },
  agendaDateText: { fontSize: 12, lineHeight: 17, textAlign: 'center', fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  agendaCopy: { flex: 1, minWidth: 0, paddingVertical: 13 },
  agendaTags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  agendaType: { fontSize: 11, lineHeight: 15, fontFamily: typography.medium, letterSpacing: 0.3 },
  agendaCertainty: { color: palette.muted, fontSize: 11, lineHeight: 15, fontFamily: typography.regular },
  agendaTitle: { marginTop: 4, color: palette.ink, fontSize: 15, lineHeight: 21, fontFamily: typography.medium },
  agendaMeta: { marginTop: 4, color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.regular, fontVariant: ['tabular-nums'] },
  listEmpty: { paddingVertical: 24, color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', fontFamily: typography.regular },
  courseList: { paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 24, backgroundColor: palette.glass, shadowColor: '#2B7E91', shadowOpacity: 0.06, shadowRadius: 26, shadowOffset: { width: 0, height: 13 } },
  courseCard: { minHeight: 118, flexDirection: 'row', alignItems: 'center' },
  dayColumn: { width: 46, alignSelf: 'stretch', alignItems: 'center', paddingTop: 24 },
  dayEnglish: { color: palette.cyanDeep, fontSize: 13, lineHeight: 18, fontFamily: typography.medium },
  dayLine: { width: 1, flex: 1, marginTop: 8, backgroundColor: 'rgba(34, 151, 177, 0.13)' },
  courseMain: { flex: 1, minWidth: 0, paddingVertical: 17, paddingLeft: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  courseMainLast: { borderBottomWidth: 0 },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseCode: { color: palette.ink, fontSize: 17, lineHeight: 23, fontFamily: typography.medium, letterSpacing: 0.25 },
  group: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, color: palette.cyanDeep, backgroundColor: '#DDF5F7', fontSize: 10, lineHeight: 14, fontFamily: typography.medium },
  courseName: { marginTop: 4, color: palette.inkSoft, fontSize: 13, lineHeight: 18, fontFamily: typography.regular },
  courseTime: { marginTop: 9, color: '#467C88', fontSize: 14, lineHeight: 19, fontFamily: typography.medium, fontVariant: ['tabular-nums'] },
  locationRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.deadline },
  locationDotConfirmed: { backgroundColor: '#2ABC94' },
  locationText: { flexShrink: 1, color: palette.muted, fontSize: 12, lineHeight: 17, fontFamily: typography.regular },
  arrow: { width: 22, color: '#70A8B4', textAlign: 'right', fontSize: 24, lineHeight: 30, fontWeight: '300', fontFamily: typography.regular },
});

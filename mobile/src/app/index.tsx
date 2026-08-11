import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { palette } from '@/constants/palette';
import { CourseSession, getNextClass } from '@/core/schedule';
import { useSchedule } from '@/hooks/use-schedule';
import { useNtuLearnSync } from '@/hooks/use-ntulearn-sync';
import { PressableScale } from '@/components/pressable-scale';
import { ScheduleSheet } from '@/components/schedule-sheet';

const DAY_NUMBERS: Record<number, string> = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };

export default function HomeScreen() {
  const { schedule, refreshing, refresh } = useSchedule();
  const { status: ntuStatus, activating, activate } = useNtuLearnSync();
  const [selected, setSelected] = useState<CourseSession | null>(null);
  const nextClass = useMemo(() => getNextClass(schedule), [schedule]);
  const reducedMotion = useReducedMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(withSequence(withTiming(1, { duration: 5200 }), withTiming(0, { duration: 5200 })), -1, true);
  }, [drift, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * -22 }, { translateY: drift.value * 18 }, { scale: 1 + drift.value * 0.05 }],
  }));

  const syncActive = activating || ntuStatus.state === 'queued' || ntuStatus.state === 'running';
  const syncLabel = syncActive ? '正在同步' : ntuStatus.state === 'login_required' ? '需要登录' : ntuStatus.state === 'error' ? '重试同步' : '刷新 NTULearn';

  return (
    <LinearGradient colors={['#E6F9FD', '#F8FEFB', '#F8F2E3']} locations={[0, 0.58, 1]} style={styles.background}>
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <View pointerEvents="none" style={styles.shore} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.cyan} colors={[palette.cyan]} progressBackgroundColor={palette.foam} />}>
          <View style={styles.topbar}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>知</Text></View>
              <View>
                <Text style={styles.brand}>知屿</Text>
                <Text style={styles.brandCaption}>NTU COURSE ATLAS</Text>
              </View>
            </View>
            <PressableScale accessibilityRole="button" accessibilityLabel="刷新 NTULearn" disabled={syncActive} onPress={activate} style={styles.syncPill}>
              <View style={[styles.syncDot, (ntuStatus.state === 'error' || ntuStatus.state === 'login_required') && styles.syncDotOffline]} />
              <Text style={styles.syncPillText}>{syncLabel}</Text>
            </PressableScale>
          </View>

          <View style={styles.heading}>
            <Text style={styles.overline}>{schedule.academicYear ? `${schedule.academicYear} · SEMESTER ${schedule.semester}` : 'NTU COURSE ATLAS'}</Text>
            <Text style={styles.title}>本周课表</Text>
            <Text style={styles.subtitle}>时间采用新加坡时区。地点确认后会自动更新。</Text>
          </View>

          {nextClass ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={`下一节课程 ${nextClass.course.code}`} style={styles.nextCard} onPress={() => setSelected(nextClass.course)}>
              <LinearGradient colors={['rgba(23, 162, 197, 0.96)', 'rgba(50, 196, 207, 0.88)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextGradient}>
                <View style={styles.nextTop}><Text style={styles.nextLabel}>{nextClass.label ?? '下一节'}</Text><Text style={styles.nextDay}>{nextClass.dayText}</Text></View>
                <Text style={styles.nextCode}>{nextClass.course.code}</Text>
                <Text numberOfLines={1} style={styles.nextName}>{nextClass.course.name}</Text>
                <View style={styles.nextBottom}>
                  <Text style={styles.nextTime}>{nextClass.start} — {nextClass.end}</Text>
                  <View style={styles.nextLocation}><View style={styles.nextLocationDot} /><Text style={styles.nextLocationText}>{nextClass.location}</Text></View>
                </View>
              </LinearGradient>
            </PressableScale>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyPulse} />
              <Text style={styles.emptyTitle}>{refreshing ? '正在获取课表' : '暂时无法获取课表'}</Text>
              <Text style={styles.emptyText}>{refreshing ? '首次打开需要连接 Course Atlas。' : '下拉即可重新同步，已有缓存时会自动显示。'}</Text>
            </View>
          )}

          {schedule.courses.length > 0 && <><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>固定安排</Text><Text style={styles.sectionHint}>点击查看详情</Text></View>
          <View style={styles.courseList}>
            {schedule.courses.map((course, index) => (
              <PressableScale key={course.code} accessibilityRole="button" accessibilityLabel={`${course.dayLabel} ${course.code} ${course.start} 到 ${course.end}`} style={styles.courseCard} onPress={() => setSelected(course)}>
                <View style={styles.dayColumn}>
                  <Text style={styles.dayEnglish}>{DAY_NUMBERS[course.weekday]}</Text>
                  <Text style={styles.dayChinese}>{course.dayLabel.slice(1)}</Text>
                  {index < schedule.courses.length - 1 && <View style={styles.dayLine} />}
                </View>
                <View style={styles.courseMain}>
                  <View style={styles.courseTitleRow}>
                    <Text style={styles.courseCode}>{course.code}</Text>
                    {course.section && <Text style={styles.group}>{course.section}</Text>}
                  </View>
                  <Text numberOfLines={1} style={styles.courseName}>{course.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.courseTime}>{course.start} — {course.end}</Text>
                    <View style={styles.locationRow}><View style={styles.locationDot} /><Text style={styles.locationText}>{course.location}</Text></View>
                  </View>
                </View>
                <Text style={styles.arrow}>›</Text>
              </PressableScale>
            ))}
          </View></>}

          {ntuStatus.message && <View style={styles.syncNotice}><Text style={styles.syncNoticeText}>{ntuStatus.message}</Text></View>}
          {schedule.source && <View style={styles.sourceNote}><Text style={styles.sourceLabel}>数据来源</Text><Text numberOfLines={1} style={styles.sourceValue}>{schedule.source}</Text></View>}
        </ScrollView>
      </SafeAreaView>
      <ScheduleSheet course={selected} source={schedule.source} visible={Boolean(selected)} onClose={() => setSelected(null)} />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 34 },
  glow: { position: 'absolute', top: -90, right: -95, width: 310, height: 310, borderRadius: 160, backgroundColor: 'rgba(55, 211, 232, 0.23)' },
  shore: { position: 'absolute', left: -80, right: -100, bottom: -120, height: 330, borderTopLeftRadius: 250, borderTopRightRadius: 180, backgroundColor: 'rgba(255, 248, 224, 0.6)', transform: [{ rotate: '-5deg' }] },
  topbar: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(29, 162, 195, 0.2)', borderRadius: 14, backgroundColor: 'rgba(255, 255, 255, 0.74)' },
  brandMarkText: { color: palette.cyanDeep, fontSize: 18, fontWeight: '600' },
  brand: { color: palette.ink, fontSize: 18, fontWeight: '600', letterSpacing: 1.2 },
  brandCaption: { marginTop: 2, color: palette.muted, fontSize: 7, fontWeight: '700', letterSpacing: 1.4 },
  syncPill: { height: 30, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.58)' },
  syncPillText: { color: palette.inkSoft, fontSize: 10, fontWeight: '600' },
  syncDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#2BC79D' },
  syncDotOffline: { backgroundColor: '#E8A74F' },
  syncNotice: { marginTop: 16, paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.55)' },
  syncNoticeText: { color: palette.muted, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  heading: { marginTop: 23, marginBottom: 23 },
  overline: { color: '#5592A2', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { marginTop: 10, color: palette.ink, fontSize: 40, lineHeight: 48, fontWeight: '500', letterSpacing: -1.5 },
  subtitle: { marginTop: 6, color: palette.muted, fontSize: 13, lineHeight: 20 },
  nextCard: { borderRadius: 27, shadowColor: '#0788A9', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 13 }, elevation: 12 },
  nextGradient: { minHeight: 211, padding: 22, borderRadius: 27, overflow: 'hidden' },
  nextTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.83)', fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  nextDay: { color: 'white', fontSize: 13, fontWeight: '700' },
  nextCode: { marginTop: 26, color: 'white', fontSize: 34, fontWeight: '700', letterSpacing: 0.8 },
  nextName: { marginTop: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '500' },
  nextBottom: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextTime: { color: 'white', fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  nextLocation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextLocationDot: { width: 6, height: 6, borderWidth: 1.5, borderColor: 'white', borderRadius: 4 },
  nextLocationText: { color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '600' },
  emptyCard: { minHeight: 211, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.7)' },
  emptyPulse: { width: 12, height: 12, marginBottom: 18, borderRadius: 6, backgroundColor: palette.cyan },
  emptyTitle: { color: palette.ink, fontSize: 18, fontWeight: '700' },
  emptyText: { maxWidth: 260, marginTop: 8, color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  sectionHeader: { marginTop: 29, marginBottom: 11, paddingHorizontal: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  sectionHint: { color: palette.muted, fontSize: 9, fontWeight: '600' },
  courseList: { paddingHorizontal: 14, borderWidth: 1, borderColor: palette.line, borderRadius: 25, backgroundColor: 'rgba(255, 255, 255, 0.73)', shadowColor: '#2B7E91', shadowOpacity: 0.08, shadowRadius: 30, shadowOffset: { width: 0, height: 14 } },
  courseCard: { minHeight: 107, flexDirection: 'row', alignItems: 'center' },
  dayColumn: { width: 45, alignSelf: 'stretch', alignItems: 'center', paddingTop: 24 },
  dayEnglish: { color: '#80A3AB', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  dayChinese: { marginTop: 5, color: palette.cyanDeep, fontSize: 17, fontWeight: '700' },
  dayLine: { width: 1, flex: 1, marginTop: 8, backgroundColor: 'rgba(34, 151, 177, 0.12)' },
  courseMain: { flex: 1, minWidth: 0, paddingVertical: 18, paddingLeft: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseCode: { color: palette.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  group: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, color: palette.cyanDeep, backgroundColor: '#DDF5F7', fontSize: 8, fontWeight: '700' },
  courseName: { marginTop: 5, color: palette.inkSoft, fontSize: 11, lineHeight: 16, fontWeight: '500' },
  metaRow: { marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  courseTime: { color: '#4E8390', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  locationDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#E6A64D' },
  locationText: { color: '#879FA5', fontSize: 9, fontWeight: '600' },
  arrow: { width: 24, color: '#70A8B4', textAlign: 'right', fontSize: 24, fontWeight: '300' },
  sourceNote: { marginTop: 18, paddingHorizontal: 3, flexDirection: 'row', justifyContent: 'space-between' },
  sourceLabel: { color: '#8CA5AA', fontSize: 8, fontWeight: '600' },
  sourceValue: { maxWidth: '72%', color: '#7C989F', fontSize: 8, fontWeight: '600', textAlign: 'right' },
});

import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { CourseSession } from '@/core/schedule';
import { palette } from '@/constants/palette';

type Props = {
  course: CourseSession | null;
  source: string;
  visible: boolean;
  onClose: () => void;
};

export function ScheduleSheet({ course, source, visible, onClose }: Props) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [shownCourse, setShownCourse] = useState(course);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const sheetHeight = Math.min(610, height * 0.72);

  useEffect(() => {
    if (visible) {
      if (course) setShownCourse(course);
      setMounted(true);
      dragY.value = 0;
      progress.value = withTiming(1, { duration: 270 });
      void Haptics.selectionAsync();
      return;
    }
    progress.value = withTiming(0, { duration: 210 }, (finished) => {
      if (finished) {
        runOnJS(setMounted)(false);
        runOnJS(setShownCourse)(null);
      }
    });
  }, [course, dragY, progress, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [sheetHeight + 30, 0]) + dragY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0, 1], [0, 1]) }));

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => { dragY.value = Math.max(0, event.translationY); })
    .onEnd((event) => {
      if (dragY.value > 115 || event.velocityY > 950) {
        runOnJS(onClose)();
      } else {
        dragY.value = withSpring(0, { damping: 23, stiffness: 260, mass: 0.65 });
      }
    });

  if (!mounted || !shownCourse) return null;

  return (
    <Modal transparent visible={mounted} hardwareAccelerated statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
          <Pressable accessibilityLabel="关闭课程详情" style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { height: sheetHeight }, sheetStyle]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.overline}>COURSE DETAILS</Text>
                <Text style={styles.code}>{shownCourse.code}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={12} style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.title}>{shownCourse.name}</Text>
            <Text style={styles.zh}>{shownCourse.zh}</Text>

            <View style={styles.primaryRow}>
              <View style={styles.dayBlock}>
                <Text style={styles.dayLabel}>{shownCourse.dayLabel}</Text>
                <Text style={styles.category}>{shownCourse.category === 'Specialized' ? '专业选修' : '普通选修'}</Text>
              </View>
              <View style={styles.timeBlock}>
                <Text style={styles.time}>{shownCourse.start}</Text>
                <Text style={styles.to}>—</Text>
                <Text style={styles.time}>{shownCourse.end}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}><View style={styles.pinDot} /></View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoLabel}>上课地点</Text>
                <Text style={styles.infoValue}>{shownCourse.location}</Text>
                <Text style={styles.infoHint}>等待 {shownCourse.locationSource} 的当届教室安排</Text>
              </View>
              <View style={styles.pendingPill}><Text style={styles.pendingPillText}>待确认</Text></View>
            </View>

            {shownCourse.section && <View style={styles.detailLine}><Text style={styles.detailLabel}>班级</Text><Text style={styles.detailValue}>{shownCourse.section}</Text></View>}
            {shownCourse.note && <View style={styles.note}><Text style={styles.noteText}>{shownCourse.note}</Text></View>}

            <View style={styles.sourceLine}>
              <Text style={styles.sourceLabel}>时间来源</Text>
              <Text numberOfLines={1} style={styles.sourceValue}>{source}</Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 78, 97, 0.14)' },
  sheet: { paddingHorizontal: 24, paddingBottom: 30, borderTopLeftRadius: 34, borderTopRightRadius: 34, backgroundColor: 'rgba(248, 254, 254, 0.98)', shadowColor: '#0A5268', shadowOpacity: 0.2, shadowRadius: 36, shadowOffset: { width: 0, height: -12 }, elevation: 28 },
  handle: { width: 42, height: 4, alignSelf: 'center', marginTop: 10, marginBottom: 20, borderRadius: 4, backgroundColor: 'rgba(48, 124, 143, 0.2)' },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  overline: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  code: { marginTop: 6, color: palette.cyanDeep, fontSize: 17, fontWeight: '800', letterSpacing: 0.8 },
  closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#E7F7F9' },
  closeText: { marginTop: -2, color: palette.inkSoft, fontSize: 27, fontWeight: '300' },
  title: { maxWidth: 540, marginTop: 25, color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '500', letterSpacing: -0.8 },
  zh: { marginTop: 7, color: palette.muted, fontSize: 14, fontWeight: '500' },
  primaryRow: { marginTop: 27, paddingVertical: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  dayBlock: { gap: 6 },
  dayLabel: { color: palette.ink, fontSize: 25, fontWeight: '600' },
  category: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  timeBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  time: { color: palette.ink, fontSize: 23, fontVariant: ['tabular-nums'], fontWeight: '500' },
  to: { color: '#8CB0B8', fontSize: 14 },
  infoRow: { marginTop: 19, padding: 16, flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: '#ECFAFB' },
  infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#D9F4F7' },
  pinDot: { width: 11, height: 11, borderWidth: 3, borderColor: palette.cyan, borderRadius: 8 },
  infoCopy: { flex: 1, marginLeft: 13 },
  infoLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  infoValue: { marginTop: 4, color: palette.ink, fontSize: 16, fontWeight: '700' },
  infoHint: { marginTop: 4, color: '#7B9CA4', fontSize: 10, lineHeight: 15 },
  pendingPill: { marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: '#FFF4DF' },
  pendingPillText: { color: palette.warning, fontSize: 9, fontWeight: '700' },
  detailLine: { marginTop: 14, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  detailValue: { color: palette.ink, fontSize: 11, fontWeight: '700' },
  note: { marginTop: 15, padding: 14, borderRadius: 16, backgroundColor: '#F3F8F7' },
  noteText: { color: palette.inkSoft, fontSize: 11, lineHeight: 17 },
  sourceLine: { marginTop: 'auto', paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.line },
  sourceLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' },
  sourceValue: { maxWidth: '72%', color: palette.inkSoft, fontSize: 9, fontWeight: '600', textAlign: 'right' },
});

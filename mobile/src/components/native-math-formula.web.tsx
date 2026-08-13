// Web-only stand-in so the local `expo start --web` design preview can load.
// Android resolves native-math-formula.tsx and keeps native RaTeX rendering.
import { StyleSheet, Text, View } from 'react-native';

import { palette } from '@/constants/palette';

type Props = {
  latex: string;
  color?: string;
  fontSize?: number;
};

export function NativeMathFormula({ latex, fontSize = 22 }: Props) {
  return (
    <View pointerEvents="none" style={styles.container}>
      <Text style={[styles.formula, { fontSize: fontSize * 0.7 }]}>{latex}</Text>
      <Text style={styles.hint}>公式仅在手机上渲染（Web 预览占位）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  formula: { color: palette.muted, fontFamily: 'monospace', textAlign: 'center' },
  hint: { color: palette.muted, fontSize: 10, opacity: 0.7 },
});

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getTexMetrics, RaTeXView } from 'ratex-react-native';

import { palette } from '@/constants/palette';
import { typography } from '@/constants/typography';

type Props = {
  latex: string;
  color?: string;
  fontSize?: number;
};

const HEIGHT_EPSILON = 1.5;

export function NativeMathFormula({
  latex,
  color = palette.ink,
  fontSize = 22,
}: Props) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [failedLatex, setFailedLatex] = useState<string | null>(null);
  const metrics = useMemo(
    () => getTexMetrics(latex, fontSize, true, color),
    [color, fontSize, latex],
  );

  const scale = metrics && availableWidth > 0
    ? Math.min(1, availableWidth / metrics.width)
    : 1;
  const frameWidth = metrics && availableWidth > 0
    ? Math.min(availableWidth, metrics.width)
    : 1;
  const frameHeight = metrics
    ? Math.max(1, Math.ceil(metrics.height * scale + HEIGHT_EPSILON))
    : 24;

  return (
    <View
      accessible={false}
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setAvailableWidth((current) => Math.abs(current - width) > 0.5 ? width : current);
      }}
      pointerEvents="none"
      style={[styles.container, { height: frameHeight }]}
    >
      {failedLatex === latex || !metrics ? (
        <Text style={styles.fallback}>公式暂不可显示</Text>
      ) : (
        <RaTeXView
          color={color}
          displayMode
          fontSize={fontSize}
          latex={latex}
          onError={() => setFailedLatex(latex)}
          style={{
            height: frameHeight,
            opacity: availableWidth > 0 ? 1 : 0,
            width: frameWidth,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    color: palette.muted,
    fontFamily: typography.regular,
    fontSize: 12,
    lineHeight: 18,
  },
});

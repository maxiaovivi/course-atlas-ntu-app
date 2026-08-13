import { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { InlineTeX } from 'ratex-react-native';

import { toInlineMathContent } from '@/core/inline-math';

type Props = {
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

// Renders card text as native text, upgrading TeX-like tokens (`K_i`,
// `z_{k-1}`, ...) to real inline math via RaTeX InlineTeX. Plain strings stay
// on RN <Text>, which keeps line clamping and exact line-height control.
export function MathText({ text, fontSize, color, fontFamily, numberOfLines, style, containerStyle }: Props) {
  const inline = useMemo(() => toInlineMathContent(text), [text]);
  if (!inline.hasMath) {
    return (
      <Text numberOfLines={numberOfLines} style={[{ color, fontSize, fontFamily }, style]}>
        {text}
      </Text>
    );
  }
  const textStyle = StyleSheet.flatten([{ color, fontSize, fontFamily }, style]);
  return (
    <View pointerEvents="none" style={containerStyle}>
      <InlineTeX
        color={color}
        content={inline.content}
        fontSize={fontSize}
        textStyle={textStyle}
      />
    </View>
  );
}

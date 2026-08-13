// Web-only stand-in so the local `expo start --web` design preview can load.
// Android resolves math-text.tsx and keeps native RaTeX inline rendering.
import { Text, TextStyle, ViewStyle } from 'react-native';

type Props = {
  text: string;
  fontSize: number;
  color: string;
  fontFamily?: string;
  numberOfLines?: number;
  style?: TextStyle;
  containerStyle?: ViewStyle;
};

export function MathText({ text, fontSize, color, fontFamily, numberOfLines, style }: Props) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ color, fontSize, fontFamily }, style]}>
      {text}
    </Text>
  );
}

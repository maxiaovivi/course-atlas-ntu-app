/* eslint-disable react-hooks/immutability -- Reanimated shared values are intentionally mutable UI-thread refs. */
import { PropsWithChildren } from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PropsWithChildren<PressableProps>;

export function PressableScale({ children, onPressIn, onPressOut, ...props }: Props) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...props}
      style={[props.style, animatedStyle]}
      onPressIn={(event) => {
        if (!reducedMotion) scale.value = withTiming(0.98, { duration: 80 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = reducedMotion ? 1 : withSpring(1, { damping: 19, stiffness: 260, mass: 0.55 });
        onPressOut?.(event);
      }}>
      {children}
    </AnimatedPressable>
  );
}

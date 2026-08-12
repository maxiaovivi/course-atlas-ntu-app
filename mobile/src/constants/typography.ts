import { Platform } from 'react-native';

export const typography = {
  display: 'JasonHandwriting5',
  regular: Platform.select({ android: 'sans-serif', default: undefined }),
  medium: Platform.select({ android: 'sans-serif-medium', default: undefined }),
};

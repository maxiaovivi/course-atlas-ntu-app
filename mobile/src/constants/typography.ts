import { Platform } from 'react-native';

export const typography = {
  display: 'ZhiMangXing_400Regular',
  regular: Platform.select({ android: 'sans-serif', default: undefined }),
  medium: Platform.select({ android: 'sans-serif-medium', default: undefined }),
};

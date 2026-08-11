import { useEffect } from 'react';
import * as Updates from 'expo-updates';

export function useAppUpdate() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    const timer = setTimeout(() => {
      Updates.checkForUpdateAsync()
        .then((result) => result.isAvailable ? Updates.fetchUpdateAsync() : undefined)
        .catch(() => undefined);
    }, 1600);
    return () => clearTimeout(timer);
  }, []);
}

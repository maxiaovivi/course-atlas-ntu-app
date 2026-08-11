import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = () => setNow(new Date());
    const delay = 60_020 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, delay);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, []);

  return now;
}

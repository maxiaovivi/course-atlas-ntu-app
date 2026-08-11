import { useCallback, useEffect, useState } from 'react';

import { emptySchedule, SchedulePayload } from '@/core/schedule';
import { fetchSchedule, readCachedSchedule, ScheduleSource } from '@/services/schedule-service';

export function useSchedule() {
  const [schedule, setSchedule] = useState<SchedulePayload>(emptySchedule);
  const [source, setSource] = useState<ScheduleSource>('empty');
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(false);
    try {
      const remote = await fetchSchedule();
      setSchedule(remote);
      setSource('live');
    } catch {
      // Keep the last verified cache visible when the backend is unavailable.
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    readCachedSchedule().then((cached) => {
      if (!active || !cached) return;
      setSchedule(cached);
      setSource('cache');
    }).finally(() => {
      if (active) void refresh();
    });
    return () => { active = false; };
  }, [refresh]);

  return { schedule, source, refreshing, error, refresh };
}

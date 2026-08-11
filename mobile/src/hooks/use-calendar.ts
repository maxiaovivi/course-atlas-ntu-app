import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CalendarPayload, emptyCalendar, upcomingCalendarEvents } from '@/core/calendar';
import { fetchCalendar, readCachedCalendar, refreshCalendar } from '@/services/calendar-service';

export type CalendarSource = 'empty' | 'cache' | 'live';
export type CalendarRefreshState = 'idle' | 'refreshing' | 'success' | 'error';

export function useCalendar() {
  const [calendar, setCalendar] = useState<CalendarPayload>(emptyCalendar);
  const [source, setSource] = useState<CalendarSource>('empty');
  const [state, setState] = useState<CalendarRefreshState>('idle');
  const requestGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    const initialGeneration = requestGeneration.current;
    readCachedCalendar().then((cached) => {
      if (!active || requestGeneration.current !== initialGeneration || !cached) return;
      setCalendar(cached);
      setSource('cache');
    }).finally(() => {
      if (!active || requestGeneration.current !== initialGeneration) return;
      const generation = ++requestGeneration.current;
      fetchCalendar().then((remote) => {
        if (!active || requestGeneration.current !== generation) return;
        setCalendar(remote);
        setSource('live');
        if (remote.status.state === 'error') setState('error');
      }).catch(() => undefined);
    });
    return () => { active = false; };
  }, []);

  const activate = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setState('refreshing');
    try {
      const updated = await refreshCalendar();
      if (requestGeneration.current !== generation) return;
      setCalendar(updated);
      setSource('live');
      setState('success');
    } catch {
      if (requestGeneration.current === generation) setState('error');
    }
  }, []);

  const events = useMemo(() => upcomingCalendarEvents(calendar), [calendar]);
  return { calendar, events, source, state, activate };
}

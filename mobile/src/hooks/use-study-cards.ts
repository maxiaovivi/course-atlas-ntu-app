import { useCallback, useEffect, useState } from 'react';

import { StudyCardsPayload } from '@/core/study-cards';
import { emptyStudyCards, fetchStudyCards, readCachedStudyCards, StudyCardSource } from '@/services/study-card-service';

export function useStudyCards() {
  const [payload, setPayload] = useState<StudyCardsPayload>(emptyStudyCards);
  const [source, setSource] = useState<StudyCardSource>('empty');
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(false);
    try {
      const remote = await fetchStudyCards();
      setPayload(remote);
      setSource('live');
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    readCachedStudyCards().then((cached) => {
      if (!active || !cached) return;
      setPayload(cached);
      setSource('cache');
    }).finally(() => {
      if (active) void refresh();
    });
    return () => { active = false; };
  }, [refresh]);

  return { payload, source, refreshing, error, refresh };
}

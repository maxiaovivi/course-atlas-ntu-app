import { useCallback, useEffect, useState } from 'react';

import { emptyLibrary, LibraryPayload } from '@/core/library';
import { fetchLibrary, LibrarySource, readCachedLibrary } from '@/services/library-service';

export function useLibrary() {
  const [library, setLibrary] = useState<LibraryPayload>(emptyLibrary);
  const [source, setSource] = useState<LibrarySource>('empty');
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(false);
    try {
      const remote = await fetchLibrary();
      setLibrary(remote);
      setSource('live');
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    readCachedLibrary().then((cached) => {
      if (!active || !cached) return;
      setLibrary(cached);
      setSource('cache');
    }).finally(() => {
      if (active) void refresh();
    });
    return () => { active = false; };
  }, [refresh]);

  return { library, source, refreshing, error, refresh };
}

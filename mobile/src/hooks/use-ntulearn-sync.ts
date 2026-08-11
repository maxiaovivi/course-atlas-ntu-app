import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchNtuLearnStatus, NtuLearnSyncStatus, triggerNtuLearnRefresh } from '@/services/ntulearn-service';

const initialStatus: NtuLearnSyncStatus = {
  state: 'idle', requestedAt: null, startedAt: null, finishedAt: null, message: null,
};

export function useNtuLearnSync() {
  const [status, setStatus] = useState(initialStatus);
  const [activating, setActivating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const refreshStatus = useCallback(async () => {
    const next = await fetchNtuLearnStatus();
    setStatus(next);
    if (!['queued', 'running'].includes(next.state)) stopPolling();
    return next;
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => { void refreshStatus(); }, 2500);
  }, [refreshStatus, stopPolling]);

  const activate = useCallback(async () => {
    if (activating || ['queued', 'running'].includes(status.state)) return;
    setActivating(true);
    try {
      const next = await triggerNtuLearnRefresh();
      setStatus(next);
      if (['queued', 'running'].includes(next.state)) startPolling();
    } catch (error) {
      setStatus({ ...initialStatus, state: 'error', message: error instanceof Error ? error.message : '暂时无法启动同步' });
    } finally {
      setActivating(false);
    }
  }, [activating, startPolling, status.state]);

  useEffect(() => {
    void refreshStatus().then((next) => {
      if (['queued', 'running'].includes(next.state)) startPolling();
    });
    return stopPolling;
  }, [refreshStatus, startPolling, stopPolling]);

  return { status, activating, activate };
}

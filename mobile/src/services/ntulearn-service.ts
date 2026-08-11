const API_BASE_URL = (process.env.EXPO_PUBLIC_COURSE_ATLAS_URL || 'https://fatemeeting.site').replace(/\/$/, '');

export type NtuLearnSyncState = 'idle' | 'queued' | 'running' | 'success' | 'login_required' | 'error';
export type NtuLearnSyncStatus = {
  state: NtuLearnSyncState;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  message: string | null;
};

const emptyStatus: NtuLearnSyncStatus = {
  state: 'idle', requestedAt: null, startedAt: null, finishedAt: null, message: null,
};

function isStatus(value: unknown): value is NtuLearnSyncStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<NtuLearnSyncStatus>;
  return ['idle', 'queued', 'running', 'success', 'login_required', 'error'].includes(status.state || '');
}

async function request(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchNtuLearnStatus(): Promise<NtuLearnSyncStatus> {
  const response = await request('/api/ntulearn/status');
  if (!response.ok) return emptyStatus;
  const value: unknown = await response.json();
  return isStatus(value) ? value : emptyStatus;
}

export async function triggerNtuLearnRefresh(): Promise<NtuLearnSyncStatus> {
  const response = await request('/api/ntulearn/refresh', { method: 'POST' });
  const value: unknown = await response.json().catch(() => null);
  const status = value && typeof value === 'object' ? (value as { status?: unknown }).status : null;
  if ((response.ok || response.status === 429) && isStatus(status)) return status;
  const message = value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? String((value as { error: string }).error)
    : '暂时无法启动同步';
  throw new Error(message);
}

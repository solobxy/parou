import { CoverageReport, FetchLogItem, ManualFeedInput, FeedItem } from '../types/coverage';

export async function fetchCoverageReport(): Promise<CoverageReport> {
  const res = await fetch('/api/coverage');
  if (!res.ok) {
    throw new Error(`Erro ao obter cobertura de feeds (${res.status})`);
  }
  return res.json();
}

export async function fetchCoverageLogs(limit = 100): Promise<{ logs: FetchLogItem[]; total: number }> {
  const res = await fetch(`/api/coverage/logs?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Erro ao obter logs de fetch (${res.status})`);
  }
  return res.json();
}

export async function submitManualFeed(data: ManualFeedInput): Promise<{ success: boolean; feed: FeedItem }> {
  const res = await fetch('/api/feeds/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ao adicionar feed (${res.status})`);
  }
  return res.json();
}

export async function refreshFeed(feedId: string): Promise<{ success: boolean; feed: FeedItem }> {
  const res = await fetch(`/api/feeds/${feedId}/refresh`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Erro ao atualizar feed (${res.status})`);
  }
  return res.json();
}

export async function runManualDiscovery(): Promise<{ success: boolean; result: any }> {
  const res = await fetch('/api/coverage/run-discovery', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Erro ao executar auto-descoberta (${res.status})`);
  }
  return res.json();
}

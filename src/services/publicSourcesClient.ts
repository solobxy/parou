import { PublicSourceConfig, IngestionSyncResult, Occurrence } from '../types';
import { cabecalhosAdmin } from '../utils/admin';

export async function fetchPublicSourcesList(): Promise<PublicSourceConfig[]> {
  try {
    const res = await fetch('/api/public-sources');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data?.sources) ? data.sources : [];
  } catch (err) {
    console.warn('Error fetching public sources list:', err);
    return [];
  }
}

export async function syncPublicSourcesNow(): Promise<{
  success: boolean;
  result: IngestionSyncResult | null;
  occurrences: Occurrence[];
  addedCount: number;
  updatedCount: number;
  durationMs: number;
}> {
  const startTime = Date.now();
  try {
    const res = await fetch('/api/public-sources/sync', {
      method: 'POST',
      headers: {
        ...cabecalhosAdmin(),
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Servidor devolveu código ${res.status}`);
    }

    const data = await res.json();
    const occurrences: Occurrence[] = Array.isArray(data?.occurrences) ? data.occurrences : [];
    const result: IngestionSyncResult = data?.result;

    // O servidor já guardou as ocorrências na base da comunidade e diz quantas eram novas
    const added = Number(data?.added) || 0;
    const updated = Number(data?.updated) || 0;

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      result,
      occurrences,
      addedCount: added,
      updatedCount: updated,
      durationMs,
    };
  } catch (err: any) {
    console.error('Error syncing public sources:', err);
    return {
      success: false,
      result: null,
      occurrences: [],
      addedCount: 0,
      updatedCount: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function previewPublicSources(): Promise<{
  result: IngestionSyncResult | null;
  occurrences: Occurrence[];
}> {
  try {
    const res = await fetch('/api/public-sources/preview');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      result: data?.result || null,
      occurrences: Array.isArray(data?.occurrences) ? data.occurrences : [],
    };
  } catch (err) {
    console.warn('Error previewing public sources:', err);
    return { result: null, occurrences: [] };
  }
}

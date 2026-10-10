import { TransitCatalogEntry, CatalogStats, CatalogFilterState } from '../types/catalog';
import { INITIAL_TRANSIT_CATALOG } from '../data/nationalTransitCatalog';
import { cabecalhosAdmin } from '../utils/admin';

export interface CatalogApiResponse {
  catalog: TransitCatalogEntry[];
  total: number;
  activeCount: number;
  realtimeCount: number;
  alertsCount: number;
  timestamp: number;
}

export async function fetchTransitCatalog(): Promise<TransitCatalogEntry[]> {
  try {
    const res = await fetch('/api/transit-catalog', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data: CatalogApiResponse = await res.json();
    if (Array.isArray(data.catalog) && data.catalog.length > 0) {
      return data.catalog;
    }
    return INITIAL_TRANSIT_CATALOG;
  } catch (err) {
    console.warn('Falha ao carregar catálogo da API local, a usar catálogo base verificado:', err);
    return INITIAL_TRANSIT_CATALOG;
  }
}

export async function probeCatalogSource(operatorId?: string): Promise<{
  success: boolean;
  catalog?: TransitCatalogEntry[];
  entry?: TransitCatalogEntry;
}> {
  try {
    const res = await fetch('/api/transit-catalog/probe', {
      method: 'POST',
      headers: {
        ...cabecalhosAdmin(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operatorId }),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    console.warn('Erro ao sondar fonte do catálogo:', err);
    return { success: false };
  }
}

export function calculateCatalogStats(catalog: TransitCatalogEntry[]): CatalogStats {
  const regionsSet = new Set<string>();
  const municipalitiesSet = new Set<string>();

  catalog.forEach((item) => {
    if (item.region) regionsSet.add(item.region);
    item.municipalities.forEach((m) => {
      if (m && !m.includes('Nacional')) municipalitiesSet.add(m);
    });
  });

  return {
    totalOperators: catalog.length,
    activeSources: catalog.filter((c) => c.sync_status === 'Online').length,
    realtimeConfirmedCount: catalog.filter((c) => c.realtime_available).length,
    alertsAvailableCount: catalog.filter((c) => c.alerts_available).length,
    regionsCount: regionsSet.size,
    municipalitiesCoveredCount: municipalitiesSet.size,
  };
}

export function filterCatalog(
  catalog: TransitCatalogEntry[],
  filters: CatalogFilterState
): TransitCatalogEntry[] {
  return catalog.filter((item) => {
    // 1. Search query
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchName = item.official_name.toLowerCase().includes(q) || item.short_name.toLowerCase().includes(q);
      const matchAuth = item.authority.toLowerCase().includes(q);
      const matchRegion = item.region.toLowerCase().includes(q);
      const matchDesc = item.network_description.toLowerCase().includes(q);
      const matchMun = item.municipalities.some((m) => m.toLowerCase().includes(q));
      if (!matchName && !matchAuth && !matchRegion && !matchDesc && !matchMun) {
        return false;
      }
    }

    // 2. Region
    if (filters.region && filters.region !== 'Todas') {
      if (item.region !== filters.region) {
        return false;
      }
    }

    // 3. Transport mode
    if (filters.transportMode && filters.transportMode !== 'Todos') {
      if (!item.transport_modes.includes(filters.transportMode as any)) {
        return false;
      }
    }

    // 4. Source type
    if (filters.sourceType && filters.sourceType !== 'Todos') {
      if (item.source_type !== filters.sourceType) {
        return false;
      }
    }

    // 5. Only realtime
    if (filters.onlyRealtime && !item.realtime_available) {
      return false;
    }

    // 6. Only alerts
    if (filters.onlyAlerts && !item.alerts_available) {
      return false;
    }

    // 7. Only active
    if (filters.onlyActive && item.sync_status !== 'Online') {
      return false;
    }

    return true;
  });
}

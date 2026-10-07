import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { TransitCatalogEntry, CatalogFilterState } from '../types/catalog';
import { fetchTransitCatalog, probeCatalogSource, calculateCatalogStats, filterCatalog } from '../services/catalogApi';

interface NationalTransitCatalogViewProps {
  onBackToMap?: () => void;
  onSelectOperatorForReports?: (operatorName: string) => void;
}

const DEFAULT_FILTERS: CatalogFilterState = {
  searchQuery: '',
  region: 'Todas',
  transportMode: 'Todos',
  sourceType: 'Todos',
  onlyRealtime: false,
  onlyAlerts: false,
  onlyActive: false,
};

export const NationalTransitCatalogView: React.FC<NationalTransitCatalogViewProps> = ({
  onSelectOperatorForReports,
}) => {
  const [catalog, setCatalog] = useState<TransitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_FILTERS);
  const [selectedEntry, setSelectedEntry] = useState<TransitCatalogEntry | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetchTransitCatalog()
      .then((data) => {
        if (isMounted) {
          setCatalog(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const stats = useMemo(() => calculateCatalogStats(catalog), [catalog]);

  const uniqueRegions = useMemo(() => {
    const list = Array.from(new Set(catalog.map((c) => c.region))).filter(Boolean);
    return ['Todas', ...list];
  }, [catalog]);

  const filteredEntries = useMemo(() => {
    return filterCatalog(catalog, filters);
  }, [catalog, filters]);

  const handleProbeSingle = async (e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    setProbingId(entryId);
    try {
      const res = await probeCatalogSource(entryId);
      if (res.success && res.entry) {
        setCatalog((prev) =>
          prev.map((item) => (item.id === entryId ? res.entry! : item))
        );
      }
    } finally {
      setProbingId(null);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto py-2 px-3 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E6E3] pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Catálogo de Operadores
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Operadores e fontes oficiais em Portugal.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-['Barlow_Condensed'] font-bold text-[#111111] tabular-nums text-sm">
            {stats.totalOperators} operadores
          </span>
          <span className="text-[#6B6B6B]">·</span>
          <span className="text-[#6B6B6B]">{stats.activeSources} ativos</span>
        </div>
      </div>

      {/* Search & Region Filters */}
      <div className="p-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
            placeholder="Pesquisar operador ou município..."
            className="w-full pl-9 pr-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {uniqueRegions.slice(0, 8).map((reg) => (
            <button
              key={reg}
              onClick={() => setFilters((prev) => ({ ...prev, region: reg }))}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] transition-colors cursor-pointer ${
                filters.region === reg
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border border-[#E6E6E3]'
              }`}
            >
              {reg}
            </button>
          ))}
        </div>
      </div>

      {/* Operators List */}
      <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#6B6B6B] flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#111111]" />
            <span>A carregar catálogo...</span>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">
            Nenhum operador encontrado.
          </div>
        ) : (
          filteredEntries.map((op) => {
            const isProbing = probingId === op.id;

            return (
              <div
                key={op.id}
                onClick={() => setSelectedEntry(selectedEntry?.id === op.id ? null : op)}
                className="p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#111111] truncate">
                      {op.official_name}
                    </h3>
                    {op.short_name && op.short_name !== op.official_name && (
                      <span className="text-xs text-[#6B6B6B]">({op.short_name})</span>
                    )}
                  </div>
                  <div className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                    {op.region} · {op.transport_modes.join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-semibold ${op.sync_status === 'Online' ? 'text-[#111111]' : 'text-[#6B6B6B]'}`}>
                    {op.sync_status}
                  </span>

                  <button
                    onClick={(e) => handleProbeSingle(e, op.id)}
                    disabled={isProbing}
                    className="p-1.5 text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Testar"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 stroke-[2] ${isProbing ? 'animate-spin' : ''}`} />
                  </button>

                  <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2]" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Overlay */}
      {selectedEntry && (
        <div className="p-4 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#111111]">{selectedEntry.official_name}</h3>
            <button
              onClick={() => setSelectedEntry(null)}
              className="text-xs text-[#6B6B6B] hover:text-[#111111]"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-[#6B6B6B]">
            <div>Região: <strong className="text-[#111111]">{selectedEntry.region}</strong></div>
            <div>Tipo de fonte: <strong className="text-[#111111]">{selectedEntry.source_type}</strong></div>
            <div>Modos: <strong className="text-[#111111]">{selectedEntry.transport_modes.join(', ')}</strong></div>
            <div>Estado: <strong className="text-[#111111]">{selectedEntry.sync_status}</strong></div>
          </div>
          {onSelectOperatorForReports && (
            <button
              onClick={() => onSelectOperatorForReports(selectedEntry.short_name || selectedEntry.official_name)}
              className="px-3 py-1.5 bg-[#111111] text-[#FFFFFF] rounded-[6px] text-xs font-semibold cursor-pointer min-h-[36px]"
            >
              Ver reports deste operador
            </button>
          )}
        </div>
      )}
    </div>
  );
};

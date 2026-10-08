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
            const aberto = selectedEntry?.id === op.id;
            const temCurto = Boolean(op.short_name && op.short_name !== op.official_name);
            const titulo = temCurto ? op.short_name : op.official_name;
            const ativo = op.sync_status === 'Online';

            return (
              <div key={op.id}>
                <button
                  type="button"
                  onClick={() => setSelectedEntry(aberto ? null : op)}
                  aria-expanded={aberto}
                  className="w-full text-left p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-[#111111] truncate">{titulo}</h3>
                    {temCurto && (
                      <div className="text-xs text-[#6B6B6B] truncate">{op.official_name}</div>
                    )}
                    <div className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                      {op.region} · {op.transport_modes.join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ativo ? 'text-[#1F7A3A]' : 'text-[#6B6B6B]'}`}>
                      <span className={`w-2 h-2 rounded-full ${ativo ? 'bg-[#1F9D55]' : 'bg-[#B5B5B0]'}`} />
                      {ativo ? 'Ativo' : op.sync_status === 'Pendente' ? 'Pendente' : 'Sem dados'}
                    </span>
                    <ChevronRight className={`w-4 h-4 text-[#6B6B6B] stroke-[2] transition-transform ${aberto ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {aberto && (
                  <div className="px-3.5 pb-3.5 -mt-1 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2 text-xs text-[#6B6B6B] bg-[#F4F4F2] rounded-[8px] p-3">
                      <div>Região: <strong className="text-[#111111]">{op.region}</strong></div>
                      <div>Fonte: <strong className="text-[#111111]">{op.source_type}</strong></div>
                      <div>Transportes: <strong className="text-[#111111]">{op.transport_modes.join(', ')}</strong></div>
                      <div>Estado: <strong className="text-[#111111]">{ativo ? 'Ativo' : op.sync_status}</strong></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {onSelectOperatorForReports && (
                        <button
                          onClick={() => onSelectOperatorForReports(op.short_name || op.official_name)}
                          className="px-3 h-9 bg-[#111111] text-[#FFFFFF] rounded-[8px] text-xs font-semibold cursor-pointer"
                        >
                          Ver ocorrências deste operador
                        </button>
                      )}
                      <button
                        onClick={(e) => handleProbeSingle(e, op.id)}
                        disabled={isProbing}
                        className="px-3 h-9 bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] rounded-[8px] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 stroke-[2] ${isProbing ? 'animate-spin' : ''}`} />
                        {isProbing ? 'A verificar…' : 'Verificar fonte'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  AlertTriangle, 
  X, 
  Plus, 
  ChevronRight
} from 'lucide-react';
import { Occurrence, FilterState } from '../types';
import { DISTRITOS_OPTIONS } from '../data/mockData';
import { getAvailableConcelhos, countActiveFilters } from '../utils/filterUtils';
import { quandoAconteceu } from '../utils/quando';

interface ReportsViewProps {
  occurrences: Occurrence[];
  onSelectOccurrence: (occurrence: Occurrence) => void;
  onOpenReportModal: () => void;
  lastUpdated?: Date;
  filters?: FilterState;
  onFilterChange?: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters?: () => void;
  transitCount?: number;
  onViewTransit?: () => void;
}

type SortOption = 'recentes' | 'gravidade';

export const ReportsView: React.FC<ReportsViewProps> = ({
  occurrences,
  onSelectOccurrence,
  onOpenReportModal,
  filters: propFilters,
  onFilterChange: propOnFilterChange,
  onResetFilters: propOnResetFilters,
}) => {
  const [localFilters, setLocalFilters] = useState<FilterState>({
    distrito: 'Todos',
    concelho: 'Todos',
    cidade: 'Todas',
    operador: 'Todos',
    servico: 'Todos',
    tipoTransporte: 'Todos',
    categoria: 'Todas',
    searchQuery: '',
  });

  const activeFilters = propFilters || localFilters;

  const handleFilterUpdate = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    if (propOnFilterChange) {
      propOnFilterChange(key, value);
    } else {
      setLocalFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleReset = () => {
    if (propOnResetFilters) {
      propOnResetFilters();
    } else {
      setLocalFilters({
        distrito: 'Todos',
        concelho: 'Todos',
        cidade: 'Todas',
        operador: 'Todos',
        servico: 'Todos',
        tipoTransporte: 'Todos',
        categoria: 'Todas',
        searchQuery: '',
      });
    }
    setSelectedGravidade('Todas');
    setSortBy('recentes');
  };

  const [selectedGravidade, setSelectedGravidade] = useState<string>('Todas');
  const [sortBy, setSortBy] = useState<SortOption>('recentes');

  const concelhosOptions = useMemo(() => {
    return getAvailableConcelhos(activeFilters.distrito);
  }, [activeFilters.distrito]);

  const activeCount = countActiveFilters(activeFilters) + (selectedGravidade !== 'Todas' ? 1 : 0);

  const filteredAndSortedOccurrences = useMemo(() => {
    return occurrences
      .filter((occ) => {
        if (occ.status === 'Ocultada') return false;

        if (activeFilters.searchQuery) {
          const q = activeFilters.searchQuery.toLowerCase();
          const matches =
            occ.title.toLowerCase().includes(q) ||
            occ.description.toLowerCase().includes(q) ||
            occ.district.toLowerCase().includes(q) ||
            (occ.concelho && occ.concelho.toLowerCase().includes(q)) ||
            (occ.transporte && occ.transporte.toLowerCase().includes(q));
          if (!matches) return false;
        }

        if (activeFilters.distrito !== 'Todos' && occ.district !== activeFilters.distrito) {
          return false;
        }

        if (activeFilters.concelho && activeFilters.concelho !== 'Todos' && occ.concelho !== activeFilters.concelho) {
          return false;
        }

        if (selectedGravidade !== 'Todas' && occ.severity !== selectedGravidade) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'gravidade') {
          const weight = { Grave: 3, Moderada: 2, Informação: 1 };
          return (weight[b.severity] || 0) - (weight[a.severity] || 0);
        }
        return b.timestamp - a.timestamp;
      });
  }, [occurrences, activeFilters, selectedGravidade, sortBy]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto py-2 px-3 sm:px-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E6E3] pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Ocorrências
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Reportadas pela comunidade nas últimas 24 horas.
          </p>
        </div>

        {/* Primary Action Button: Brand chamfer */}
        <button
          onClick={onOpenReportModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Reportar ocorrência</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
          <input
            type="text"
            value={activeFilters.searchQuery}
            onChange={(e) => handleFilterUpdate('searchQuery', e.target.value)}
            placeholder="Pesquisar por título, estrada, concelho..."
            className="w-full pl-9 pr-9 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
          />
          {activeFilters.searchQuery && (
            <button
              onClick={() => handleFilterUpdate('searchQuery', '')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111] p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter controls row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <select
            value={activeFilters.distrito}
            onChange={(e) => {
              handleFilterUpdate('distrito', e.target.value);
              handleFilterUpdate('concelho', 'Todos');
            }}
            className="px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] min-h-[36px]"
          >
            <option value="Todos">Todos os distritos</option>
            {DISTRITOS_OPTIONS.filter((d) => d !== 'Todos').map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={activeFilters.concelho || 'Todos'}
            onChange={(e) => handleFilterUpdate('concelho', e.target.value)}
            disabled={activeFilters.distrito === 'Todos'}
            className="px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] disabled:opacity-50 min-h-[36px]"
          >
            <option value="Todos">Todos os concelhos</option>
            {concelhosOptions.filter((c) => c !== 'Todos').map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedGravidade}
            onChange={(e) => setSelectedGravidade(e.target.value)}
            className="col-span-2 sm:col-span-1 px-2.5 py-1.5 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] min-h-[36px]"
          >
            <option value="Todas">Todas as gravidades</option>
            <option value="Grave">Grave</option>
            <option value="Moderada">Moderada</option>
            <option value="Informação">Informação</option>
          </select>
        </div>

        {/* Sort and Reset */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#6B6B6B]">Ordenar:</span>
            <button
              onClick={() => setSortBy('recentes')}
              className={`px-2 py-1 rounded-[6px] font-semibold cursor-pointer min-h-[32px] ${
                sortBy === 'recentes' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              Mais recentes
            </button>
            <button
              onClick={() => setSortBy('gravidade')}
              className={`px-2 py-1 rounded-[6px] font-semibold cursor-pointer min-h-[32px] ${
                sortBy === 'gravidade' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              Gravidade
            </button>
          </div>

          {activeCount > 0 && (
            <button
              onClick={handleReset}
              className="text-[#6B6B6B] hover:text-[#111111] underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Occurrences List: 1px dividing lines */}
      <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
        {filteredAndSortedOccurrences.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">
            Sem ocorrências para os filtros indicados.
          </div>
        ) : (
          filteredAndSortedOccurrences.map((occ) => {
            const isSevere = occ.severity === 'Grave';

            return (
              <div
                key={occ.id}
                onClick={() => onSelectOccurrence(occ)}
                className="p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
                role="button"
                tabIndex={0}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isSevere && (
                      <AlertTriangle className="w-4 h-4 text-[#D92D20] stroke-[2] shrink-0" />
                    )}
                    <h3 className="text-base font-semibold text-[#111111] leading-tight truncate">
                      {occ.title}
                    </h3>
                  </div>

                  <p className="text-xs text-[#6B6B6B] mt-1 line-clamp-1">
                    {occ.description}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-[#6B6B6B] mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#111111] stroke-[2] shrink-0" />
                      <span>{occ.district}{occ.concelho ? ` · ${occ.concelho}` : ''}</span>
                    </span>
                    {occ.transporte && <span>· {occ.transporte}</span>}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 text-right">
                  <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums">
                    {quandoAconteceu(occ)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2]" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

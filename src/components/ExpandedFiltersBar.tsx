import React, { useState } from 'react';
import { 
  Search, 
  X, 
  Filter, 
  MapPin, 
  Building, 
  Compass, 
  Train, 
  Layers, 
  Bus, 
  Tag, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  SlidersHorizontal,
  Radio
} from 'lucide-react';
import { FilterState } from '../types';
import { 
  DISTRITOS_OPTIONS, 
  CIDADES_OPTIONS, 
  OPERADORES_OPTIONS, 
  SERVICOS_OPTIONS, 
  TIPOS_TRANSPORTE_OPTIONS, 
  CATEGORIAS_OPTIONS 
} from '../data/mockData';
import { getAvailableConcelhos, countActiveFilters } from '../utils/filterUtils';
import { MobileFilterModal } from './MobileFilterModal';

interface ExpandedFiltersBarProps {
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
  reportsCount?: number;
  transitCount?: number;
  activeView?: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas';
  onViewChange?: (view: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas') => void;
  compactOnMobile?: boolean;
}

export const ExpandedFiltersBar: React.FC<ExpandedFiltersBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  reportsCount,
  transitCount,
  activeView,
  onViewChange,
  compactOnMobile = false,
}) => {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isExpandedDesktop, setIsExpandedDesktop] = useState(true);

  const activeCount = countActiveFilters(filters);
  const concelhosList = getAvailableConcelhos(
    filters.distrito !== 'Todos' ? filters.distrito : filters.cidade
  );

  // Active filter chip definitions for quick removal
  const activeChips: { key: keyof FilterState; label: string; value: string }[] = [];
  if (filters.distrito && filters.distrito !== 'Todos') {
    activeChips.push({ key: 'distrito', label: 'Distrito', value: filters.distrito });
  }
  if (filters.concelho && filters.concelho !== 'Todos') {
    activeChips.push({ key: 'concelho', label: 'Concelho', value: filters.concelho });
  }
  if (filters.cidade && filters.cidade !== 'Todas') {
    activeChips.push({ key: 'cidade', label: 'Cidade', value: filters.cidade });
  }
  if (filters.operador && filters.operador !== 'Todos') {
    activeChips.push({ key: 'operador', label: 'Operador', value: filters.operador });
  }
  if (filters.servico && filters.servico !== 'Todos') {
    activeChips.push({ key: 'servico', label: 'Serviço', value: filters.servico });
  }
  if (filters.tipoTransporte && filters.tipoTransporte !== 'Todos') {
    activeChips.push({ key: 'tipoTransporte', label: 'Transporte', value: filters.tipoTransporte });
  }
  const catVal = filters.categoria !== 'Todas' ? filters.categoria : filters.tipo;
  if (catVal && catVal !== 'Todas' && catVal !== 'Todos') {
    activeChips.push({ key: 'categoria', label: 'Categoria', value: catVal });
  }

  const handleRemoveChip = (key: keyof FilterState) => {
    if (key === 'cidade') {
      onFilterChange('cidade', 'Todas');
    } else if (key === 'categoria') {
      onFilterChange('categoria', 'Todas');
      onFilterChange('tipo', 'Todos');
    } else if (key === 'operador') {
      onFilterChange('operador', 'Todos');
      onFilterChange('transporte', 'Todos');
    } else {
      onFilterChange(key, 'Todos' as any);
    }
  };

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-3 sm:p-4 shadow-xl backdrop-blur-md mb-4 transition-all">
      {/* Top Search Input & Action Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3">
        {/* Search input with live clear */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            placeholder="Pesquise por concelho, linha (ex: Linha de Sintra, 728), autoestrada (A1, IC19) ou operador..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 focus:border-blue-500 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none transition-all"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange('searchQuery', '')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
              title="Limpar pesquisa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Counter Pills & Mobile Filter Button */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-1.5 sm:gap-2">
          {/* Real-time counters with cross-view switching */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] sm:text-xs">
            {reportsCount !== undefined && (
              <button
                onClick={() => onViewChange && onViewChange('reports')}
                className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'reports' || activeView === 'mapa'
                    ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-bold'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Ver reportes correspondentes"
              >
                <Radio className="w-3 h-3 text-blue-400" />
                <span>Reports:</span>
                <strong className="text-white font-bold">{reportsCount}</strong>
              </button>
            )}

            {transitCount !== undefined && (
              <button
                onClick={() => onViewChange && onViewChange('horarios')}
                className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeView === 'horarios'
                    ? 'bg-purple-600/20 border-purple-500/50 text-purple-300 font-bold'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Ver linhas e horários de transporte correspondentes"
              >
                <Train className="w-3 h-3 text-purple-400" />
                <span>Transportes:</span>
                <strong className="text-white font-bold">{transitCount}</strong>
              </button>
            )}
          </div>

          {/* Mobile Filter Sheet Button (visible on mobile/small screens) */}
          <button
            onClick={() => setIsMobileModalOpen(true)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            aria-label="Abrir filtros avançados"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {activeCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-white text-blue-700 text-[10px] font-black flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>

          {/* Desktop Collapse / Expand Toggle */}
          <button
            onClick={() => setIsExpandedDesktop(!isExpandedDesktop)}
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
            title={isExpandedDesktop ? 'Recolher filtros' : 'Expandir 7 filtros'}
          >
            <Filter className="w-3.5 h-3.5 text-blue-400" />
            <span>Filtros ({activeCount})</span>
            {isExpandedDesktop ? (
              <ChevronUp className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Desktop & Tablet 7 Filters Grid */}
      {isExpandedDesktop && (
        <div className="hidden md:block mt-3 pt-3 border-t border-slate-800/70">
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {/* 1. Distrito */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Compass className="w-3 h-3 text-blue-400" />
                <span>Distrito</span>
              </label>
              <select
                value={filters.distrito}
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange('distrito', val);
                  onFilterChange('concelho', 'Todos');
                  if (val !== 'Todos' && CIDADES_OPTIONS.includes(val)) {
                    onFilterChange('cidade', val);
                  }
                }}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {DISTRITOS_OPTIONS.map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-slate-200">
                    {d === 'Todos' ? 'Todos Distritos' : d}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Concelho */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Building className="w-3 h-3 text-amber-400" />
                <span>Concelho</span>
              </label>
              <select
                value={filters.concelho}
                onChange={(e) => onFilterChange('concelho', e.target.value)}
                disabled={concelhosList.length <= 1}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate disabled:opacity-50"
              >
                {concelhosList.map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-slate-200">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Cidade */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>Cidade</span>
              </label>
              <select
                value={filters.cidade}
                onChange={(e) => onFilterChange('cidade', e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {CIDADES_OPTIONS.map((c) => (
                  <option key={c} value={c} className="bg-slate-900 text-slate-200">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Operador */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Train className="w-3 h-3 text-indigo-400" />
                <span>Operador</span>
              </label>
              <select
                value={filters.operador}
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange('operador', val);
                  onFilterChange('transporte', val);
                }}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {OPERADORES_OPTIONS.map((op) => (
                  <option key={op} value={op} className="bg-slate-900 text-slate-200">
                    {op}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Serviço */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Serviço</span>
              </label>
              <select
                value={filters.servico}
                onChange={(e) => onFilterChange('servico', e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {SERVICOS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Tipo de Transporte */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Bus className="w-3 h-3 text-purple-400" />
                <span>Transporte</span>
              </label>
              <select
                value={filters.tipoTransporte}
                onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {TIPOS_TRANSPORTE_OPTIONS.map((t) => (
                  <option key={t} value={t} className="bg-slate-900 text-slate-200">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. Categoria */}
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <label className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <Tag className="w-3 h-3 text-rose-400" />
                <span>Categoria</span>
              </label>
              <select
                value={filters.categoria}
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange('categoria', val);
                  onFilterChange('tipo', val);
                }}
                className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer truncate"
              >
                {CATEGORIAS_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-200">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips strip (visible across all screen sizes) */}
      {(activeChips.length > 0 || filters.searchQuery) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2.5 border-t border-slate-800/60">
          <span className="text-[11px] text-slate-400 font-medium mr-1 hidden sm:inline">
            Filtros ativos:
          </span>

          {activeChips.map((chip) => (
            <div
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] font-semibold"
            >
              <span className="text-slate-400">{chip.label}:</span>
              <span className="text-white">{chip.value}</span>
              <button
                onClick={() => handleRemoveChip(chip.key)}
                className="ml-0.5 hover:text-red-300 cursor-pointer"
                title={`Remover filtro ${chip.label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {filters.searchQuery && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-semibold">
              <span className="text-slate-400">Texto:</span>
              <span className="text-white italic">"{filters.searchQuery}"</span>
              <button
                onClick={() => onFilterChange('searchQuery', '')}
                className="ml-0.5 hover:text-red-300 cursor-pointer"
                title="Limpar texto"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors ml-auto cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpar tudo</span>
          </button>
        </div>
      )}

      {/* Mobile Drawer Modal */}
      <MobileFilterModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
        filters={filters}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        matchingReportsCount={reportsCount ?? 0}
        matchingTransitCount={transitCount ?? 0}
      />
    </div>
  );
};

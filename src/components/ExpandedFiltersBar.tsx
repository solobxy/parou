import React, { useState } from 'react';
import { 
  Search, 
  X, 
  Filter, 
  Compass, 
  Building, 
  MapPin, 
  Layers, 
  Train, 
  Bus, 
  Tag, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  SlidersHorizontal
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
import { t } from '../i18n';

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
}) => {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isExpandedDesktop, setIsExpandedDesktop] = useState(true);

  const activeCount = countActiveFilters(filters);
  const concelhosList = getAvailableConcelhos(
    filters.distrito !== 'Todos' ? filters.distrito : filters.cidade
  );

  const activeChips: { key: keyof FilterState; label: string; value: string }[] = [];
  if (filters.distrito && filters.distrito !== 'Todos') {
    activeChips.push({ key: 'distrito', label: t('Distrito'), value: t(filters.distrito) });
  }
  if (filters.concelho && filters.concelho !== 'Todos') {
    activeChips.push({ key: 'concelho', label: t('Concelho'), value: t(filters.concelho) });
  }
  if (filters.cidade && filters.cidade !== 'Todas') {
    activeChips.push({ key: 'cidade', label: t('Cidade'), value: t(filters.cidade) });
  }
  if (filters.operador && filters.operador !== 'Todos') {
    activeChips.push({ key: 'operador', label: t('Operador'), value: t(filters.operador) });
  }
  if (filters.servico && filters.servico !== 'Todos') {
    activeChips.push({ key: 'servico', label: t('Serviço'), value: t(filters.servico) });
  }
  if (filters.tipoTransporte && filters.tipoTransporte !== 'Todos') {
    activeChips.push({ key: 'tipoTransporte', label: t('Transporte'), value: t(filters.tipoTransporte) });
  }
  const catVal = filters.categoria !== 'Todas' ? filters.categoria : filters.tipo;
  if (catVal && catVal !== 'Todas' && catVal !== 'Todos') {
    activeChips.push({ key: 'categoria', label: t('Categoria'), value: t(catVal) });
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
    <div className="w-full rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] p-2.5 sm:p-3 mb-2.5 sm:mb-3.5">
      {/* Top Search Input & Action Row (no telemóvel: tudo numa só linha) */}
      <div className="flex flex-row items-center gap-2 sm:gap-2.5">
        {/* Search input with live clear */}
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B6B6B]">
            <Search className="w-4 h-4 stroke-[2]" />
          </div>
          <input
            type="text"
            value={filters.searchQuery}
            onChange={(e) => onFilterChange('searchQuery', e.target.value)}
            placeholder={t('Pesquisar...')}
            className="w-full pl-9 pr-9 py-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] focus:border-[#111111] text-xs sm:text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
          />
          {filters.searchQuery && (
            <button
              onClick={() => onFilterChange('searchQuery', '')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[2]" />
            </button>
          )}
        </div>

        {/* Counter Buttons & Filter Toggle */}
        <div className="flex shrink-0 sm:flex-wrap items-center justify-end gap-2">
          {reportsCount !== undefined && (
            <button
              onClick={() => onViewChange && onViewChange('reports')}
              className={`px-3 py-2 rounded-[8px] border text-xs font-semibold cursor-pointer flex items-center gap-1.5 min-h-[44px] ${
                activeView === 'reports' || activeView === 'mapa'
                  ? 'bg-[#111111] text-[#FFFFFF] border-[#111111]'
                  : 'bg-[#F4F4F2] text-[#111111] border-[#E6E6E3] hover:bg-[#E6E6E3]'
              }`}
            >
              <span>{t('Ocorrências:')}</span>
              <span className="font-condensada font-bold tabular-nums text-sm">
                {reportsCount}
              </span>
            </button>
          )}

          {transitCount !== undefined && (
            <button
              onClick={() => onViewChange && onViewChange('horarios')}
              className={`hidden sm:flex px-3 py-2 rounded-[8px] border text-xs font-semibold cursor-pointer items-center gap-1.5 min-h-[44px] ${
                activeView === 'horarios'
                  ? 'bg-[#111111] text-[#FFFFFF] border-[#111111]'
                  : 'bg-[#F4F4F2] text-[#111111] border-[#E6E6E3] hover:bg-[#E6E6E3]'
              }`}
            >
              <span>{t('Transportes:')}</span>
              <span className="font-condensada font-bold tabular-nums text-sm">
                {transitCount}
              </span>
            </button>
          )}

          {/* Mobile Filter Button */}
          <button
            onClick={() => setIsMobileModalOpen(true)}
            className="md:hidden relative flex items-center justify-center gap-1.5 w-11 sm:w-auto sm:px-3 h-11 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-xs font-semibold cursor-pointer"
            aria-label={activeCount > 0 ? t('Filtros ({n} ativos)', { n: activeCount }) : t('Filtros')}
          >
            <SlidersHorizontal className="w-4 h-4 stroke-[2]" />
            <span className="hidden sm:inline">{t('Filtros')}</span>
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 sm:static min-w-[18px] h-[18px] px-1 rounded-full bg-[#111111] text-[#FFFFFF] text-[10px] font-bold flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>

          {/* Desktop Collapse / Expand Toggle */}
          <button
            onClick={() => setIsExpandedDesktop(!isExpandedDesktop)}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer hover:bg-[#E6E6E3]"
          >
            <Filter className="w-3.5 h-3.5 stroke-[2]" />
            <span>Filtros ({activeCount})</span>
            {isExpandedDesktop ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />
            )}
          </button>
        </div>
      </div>

      {/* Desktop & Tablet Filters Grid */}
      {isExpandedDesktop && (
        <div className="hidden md:block mt-3 pt-3 border-t border-[#E6E6E3]">
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            {/* 1. Distrito */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Distrito')}</span>
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
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {DISTRITOS_OPTIONS.map((d) => (
                  <option key={d} value={d} className="bg-[#FFFFFF] text-[#111111]">
                    {t(d)}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Concelho */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Concelho')}</span>
              <select
                value={filters.concelho}
                onChange={(e) => onFilterChange('concelho', e.target.value)}
                disabled={concelhosList.length <= 1}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate disabled:opacity-40"
              >
                {concelhosList.map((c) => (
                  <option key={c} value={c} className="bg-[#FFFFFF] text-[#111111]">
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Cidade */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Cidade')}</span>
              <select
                value={filters.cidade}
                onChange={(e) => onFilterChange('cidade', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {CIDADES_OPTIONS.map((c) => (
                  <option key={c} value={c} className="bg-[#FFFFFF] text-[#111111]">
                    {t(c)}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Operador */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Operador')}</span>
              <select
                value={filters.operador}
                onChange={(e) => onFilterChange('operador', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {OPERADORES_OPTIONS.map((op) => (
                  <option key={op} value={op} className="bg-[#FFFFFF] text-[#111111]">
                    {t(op)}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Serviço */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Serviço')}</span>
              <select
                value={filters.servico}
                onChange={(e) => onFilterChange('servico', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {SERVICOS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-[#FFFFFF] text-[#111111]">
                    {t(s)}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Tipo de transporte */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Tipo')}</span>
              <select
                value={filters.tipoTransporte}
                onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {TIPOS_TRANSPORTE_OPTIONS.map((tp) => (
                  <option key={tp} value={tp} className="bg-[#FFFFFF] text-[#111111]">
                    {t(tp)}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. Categoria */}
            <div className="flex flex-col gap-1 p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-[10px] font-semibold text-[#6B6B6B]">{t('Categoria')}</span>
              <select
                value={catVal}
                onChange={(e) => {
                  onFilterChange('categoria', e.target.value);
                  onFilterChange('tipo', e.target.value);
                }}
                className="bg-transparent text-xs text-[#111111] font-semibold focus:outline-none cursor-pointer truncate"
              >
                {CATEGORIAS_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#FFFFFF] text-[#111111]">
                    {t(cat)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips Row */}
      {activeChips.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-[#E6E6E3] flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#6B6B6B]">{t('Filtros ativos:')}</span>
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#F4F4F2] border border-[#E6E6E3] text-xs text-[#111111]"
            >
              <span>{chip.label}:</span>
              <strong>{chip.value}</strong>
              <button
                onClick={() => handleRemoveChip(chip.key)}
                className="text-[#6B6B6B] hover:text-[#111111] cursor-pointer ml-0.5"
              >
                <X className="w-3 h-3 stroke-[2]" />
              </button>
            </span>
          ))}
          <button
            onClick={onResetFilters}
            className="text-xs text-[#6B6B6B] hover:text-[#111111] underline cursor-pointer ml-1"
          >
            {t('Limpar todos')}
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

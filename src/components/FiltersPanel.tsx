import { t } from '../i18n';
import React, { useState } from 'react';
import { 
  Compass, 
  MapPin, 
  Layers, 
  RotateCcw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  DISTRITOS_OPTIONS, 
  CIDADES_OPTIONS, 
  OPERADORES_OPTIONS, 
  SERVICOS_OPTIONS, 
  TIPOS_TRANSPORTE_OPTIONS, 
  CATEGORIAS_OPTIONS 
} from '../data/mockData';
import { FilterState } from '../types';
import { getAvailableConcelhos, countActiveFilters } from '../utils/filterUtils';

interface FiltersPanelProps {
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
  reportsCount?: number;
  transitCount?: number;
}

export const FiltersPanel: React.FC<FiltersPanelProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const concelhosList = getAvailableConcelhos(
    filters.distrito !== 'Todos' ? filters.distrito : filters.cidade
  );

  const activeCount = countActiveFilters(filters);

  return (
    <div className="w-full rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] p-3">
      {/* Header with Title & Reset Button */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#E6E6E3]">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-[#111111]">
            {t('Filtros')}
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-[#111111] text-[#FFFFFF] text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </div>

        {activeCount > 0 && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 stroke-[2]" />
            <span>{t('Limpar')}</span>
          </button>
        )}
      </div>

      {/* Fields List */}
      <div className="space-y-2">
        {/* 1. Distrito */}
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
          <div className="flex items-center gap-1.5 text-xs text-[#111111]">
            <Compass className="w-3.5 h-3.5 stroke-[2] text-[#111111] shrink-0" />
            <span>{t('Distrito')}</span>
          </div>
          <select
            value={filters.distrito || 'Todos'}
            onChange={(e) => {
              const val = e.target.value;
              onFilterChange('distrito', val);
              onFilterChange('concelho', 'Todos');
              if (val !== 'Todos' && CIDADES_OPTIONS.includes(val)) {
                onFilterChange('cidade', val);
              }
            }}
            className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
          >
            {DISTRITOS_OPTIONS.map((d) => (
              <option key={d} value={d} className="bg-[#FFFFFF] text-[#111111]">
                {t(d)}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Concelho */}
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
          <div className="flex items-center gap-1.5 text-xs text-[#111111]">
            <MapPin className="w-3.5 h-3.5 stroke-[2] text-[#111111] shrink-0" />
            <span>{t('Concelho')}</span>
          </div>
          <select
            value={filters.concelho || 'Todos'}
            onChange={(e) => onFilterChange('concelho', e.target.value)}
            disabled={filters.distrito === 'Todos'}
            className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate disabled:opacity-40"
          >
            <option value="Todos" className="bg-[#FFFFFF] text-[#111111]">
              {filters.distrito === 'Todos' ? t('Selecione distrito') : t('Todos')}
            </option>
            {concelhosList.map((c) => (
              <option key={c} value={c} className="bg-[#FFFFFF] text-[#111111]">
                {t(c)}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Operador */}
        <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
          <div className="flex items-center gap-1.5 text-xs text-[#111111]">
            <Layers className="w-3.5 h-3.5 stroke-[2] text-[#111111] shrink-0" />
            <span>{t('Operador')}</span>
          </div>
          <select
            value={filters.operador || 'Todos'}
            onChange={(e) => onFilterChange('operador', e.target.value)}
            className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
          >
            {OPERADORES_OPTIONS.map((op) => (
              <option key={op} value={op} className="bg-[#FFFFFF] text-[#111111]">
                {t(op)}
              </option>
            ))}
          </select>
        </div>

        {/* Advanced Filters Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
        >
          <span>{showAdvanced ? t('Menos filtros') : t('Mais filtros')}</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5 stroke-[2]" /> : <ChevronDown className="w-3.5 h-3.5 stroke-[2]" />}
        </button>

        {showAdvanced && (
          <div className="space-y-2 pt-1 border-t border-[#E6E6E3]">
            {/* Serviço */}
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-xs text-[#111111]">{t('Serviço')}</span>
              <select
                value={filters.servico || 'Todos'}
                onChange={(e) => onFilterChange('servico', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {SERVICOS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-[#FFFFFF] text-[#111111]">
                    {t(s)}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo */}
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-xs text-[#111111]">{t('Tipo de transporte')}</span>
              <select
                value={filters.tipoTransporte || 'Todos'}
                onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {TIPOS_TRANSPORTE_OPTIONS.map((tp) => (
                  <option key={tp} value={tp} className="bg-[#FFFFFF] text-[#111111]">
                    {t(tp)}
                  </option>
                ))}
              </select>
            </div>

            {/* Categoria */}
            <div className="flex items-center justify-between p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3]">
              <span className="text-xs text-[#111111]">{t('Categoria')}</span>
              <select
                value={filters.categoria || 'Todas'}
                onChange={(e) => onFilterChange('categoria', e.target.value)}
                className="bg-transparent text-xs text-[#111111] font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {CATEGORIAS_OPTIONS.map((c) => (
                  <option key={c} value={c} className="bg-[#FFFFFF] text-[#111111]">
                    {t(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

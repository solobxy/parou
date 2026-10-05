import React, { useState } from 'react';
import { 
  Compass, 
  Building, 
  MapPin, 
  Train, 
  Layers, 
  Bus, 
  Tag, 
  X, 
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
  reportsCount,
  transitCount,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const concelhosList = getAvailableConcelhos(
    filters.distrito !== 'Todos' ? filters.distrito : filters.cidade
  );

  const activeCount = countActiveFilters(filters);

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-3.5 sm:p-5 shadow-xl backdrop-blur-md">
      {/* Header with Title & Reset Button */}
      <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-800/70">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Filtros do PAROU
          </span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </div>

        {activeCount > 0 && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpar</span>
          </button>
        )}
      </div>

      {/* Fields List */}
      <div className="space-y-2 sm:space-y-2.5">
        {/* 1. Distrito */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Compass className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Distrito</span>
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
            className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
          >
            {DISTRITOS_OPTIONS.map((d) => (
              <option key={d} value={d} className="bg-slate-900 text-slate-200">
                {d === 'Todos' ? 'Todos Distritos' : d}
              </option>
            ))}
          </select>
        </div>

        {/* 2. Concelho */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Building className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Concelho</span>
          </div>
          <select
            value={filters.concelho}
            onChange={(e) => onFilterChange('concelho', e.target.value)}
            disabled={concelhosList.length <= 1}
            className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate disabled:opacity-50"
          >
            {concelhosList.map((c) => (
              <option key={c} value={c} className="bg-slate-900 text-slate-200">
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Cidade */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Cidade</span>
          </div>
          <select
            value={filters.cidade || 'Todas'}
            onChange={(e) => onFilterChange('cidade', e.target.value)}
            className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
          >
            {CIDADES_OPTIONS.map((c) => (
              <option key={c} value={c} className="bg-slate-900 text-slate-200">
                {c === 'Todas' ? 'Todas Cidades' : c}
              </option>
            ))}
          </select>
        </div>

        {/* 4. Operador */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Train className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Operador</span>
          </div>
          <select
            value={filters.operador || 'Todos'}
            onChange={(e) => {
              const val = e.target.value;
              onFilterChange('operador', val);
              onFilterChange('transporte', val);
            }}
            className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
          >
            {OPERADORES_OPTIONS.map((op) => (
              <option key={op} value={op} className="bg-slate-900 text-slate-200">
                {op}
              </option>
            ))}
          </select>
        </div>

        {/* Toggle to show more filters (Serviço, Tipo de Transporte, Categoria) */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-900/40 hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 text-[11px] font-semibold transition-all border border-dashed border-slate-800 cursor-pointer"
        >
          <span>{showAdvanced ? 'Menos filtros' : 'Mais filtros (Serviço, Modo, Categoria)'}</span>
          {showAdvanced ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {showAdvanced && (
          <div className="space-y-2 pt-1 animate-in fade-in duration-200">
            {/* 5. Serviço */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Serviço</span>
              </div>
              <select
                value={filters.servico || 'Todos'}
                onChange={(e) => onFilterChange('servico', e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {SERVICOS_OPTIONS.map((s) => (
                  <option key={s} value={s} className="bg-slate-900 text-slate-200">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Tipo de Transporte */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Bus className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Tipo Transporte</span>
              </div>
              <select
                value={filters.tipoTransporte || 'Todos'}
                onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {TIPOS_TRANSPORTE_OPTIONS.map((t) => (
                  <option key={t} value={t} className="bg-slate-900 text-slate-200">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. Categoria */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <Tag className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Categoria</span>
              </div>
              <select
                value={filters.categoria || 'Todas'}
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange('categoria', val);
                  onFilterChange('tipo', val);
                }}
                className="bg-transparent text-xs text-slate-200 font-semibold text-right focus:outline-none cursor-pointer pr-1 max-w-[150px] truncate"
              >
                {CATEGORIAS_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-200">
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Matching Results Counters Summary */}
      {(reportsCount !== undefined || transitCount !== undefined) && (
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Correspondências:</span>
          <div className="flex items-center gap-1.5 font-mono font-bold text-slate-300">
            {reportsCount !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-900/50">
                {reportsCount} reports
              </span>
            )}
            {transitCount !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-900/50">
                {transitCount} transp.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { 
  X, 
  MapPin, 
  Building, 
  Compass, 
  Train, 
  Layers, 
  Bus, 
  Tag, 
  Check, 
  RotateCcw,
  Search
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

interface MobileFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
  matchingReportsCount: number;
  matchingTransitCount: number;
  onApply?: () => void;
}

export const MobileFilterModal: React.FC<MobileFilterModalProps> = ({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onResetFilters,
  matchingReportsCount,
  matchingTransitCount,
  onApply,
}) => {
  if (!isOpen) return null;

  const concelhosList = getAvailableConcelhos(
    filters.distrito !== 'Todos' ? filters.distrito : filters.cidade
  );

  const activeCount = countActiveFilters(filters);

  const handleApply = () => {
    if (onApply) onApply();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-sm sm:items-center sm:justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Filtros de pesquisa do PAROU"
    >
      <div 
        className="w-full sm:max-w-xl max-h-[92vh] sm:max-h-[85vh] bg-[#0b101d] border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0d1424] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">
                Filtros de Pesquisa
              </h3>
              <p className="text-[11px] text-slate-400">
                Ocorrências & Transportes em Portugal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[11px] font-bold">
                {activeCount} ativo{activeCount > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Fechar filtros"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Filter Fields */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
          
          {/* Section: Localização */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. Localização Geográfica
              </h4>
            </div>

            <div className="space-y-2.5">
              {/* Distrito */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-blue-400" />
                    <span>Distrito</span>
                  </span>
                  {filters.distrito !== 'Todos' && (
                    <span className="text-[10px] text-blue-400 font-bold">Ativo</span>
                  )}
                </div>
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
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {DISTRITOS_OPTIONS.map((d) => (
                    <option key={d} value={d} className="bg-slate-900 text-slate-100">
                      {d === 'Todos' ? 'Todos os Distritos (Nacional)' : `Distrito de ${d}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Concelho */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    <span>Concelho / Município</span>
                  </span>
                  {filters.concelho !== 'Todos' && (
                    <span className="text-[10px] text-amber-400 font-bold">Ativo</span>
                  )}
                </div>
                <select
                  value={filters.concelho}
                  onChange={(e) => onFilterChange('concelho', e.target.value)}
                  disabled={concelhosList.length <= 1}
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  {concelhosList.map((c) => (
                    <option key={c} value={c} className="bg-slate-900 text-slate-100">
                      {c === 'Todos' 
                        ? (filters.distrito !== 'Todos' ? `Todos os concelhos de ${filters.distrito}` : 'Todos os Concelhos (Selecione Distrito)') 
                        : c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cidade */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cidade / Área Urbana</span>
                  </span>
                  {filters.cidade !== 'Todas' && (
                    <span className="text-[10px] text-emerald-400 font-bold">Ativo</span>
                  )}
                </div>
                <select
                  value={filters.cidade}
                  onChange={(e) => onFilterChange('cidade', e.target.value)}
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {CIDADES_OPTIONS.map((c) => (
                    <option key={c} value={c} className="bg-slate-900 text-slate-100">
                      {c === 'Todas' ? 'Todas as Cidades' : c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Operador & Transporte */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Train className="w-3.5 h-3.5 text-indigo-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                2. Transportes & Operadores
              </h4>
            </div>

            <div className="space-y-2.5">
              {/* Operador */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Train className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Operador de Transporte</span>
                  </span>
                  {filters.operador !== 'Todos' && (
                    <span className="text-[10px] text-indigo-400 font-bold">Ativo</span>
                  )}
                </div>
                <select
                  value={filters.operador}
                  onChange={(e) => {
                    const val = e.target.value;
                    onFilterChange('operador', val);
                    onFilterChange('transporte', val);
                  }}
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {OPERADORES_OPTIONS.map((op) => (
                    <option key={op} value={op} className="bg-slate-900 text-slate-100">
                      {op === 'Todos' ? 'Todos os Operadores' : op}
                    </option>
                  ))}
                </select>
              </div>

              {/* Serviço */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Tipo de Serviço</span>
                  </span>
                  {filters.servico !== 'Todos' && (
                    <span className="text-[10px] text-cyan-400 font-bold">Ativo</span>
                  )}
                </div>
                <select
                  value={filters.servico}
                  onChange={(e) => onFilterChange('servico', e.target.value)}
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {SERVICOS_OPTIONS.map((s) => (
                    <option key={s} value={s} className="bg-slate-900 text-slate-100">
                      {s === 'Todos' ? 'Todos os Serviços' : s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tipo de Transporte */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-purple-400" />
                    <span>Tipo de Transporte (Modo)</span>
                  </span>
                  {filters.tipoTransporte !== 'Todos' && (
                    <span className="text-[10px] text-purple-400 font-bold">Ativo</span>
                  )}
                </div>
                <select
                  value={filters.tipoTransporte}
                  onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
                  className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
                >
                  {TIPOS_TRANSPORTE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="bg-slate-900 text-slate-100">
                      {t === 'Todos' ? 'Todos os Tipos de Transporte' : t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Categoria de Ocorrência */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Tag className="w-3.5 h-3.5 text-rose-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                3. Categoria de Ocorrência
              </h4>
            </div>

            <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-rose-400" />
                  <span>Categoria do Incidente</span>
                </span>
                {filters.categoria !== 'Todas' && (
                  <span className="text-[10px] text-rose-400 font-bold">Ativo</span>
                )}
              </div>
              <select
                value={filters.categoria}
                onChange={(e) => {
                  const val = e.target.value;
                  onFilterChange('categoria', val);
                  onFilterChange('tipo', val);
                }}
                className="w-full bg-[#080d18] text-white text-xs font-semibold p-2.5 rounded-xl border border-slate-700/80 focus:border-blue-500 focus:outline-none cursor-pointer"
              >
                {CATEGORIAS_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-slate-900 text-slate-100">
                    {cat === 'Todas' ? 'Todas as Categorias' : cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Modal Footer with Live Counters & Action Buttons */}
        <div className="p-4 border-t border-slate-800 bg-[#0d1424] shrink-0 space-y-3">
          {/* Real-time sync feedback */}
          <div className="flex items-center justify-between text-xs text-slate-300 px-1">
            <span className="text-slate-400">Resultados encontrados:</span>
            <div className="flex items-center gap-2 font-mono text-[11px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-blue-950/80 text-blue-300 border border-blue-800/60">
                {matchingReportsCount} reports
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-800/60">
                {matchingTransitCount} transportes
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {activeCount > 0 && (
              <button
                onClick={onResetFilters}
                className="flex-1 py-3 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            )}

            <button
              onClick={handleApply}
              className="flex-[2] py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Aplicar Filtros</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

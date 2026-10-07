import React from 'react';
import { 
  X, 
  Compass, 
  MapPin, 
  Layers, 
  RotateCcw
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
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="w-full sm:max-w-xl max-h-[90vh] bg-[#FFFFFF] border border-[#E6E6E3] rounded-t-[8px] sm:rounded-[8px] flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E6E6E3] bg-[#FFFFFF] shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#111111]">
              Filtros
            </h3>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#111111] text-[#FFFFFF] text-[10px] font-bold">
                {activeCount}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-[#6B6B6B] hover:text-[#111111] min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-[#FFFFFF]">
          {/* 1. Distrito */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Distrito
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
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {DISTRITOS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 'Todos' ? 'Todos os distritos' : d}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Concelho */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Concelho
            </label>
            <select
              value={filters.concelho}
              onChange={(e) => onFilterChange('concelho', e.target.value)}
              disabled={concelhosList.length <= 1}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px] disabled:opacity-40"
            >
              {concelhosList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Cidade */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Cidade
            </label>
            <select
              value={filters.cidade}
              onChange={(e) => onFilterChange('cidade', e.target.value)}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {CIDADES_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c === 'Todas' ? 'Todas as cidades' : c}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Operador */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Operador
            </label>
            <select
              value={filters.operador}
              onChange={(e) => onFilterChange('operador', e.target.value)}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {OPERADORES_OPTIONS.map((op) => (
                <option key={op} value={op}>
                  {op === 'Todos' ? 'Todos os operadores' : op}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Serviço */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Serviço
            </label>
            <select
              value={filters.servico}
              onChange={(e) => onFilterChange('servico', e.target.value)}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {SERVICOS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'Todos' ? 'Todos os serviços' : s}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Tipo de Transporte */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Tipo de Transporte
            </label>
            <select
              value={filters.tipoTransporte}
              onChange={(e) => onFilterChange('tipoTransporte', e.target.value)}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {TIPOS_TRANSPORTE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === 'Todos' ? 'Todos os transportes' : t}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Categoria */}
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              Categoria
            </label>
            <select
              value={filters.categoria !== 'Todas' ? filters.categoria : filters.tipo}
              onChange={(e) => {
                const val = e.target.value;
                onFilterChange('categoria', val);
                onFilterChange('tipo', val);
              }}
              className="w-full bg-[#F4F4F2] text-[#111111] text-xs font-semibold p-2.5 rounded-[8px] border border-[#E6E6E3] focus:outline-none min-h-[44px]"
            >
              {CATEGORIAS_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'Todas' ? 'Todas as categorias' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-[#E6E6E3] bg-[#FFFFFF] shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#6B6B6B]">
            <span>Resultados:</span>
            <div className="flex items-center gap-2">
              <span className="font-['Barlow_Condensed'] font-bold text-[#111111] tabular-nums">
                {matchingReportsCount} reports
              </span>
              <span>·</span>
              <span className="font-['Barlow_Condensed'] font-bold text-[#111111] tabular-nums">
                {matchingTransitCount} transportes
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button
                onClick={onResetFilters}
                className="py-2.5 px-3 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
                <span>Limpar</span>
              </button>
            )}

            {/* Primary Action Button: Brand chamfer */}
            <button
              onClick={handleApply}
              className="flex-1 py-2.5 px-4 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] text-xs font-bold min-h-[44px] flex items-center justify-center cursor-pointer"
            >
              <span>Aplicar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

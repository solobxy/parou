import React, { useState, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Building, 
  Compass,
  Train,
  Layers,
  Bus,
  Tag, 
  AlertTriangle, 
  Clock, 
  ArrowUpDown, 
  X, 
  SlidersHorizontal,
  Car,
  Zap,
  Users,
  Wrench,
  AlertCircle,
  MessageSquare,
  Camera,
  ThumbsUp,
  CheckCircle2,
  RefreshCw,
  Plus,
  ShieldCheck,
  RotateCcw,
  Radio
} from 'lucide-react';
import { Occurrence, OccurrenceType, SeverityLevel, FilterState, VerificationStatus } from '../types';
import { ConfidenceMeter } from './ConfidenceMeter';
import { calculateConfidence, getVerificationStatusConfig } from '../utils/confidenceUtils';
import { 
  DISTRITOS_OPTIONS,
  CIDADES_OPTIONS, 
  OPERADORES_OPTIONS,
  SERVICOS_OPTIONS,
  TIPOS_TRANSPORTE_OPTIONS,
  CATEGORIAS_OPTIONS 
} from '../data/mockData';
import { getAvailableConcelhos, matchOccurrence, countActiveFilters } from '../utils/filterUtils';

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

type SortOption = 'recentes' | 'gravidade' | 'antigas' | 'confirmadas';

export const ReportsView: React.FC<ReportsViewProps> = ({
  occurrences,
  onSelectOccurrence,
  onOpenReportModal,
  lastUpdated,
  filters: propFilters,
  onFilterChange: propOnFilterChange,
  onResetFilters: propOnResetFilters,
  transitCount,
  onViewTransit,
}) => {
  // Local fallback filters if not provided by parent
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
  const [selectedStatusTab, setSelectedStatusTab] = useState<'Todos' | 'Confirmado' | 'Em verificação' | 'Resolvido' | 'Reportado'>('Todos');
  const [sortBy, setSortBy] = useState<SortOption>('recentes');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  // Missing Stop / Line report modal state (Rule 6)
  const [showMissingStopModal, setShowMissingStopModal] = useState(false);
  const [missingOp, setMissingOp] = useState('');
  const [missingPlace, setMissingPlace] = useState('');
  const [missingDetails, setMissingDetails] = useState('');
  const [missingSubmitting, setMissingSubmitting] = useState(false);
  const [missingSuccess, setMissingSuccess] = useState('');
  const [missingError, setMissingError] = useState('');

  const handleSubmitMissing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!missingOp.trim() || !missingPlace.trim()) {
      setMissingError('Por favor indique o operador e o local/paragem.');
      return;
    }
    setMissingSubmitting(true);
    setMissingError('');
    setMissingSuccess('');
    try {
      const res = await fetch('/api/reports/missing-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator: missingOp,
          place: missingPlace,
          details: missingDetails,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMissingSuccess('Linha ou paragem reportada com sucesso. O catálogo irá auditar este registo!');
        setTimeout(() => {
          setShowMissingStopModal(false);
          setMissingOp('');
          setMissingPlace('');
          setMissingDetails('');
          setMissingSuccess('');
        }, 1800);
      } else {
        setMissingError(json.error || 'Erro ao submeter reporte.');
      }
    } catch (err: any) {
      setMissingError(err.message || 'Erro de rede ao submeter reporte.');
    } finally {
      setMissingSubmitting(false);
    }
  };

  // Status counts calculation
  const statusCounts = useMemo(() => {
    let confirmados = 0;
    let emVerificacao = 0;
    let resolvidos = 0;
    let reportados = 0;

    occurrences.forEach((occ) => {
      if (occ.status === 'Ocultada') return;
      const st = calculateConfidence(occ).status;
      if (st === 'Confirmado') confirmados++;
      else if (st === 'Em verificação') emVerificacao++;
      else if (st === 'Resolvido') resolvidos++;
      else reportados++;
    });

    return { confirmados, emVerificacao, resolvidos, reportados };
  }, [occurrences]);

  // Concelhos list based on selected Distrito or Cidade
  const concelhosList = getAvailableConcelhos(
    activeFilters.distrito !== 'Todos' ? activeFilters.distrito : activeFilters.cidade
  );

  const activeCount = countActiveFilters(activeFilters) + (selectedGravidade !== 'Todas' ? 1 : 0) + (selectedStatusTab !== 'Todos' ? 1 : 0);

  // Category Icon & Badge config
  const getCategoryConfig = (type: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return {
          icon: Car,
          label: 'Acidente',
          color: 'text-red-400 bg-red-500/10 border-red-500/30',
          badgeColor: 'bg-red-500/20 text-red-300 border-red-500/40',
        };
      case 'ATRASOS':
        return {
          icon: Clock,
          label: 'Atrasos',
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        };
      case 'AVARIA':
        return {
          icon: Zap,
          label: 'Avaria',
          color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
          badgeColor: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
        };
      case 'GREVE':
        return {
          icon: Users,
          label: 'Greve',
          color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
          badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        };
      case 'OBRAS':
        return {
          icon: Wrench,
          label: 'Obras',
          color: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
          badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
        };
      case 'CORTE':
        return {
          icon: AlertCircle,
          label: 'Corte de Via',
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
          badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        };
      case 'SERVICO_PUBLICO':
      default:
        return {
          icon: AlertCircle,
          label: 'Serviço Público',
          color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
          badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
        };
    }
  };

  // Severity visual styling
  const getSeverityBadge = (severity: SeverityLevel) => {
    switch (severity) {
      case 'Grave':
        return 'bg-red-950/80 border border-red-700/80 text-red-300';
      case 'Moderada':
        return 'bg-amber-950/80 border border-amber-700/80 text-amber-300';
      case 'Informação':
      default:
        return 'bg-blue-950/80 border border-blue-700/80 text-blue-300';
    }
  };

  // Status visual badge styling
  const getStatusBadge = (status: Occurrence['status']) => {
    switch (status) {
      case 'Ativa':
        return {
          label: 'Ativa',
          classes: 'bg-red-950/70 border border-red-700 text-red-300',
          dot: 'bg-red-400 animate-ping',
        };
      case 'Em resolução':
        return {
          label: 'Em resolução',
          classes: 'bg-amber-950/70 border border-amber-700 text-amber-300',
          dot: 'bg-amber-400 animate-pulse',
        };
      case 'Em análise':
        return {
          label: 'Em análise',
          classes: 'bg-purple-950/70 border border-purple-700 text-purple-300',
          dot: 'bg-purple-400',
        };
      case 'Resolvida':
      default:
        return {
          label: 'Resolvida',
          classes: 'bg-slate-800/80 border border-slate-700 text-slate-300',
          dot: 'bg-slate-500',
        };
    }
  };

  // Filter and sort occurrences using matchOccurrence
  const filteredAndSortedOccurrences = useMemo(() => {
    const result = occurrences.filter((item) => {
      if (item.status === 'Ocultada') return false;

      // 7-dimensional expanded filter check
      if (!matchOccurrence(item, activeFilters)) return false;

      // Gravidade filter
      if (selectedGravidade !== 'Todas') {
        if (item.severity !== selectedGravidade) return false;
      }

      // Verification status filter
      if (selectedStatusTab !== 'Todos') {
        const evalData = calculateConfidence(item);
        if (evalData.status !== selectedStatusTab) return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'recentes') {
        return (b.timestamp || 0) - (a.timestamp || 0);
      }
      if (sortBy === 'antigas') {
        return (a.timestamp || 0) - (b.timestamp || 0);
      }
      if (sortBy === 'gravidade') {
        const score = (sev: SeverityLevel) => {
          if (sev === 'Grave') return 3;
          if (sev === 'Moderada') return 2;
          return 1;
        };
        return score(b.severity) - score(a.severity);
      }
      if (sortBy === 'confirmadas') {
        return (b.upvotes || 0) - (a.upvotes || 0);
      }
      return 0;
    });

    return result;
  }, [
    occurrences,
    activeFilters,
    selectedGravidade,
    selectedStatusTab,
    sortBy,
  ]);

  // Statistics counters
  const totalCount = filteredAndSortedOccurrences.length;
  const gravesCount = occurrences.filter((o) => o.severity === 'Grave').length;
  const moderadasCount = occurrences.filter((o) => o.severity === 'Moderada').length;

  return (
    <div className="w-full space-y-4">
      {/* Header Banner & Stats */}
      <div className="rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                Monitorização em Direto
              </span>
              {lastUpdated && (
                <span className="text-[11px] text-slate-400 font-mono bg-slate-900/90 px-2 py-0.5 rounded-md border border-slate-800">
                  Atualizado: {lastUpdated.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Reports e Ocorrências
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Lista colaborativa e oficial de constrangimentos, transportes e vias públicas em Portugal
            </p>
          </div>

          {/* Action button: Reportar */}
          <div className="flex items-center gap-2.5 shrink-0">
            {transitCount !== undefined && onViewTransit && (
              <button
                onClick={onViewTransit}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 text-xs font-bold border border-purple-800/60 transition-all cursor-pointer"
                title="Ver estado das linhas de transporte"
              >
                <Train className="w-4 h-4 text-purple-400" />
                <span>Ver Transportes ({transitCount})</span>
              </button>
            )}

            <button
              onClick={() => setShowMissingStopModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-amber-300 text-xs font-bold border border-amber-500/30 transition-all cursor-pointer"
              title="Reportar operador, linha ou paragem ausente do catálogo nacional"
            >
              <MapPin className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Reportar linha ou paragem em falta</span>
              <span className="sm:hidden">Linha em falta</span>
            </button>

            <button
              onClick={onOpenReportModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Reportar ocorrência</span>
            </button>
          </div>
        </div>

        {/* Quick KPI stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 mt-4 border-t border-slate-800/70">
          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-[11px] text-slate-400">Total ativas</div>
            <div className="text-lg font-bold text-white font-mono">{occurrences.length}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-[11px] text-red-400">Graves</div>
            <div className="text-lg font-bold text-red-400 font-mono">{gravesCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-[11px] text-amber-400">Moderadas</div>
            <div className="text-lg font-bold text-amber-400 font-mono">{moderadasCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-[11px] text-blue-400">Filtradas</div>
            <div className="text-lg font-bold text-blue-400 font-mono">{totalCount}</div>
          </div>
        </div>
      </div>

      {/* Expanded 7-Dimensional Search, Filter & Sort Toolbar */}
      <div className="rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-3.5">
        {/* Search Bar */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={activeFilters.searchQuery}
            onChange={(e) => handleFilterUpdate('searchQuery', e.target.value)}
            placeholder="Pesquisar por título, rua, concelho, operadora (ex: Metro, A1, Campolide, Carris)..."
            className="w-full pl-10 pr-9 py-2.5 bg-slate-900/90 border border-slate-700/80 hover:border-slate-600 focus:border-blue-500 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
          />
          {activeFilters.searchQuery && (
            <button
              onClick={() => handleFilterUpdate('searchQuery', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white p-1 cursor-pointer"
              aria-label="Limpar pesquisa"
            >
              ✕
            </button>
          )}
        </div>

        {/* 7-Dimensional Filter Controls Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* 1. Distrito */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-blue-400" />
              <span>Distrito</span>
            </label>
            <select
              value={activeFilters.distrito || 'Todos'}
              onChange={(e) => {
                const val = e.target.value;
                handleFilterUpdate('distrito', val);
                handleFilterUpdate('concelho', 'Todos');
                if (val !== 'Todos' && CIDADES_OPTIONS.includes(val)) {
                  handleFilterUpdate('cidade', val);
                }
              }}
              className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {DISTRITOS_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 'Todos' ? 'Todos os distritos' : d}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Concelho */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Building className="w-3 h-3 text-amber-400" />
              <span>Concelho</span>
            </label>
            <select
              value={activeFilters.concelho}
              onChange={(e) => handleFilterUpdate('concelho', e.target.value)}
              disabled={concelhosList.length <= 1}
              className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50"
            >
              {concelhosList.map((c) => (
                <option key={c} value={c}>
                  {c === 'Todos' ? 'Todos os concelhos' : c}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Operador */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Train className="w-3 h-3 text-indigo-400" />
              <span>Operador</span>
            </label>
            <select
              value={activeFilters.operador || 'Todos'}
              onChange={(e) => {
                const val = e.target.value;
                handleFilterUpdate('operador', val);
                handleFilterUpdate('transporte', val);
              }}
              className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {OPERADORES_OPTIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Categoria */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Tag className="w-3 h-3 text-rose-400" />
              <span>Categoria</span>
            </label>
            <select
              value={activeFilters.categoria || 'Todas'}
              onChange={(e) => {
                const val = e.target.value;
                handleFilterUpdate('categoria', val);
                handleFilterUpdate('tipo', val);
              }}
              className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              {CATEGORIAS_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === 'Todas' ? 'Todas as categorias' : t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Expandable Row: Cidade, Serviço, Tipo Transporte, Gravidade */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showMoreFilters ? 'Ocultar filtros avançados' : 'Mais filtros (Cidade, Serviço, Tipo, Gravidade)'}</span>
          </button>

          {activeCount > 0 && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Limpar filtros ({activeCount})</span>
            </button>
          )}
        </div>

        {showMoreFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/60 animate-in fade-in duration-200">
            {/* Cidade */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>Cidade</span>
              </label>
              <select
                value={activeFilters.cidade || 'Todas'}
                onChange={(e) => handleFilterUpdate('cidade', e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {CIDADES_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c === 'Todas' ? 'Todas as cidades' : c}
                  </option>
                ))}
              </select>
            </div>

            {/* Serviço */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Serviço</span>
              </label>
              <select
                value={activeFilters.servico || 'Todos'}
                onChange={(e) => handleFilterUpdate('servico', e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {SERVICOS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Tipo de Transporte */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Bus className="w-3 h-3 text-purple-400" />
                <span>Tipo Transporte</span>
              </label>
              <select
                value={activeFilters.tipoTransporte || 'Todos'}
                onChange={(e) => handleFilterUpdate('tipoTransporte', e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {TIPOS_TRANSPORTE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Gravidade */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>Gravidade</span>
              </label>
              <select
                value={selectedGravidade}
                onChange={(e) => setSelectedGravidade(e.target.value)}
                className="w-full px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Todas">Todas as gravidades</option>
                <option value="Grave">Grave (Cortes / Emergências)</option>
                <option value="Moderada">Moderada (Atrasos médios)</option>
                <option value="Informação">Informação / Normal</option>
              </select>
            </div>
          </div>
        )}

        {/* Sort Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/70">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Ordenar por:</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
              <button
                onClick={() => setSortBy('recentes')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  sortBy === 'recentes'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mais Recentes
              </button>
              <button
                onClick={() => setSortBy('gravidade')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  sortBy === 'gravidade'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Maior Gravidade
              </button>
              <button
                onClick={() => setSortBy('confirmadas')}
                className={`hidden sm:inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  sortBy === 'confirmadas'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mais Confirmadas
              </button>
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Limpar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Verification Status Quick Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800">
        <button
          onClick={() => setSelectedStatusTab('Todos')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selectedStatusTab === 'Todos'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <span>Todos</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 text-slate-200">
            {occurrences.length}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatusTab('Confirmado')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selectedStatusTab === 'Confirmado'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
              : 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/20'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Confirmados</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-900/60 text-emerald-200 font-bold">
            {statusCounts.confirmados}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatusTab('Em verificação')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selectedStatusTab === 'Em verificação'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
              : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40 border border-amber-500/20'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Em verificação</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-900/60 text-amber-200 font-bold">
            {statusCounts.emVerificacao}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatusTab('Resolvido')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selectedStatusTab === 'Resolvido'
              ? 'bg-slate-700 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Resolvidos</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 text-slate-300">
            {statusCounts.resolvidos}
          </span>
        </button>

        <button
          onClick={() => setSelectedStatusTab('Reportado')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            selectedStatusTab === 'Reportado'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'text-blue-400 hover:text-blue-300 hover:bg-blue-950/40 border border-blue-500/20'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Reportados</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-900/60 text-blue-200">
            {statusCounts.reportados}
          </span>
        </button>
      </div>

      {/* Occurrences List */}
      <div className="space-y-3">
        {filteredAndSortedOccurrences.length === 0 ? (
          <div className="rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Sem dados disponíveis</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
              {occurrences.length === 0 
                ? 'Nenhuma ocorrência reportada por fontes oficiais ou utilizadores no momento.' 
                : 'Não existem reportes que correspondam aos filtros de pesquisa atuais.'}
            </p>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Repor todos os filtros
            </button>
          </div>
        ) : (
          filteredAndSortedOccurrences.map((occ) => {
            const cat = getCategoryConfig(occ.type);
            const CatIcon = cat.icon;
            const evaluation = calculateConfidence(occ);
            const isConfirmed = evaluation.status === 'Confirmado';
            const confCount = occ.confirmationsCount !== undefined ? occ.confirmationsCount : (occ.upvotes || 0);

            return (
              <div
                key={occ.id}
                onClick={() => onSelectOccurrence(occ)}
                className={`group relative rounded-2xl sm:rounded-3xl hover:bg-[#0c1424] p-4 sm:p-5 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer border ${
                  isConfirmed 
                    ? 'bg-[#0a181e]/90 border-emerald-500/40 shadow-emerald-500/10 hover:border-emerald-400/60' 
                    : evaluation.status === 'Em verificação'
                    ? 'bg-[#15120a]/90 border-amber-500/30 hover:border-amber-400/50'
                    : 'bg-[#090e1a]/90 border-slate-800/80 hover:border-slate-600/80'
                }`}
                role="button"
                tabIndex={0}
              >
                {/* Confidence & Verification Status Bar */}
                <div className="pb-3 border-b border-slate-800/60">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Category tag */}
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cat.badgeColor}`}>
                        <CatIcon className="w-3.5 h-3.5" />
                        <span>{cat.label}</span>
                      </div>

                      {/* Severity badge */}
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${getSeverityBadge(occ.severity)}`}>
                        {occ.severity}
                      </span>
                    </div>

                    {/* Relative time */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{occ.reportedAt}</span>
                    </div>
                  </div>

                  {/* Complete interactive Confidence Meter */}
                  <ConfidenceMeter occurrence={occ} variant="inline" />
                </div>

                {/* Card Main Body */}
                <div className="flex items-start justify-between gap-4 pt-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                      {occ.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">
                      {occ.description}
                    </p>

                    {/* Location details & company */}
                    <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-400 pt-1">
                      <span className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        <span className="font-medium">{occ.district}</span>
                        {occ.concelho && <span className="text-slate-500">· {occ.concelho}</span>}
                      </span>

                      {occ.locationDetails && (
                        <span className="text-slate-400 truncate max-w-xs">
                          {occ.locationDetails}
                        </span>
                      )}

                      {occ.companyOrService && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700/60">
                          {occ.companyOrService}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Optional Image thumbnail */}
                  {occ.imageUrl && (
                    <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl sm:rounded-2xl overflow-hidden border border-slate-700/60">
                      <img
                        src={occ.imageUrl}
                        alt={occ.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>
                  )}
                </div>

                {/* Card Footer: User, Community metrics */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/40 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-300">
                      {occ.authorName || 'Utilizador Comunitário'}
                    </span>
                    {occ.isBreaking && (
                      <span className="px-1.5 py-0.2 rounded bg-red-600/30 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase">
                        Urgente
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-slate-400 hover:text-white">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{occ.commentsCount || 0}</span>
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 hover:text-white">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{occ.imagesCount || 0}</span>
                    </span>
                    <span className="flex items-center gap-1 text-amber-400 font-semibold">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{confCount}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL: REPORTAR LINHA OU PARAGEM EM FALTA (RULE 6) */}
      {showMissingStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <button
              onClick={() => setShowMissingStopModal(false)}
              className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
                <MapPin className="w-4 h-4" />
                <span>Catálogo de Transportes</span>
              </div>
              <h2 className="text-xl font-black text-white">Reportar linha ou paragem em falta</h2>
              <p className="text-xs text-slate-400 mt-1">
                Ajude a auditar o catálogo nacional de transportes de Portugal indicando operadores ou paragens sem feed aberto ou em falta.
              </p>
            </div>

            {missingSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{missingSuccess}</span>
              </div>
            )}

            {missingError && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{missingError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitMissing} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Operador *
                </label>
                <input
                  type="text"
                  required
                  value={missingOp}
                  onChange={(e) => setMissingOp(e.target.value)}
                  placeholder="Ex: Carris Metropolitana, CP, STCP, TCB, Tubarão..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Localidade / Paragem / Estação *
                </label>
                <input
                  type="text"
                  required
                  value={missingPlace}
                  onChange={(e) => setMissingPlace(e.target.value)}
                  placeholder="Ex: Terminal de Cacilhas, Estação de São Bento, Barreiro..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Detalhes adicionais (opcional)
                </label>
                <textarea
                  rows={3}
                  value={missingDetails}
                  onChange={(e) => setMissingDetails(e.target.value)}
                  placeholder="Ex: Linha 3710 não tem horários das 08h aos fins de semana ou a paragem não surge no mapa..."
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMissingStopModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={missingSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {missingSubmitting ? 'A submeter...' : 'Submeter reporte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

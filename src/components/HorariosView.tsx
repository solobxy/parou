import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Navigation,
  Train, 
  Bus, 
  Zap, 
  Ship, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  RefreshCw, 
  ArrowRight, 
  Filter, 
  X,
  Layers,
  ChevronRight,
  ChevronDown,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  Tag,
  Radio,
  Database,
  ExternalLink,
  Calendar,
  Activity,
  Gauge,
  Compass,
  Map as MapIcon,
  ShieldCheck,
  Building,
  Info,
  Star
} from 'lucide-react';
import { 
  NormalizedTransitService, 
  TransitSearchQuery, 
  TransitSourceRegistryEntry,
  TransitTransportMode,
  searchTransitRealtime,
  fetchTransitSources,
  fetchTmlDiagnostic,
  fetchAvailabilityAudit,
  auditBatchServices,
  GlobalAvailabilityAuditReport,
  RouteAvailabilityAuditEntry,
  TmlDiagnosticData,
  ApiLineItem,
  fetchLinesNear,
  fetchLinesByIds,
  searchAllLines
} from '../services/transitApi';
import { FilterState } from '../types';
import { FavoriteButton } from './FavoriteButton';
import { LineCard } from './LineCard';
import { LineDetailModal } from './LineDetailModal';

interface HorariosViewProps {
  onOpenReportModal?: (prefilledOperator?: string, prefilledLine?: string) => void;
  filters?: FilterState;
  onFilterChange?: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters?: () => void;
  matchingReportsCount?: number;
  onViewReports?: () => void;
  onOpenCatalog?: () => void;
}

export const HorariosView: React.FC<HorariosViewProps> = ({ 
  onOpenReportModal,
  filters: propFilters,
  onFilterChange: propOnFilterChange,
  onResetFilters: propOnResetFilters,
  matchingReportsCount,
  onViewReports,
  onOpenCatalog,
}) => {
  // Services & Registry data from backend
  const [services, setServices] = useState<NormalizedTransitService[]>([]);
  const [sources, setSources] = useState<TransitSourceRegistryEntry[]>([]);
  const [diagnostic, setDiagnostic] = useState<TmlDiagnosticData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>('a carregar...');

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [originFilter, setOriginFilter] = useState<string>('');
  const [destFilter, setDestFilter] = useState<string>('');
  const [stopFilter, setStopFilter] = useState<string>('');
  const [selectedOperator, setSelectedOperator] = useState<string>('Todos');
  const [selectedMode, setSelectedMode] = useState<string>('Todos');
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [onlyRealtime, setOnlyRealtime] = useState<boolean>(false);

  // UI state
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showSourcesModal, setShowSourcesModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [auditReport, setAuditReport] = useState<GlobalAvailabilityAuditReport | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState<boolean>(false);
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [selectedTripDeparture, setSelectedTripDeparture] = useState<Record<string, string>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  // 1. GPS & "Perto de mim" state
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsState, setGpsState] = useState<'prompt' | 'granted' | 'denied' | 'loading'>('loading');
  const [nearLines, setNearLines] = useState<ApiLineItem[]>([]);
  const [isNearLoading, setIsNearLoading] = useState<boolean>(false);

  // 2. Favorites state (localStorage)
  const [favoriteLineIds, setFavoriteLineIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('parou_favorite_line_ids');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [favoriteLines, setFavoriteLines] = useState<ApiLineItem[]>([]);
  const [isFavLoading, setIsFavLoading] = useState<boolean>(false);

  // 3. Todas as linhas (paginated 50 at a time)
  const [allLines, setAllLines] = useState<ApiLineItem[]>([]);
  const [allLinesTotal, setAllLinesTotal] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isAllLinesLoading, setIsAllLinesLoading] = useState<boolean>(false);

  // 4. Line Detail Modal state
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const toggleFavoriteLine = useCallback((lineId: string) => {
    setFavoriteLineIds((prev) => {
      const exists = prev.includes(lineId);
      const next = exists ? prev.filter((id) => id !== lineId) : [...prev, lineId];
      try {
        localStorage.setItem('parou_favorite_line_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Request GPS on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsState('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsState('granted');
      },
      (err) => {
        console.info('GPS indisponível ou permissão não concedida:', err.message);
        setGpsState('denied');
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  // Fetch near lines when userCoords are available
  useEffect(() => {
    if (userCoords) {
      setIsNearLoading(true);
      fetchLinesNear(userCoords.lat, userCoords.lon, 500)
        .then((lines) => setNearLines(lines))
        .catch((err) => console.warn('Erro ao carregar linhas perto:', err))
        .finally(() => setIsNearLoading(false));
    }
  }, [userCoords]);

  // Fetch favorite lines whenever favoriteLineIds changes
  useEffect(() => {
    if (favoriteLineIds.length > 0) {
      setIsFavLoading(true);
      fetchLinesByIds(favoriteLineIds)
        .then((lines) => setFavoriteLines(lines))
        .catch((err) => console.warn('Erro ao carregar favoritos:', err))
        .finally(() => setIsFavLoading(false));
    } else {
      setFavoriteLines([]);
    }
  }, [favoriteLineIds]);

  // Load all lines (paginated 50 at a time)
  const loadAllLines = useCallback(async (q?: string, mode?: string, page = 1) => {
    setIsAllLinesLoading(true);
    try {
      const res = await searchAllLines(q, mode, page);
      setAllLines(res.lines);
      setAllLinesTotal(res.total);
      setCurrentPage(res.page);
      setTotalPages(res.total_pages);
    } catch (err) {
      console.warn('Erro ao pesquisar todas as linhas:', err);
    } finally {
      setIsAllLinesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllLines(searchQuery, selectedMode, currentPage);
  }, [searchQuery, selectedMode, currentPage, loadAllLines]);

  const loadAuditReport = useCallback((d?: string) => {
    setIsAuditLoading(true);
    fetchAvailabilityAudit(d || auditDate)
      .then((rep) => setAuditReport(rep))
      .catch((err) => console.warn('Erro ao carregar relatório de auditoria:', err))
      .finally(() => setIsAuditLoading(false));
  }, [auditDate]);

  useEffect(() => {
    if (showAuditModal) {
      loadAuditReport(auditDate);
    }
  }, [showAuditModal, auditDate, loadAuditReport]);

  // Load sources registry & diagnostic once
  useEffect(() => {
    fetchTransitSources()
      .then((res) => setSources(res.sources))
      .catch((err) => console.warn('Erro ao carregar fontes:', err));

    fetchTmlDiagnostic()
      .then((d) => setDiagnostic(d))
      .catch((err) => console.warn('Erro ao carregar diagnóstico:', err));

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch real transit schedules from backend
  const loadTransitData = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [res, diag] = await Promise.all([
        searchTransitRealtime({
          query: searchQuery || undefined,
          origin: originFilter || undefined,
          destination: destFilter || undefined,
          stop: stopFilter || undefined,
          operator: selectedOperator !== 'Todos' ? selectedOperator : undefined,
          transport_mode: selectedMode !== 'Todos' ? selectedMode : undefined,
          region: selectedRegion !== 'Todas' ? selectedRegion : undefined,
          date: selectedDate,
          time: selectedTime,
          only_realtime: onlyRealtime,
        }, controller.signal),
        fetchTmlDiagnostic().catch(() => null),
      ]);

      if (controller.signal.aborted) return;

      const audited = auditBatchServices(res.results, selectedDate);
      setServices(audited.services);
      if (res.sources_registry && res.sources_registry.length > 0) {
        setSources(res.sources_registry);
      }
      if (diag) {
        setDiagnostic(diag);
      }
      setLastUpdatedTime(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      if (
        err?.name === 'AbortError' || 
        controller.signal.aborted || 
        err?.message?.toLowerCase().includes('abort') ||
        err?.message?.includes('The user aborted')
      ) {
        return;
      }
      console.warn('Aviso na pesquisa de horários:', err?.message || err);
      setErrorMsg('Não foi possível sincronizar com as fontes oficiais de transportes. Tente novamente.');
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [
    searchQuery,
    originFilter,
    destFilter,
    stopFilter,
    selectedOperator,
    selectedMode,
    selectedRegion,
    selectedDate,
    selectedTime,
    onlyRealtime,
  ]);

  // Debounced load on query/filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTransitData();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadTransitData]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setOriginFilter('');
    setDestFilter('');
    setStopFilter('');
    setSelectedOperator('Todos');
    setSelectedMode('Todos');
    setSelectedRegion('Todas');
    setOnlyRealtime(false);
    const d = new Date();
    setSelectedDate(d.toISOString().split('T')[0]);
    setSelectedTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  };

  // Helper icons for transport modes
  const getModeIcon = (mode: TransitTransportMode) => {
    switch (mode) {
      case 'Metro':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'Comboio':
        return <Train className="w-4 h-4 text-amber-400" />;
      case 'Barco':
        return <Ship className="w-4 h-4 text-cyan-400" />;
      case 'Elétrico':
        return <Train className="w-4 h-4 text-yellow-400" />;
      case 'Autocarro':
      default:
        return <Bus className="w-4 h-4 text-blue-400" />;
    }
  };

  // Aggregate stats
  const stats = useMemo(() => {
    const total = services.length;
    const realtimeCount = services.filter((s) => s.data_classification === 'Tempo Real' || s.realtime_info?.has_realtime).length;
    const alertsCount = services.filter((s) => s.alerts && s.alerts.length > 0).length;
    const disruptionsCount = services.filter((s) => s.service_status === 'Perturbado' || s.service_status === 'Interrompido').length;
    return { total, realtimeCount, alertsCount, disruptionsCount };
  }, [services]);

  // Available options
  const OPERATORS_LIST = [
    'Todos',
    'Carris Metropolitana',
    'Metropolitano de Lisboa',
    'CP - Comboios de Portugal',
    'Fertagus',
    'Transtejo Soflusa',
    'UNIR Mobilidade (AMP)',
    'STCP',
    'Metro do Porto',
    'Carris',
    'TUB Braga',
    'SMTUC Coimbra',
    'Horários do Funchal',
    'VAMUS Algarve',
  ];

  const REGIONS_LIST = [
    'Todas',
    'Área Metropolitana de Lisboa',
    'Área Metropolitana do Porto',
    'Norte / Cávado',
    'Centro / Região de Coimbra',
    'Algarve',
    'Região Autónoma da Madeira',
  ];

  const MODES_LIST: { label: string; value: string }[] = [
    { label: 'Todos os Meios', value: 'Todos' },
    { label: 'Metro', value: 'Metro' },
    { label: 'Comboio', value: 'Comboio' },
    { label: 'Autocarro', value: 'Autocarro' },
    { label: 'Barco / Fluvial', value: 'Barco' },
    { label: 'Elétrico', value: 'Elétrico' },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080c14] overflow-y-auto">
      {/* Top Main Navigation Header */}
      <div className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Clock className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  Sistema Real de Transportes PAROU.PT
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    TML GO Hub & Fontes Oficiais
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Dados reais e auditados de horários programados GTFS, posições GPS e telemetria GTFS-RT sem mock data.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Metrics Ribbon */}
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <strong>{allLinesTotal > 0 ? allLinesTotal : stats.total}</strong> carreiras carregadas
            </span>
            {diagnostic && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <strong>{diagnostic.vehicles_valid}</strong> veículos em tempo real (GTFS-RT)
              </span>
            )}
            {diagnostic && diagnostic.alerts_received > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <strong>{diagnostic.alerts_received}</strong> alertas oficiais ativos
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            <button
              onClick={() => setShowSourcesModal(true)}
              className="text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <Database className="w-3 h-3" />
              <span>Registo de Fontes ({sources.length})</span>
            </button>
            <span>•</span>
            <button
              onClick={() => setShowAuditModal(true)}
              className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Auditoria Global de Disponibilidade</span>
            </button>
            <span>•</span>
            <span>Última atualização: {lastUpdatedTime}</span>
          </div>
        </div>
      </div>


      {/* HORÁRIOS & CARREIRAS PROGRAMADAS */}
        <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-5 flex-1">
          {/* Search & Filter Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl backdrop-blur-sm space-y-4">
            {/* Primary Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar por linha (ex: 2336, 1715, Linha Azul, Sintra, 500, 728), operador, paragem..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Transport Mode Selector Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                {MODES_LIST.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setSelectedMode(mode.value)}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                      selectedMode === mode.value
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                        : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Toggle Advanced Filters */}
              <button
                onClick={() => setShowAdvanced((prev) => !prev)}
                className={`flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  showAdvanced || originFilter || destFilter || stopFilter || selectedOperator !== 'Todos' || selectedRegion !== 'Todas' || onlyRealtime
                    ? 'bg-blue-950/60 border-blue-500/50 text-blue-300'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filtros Detalhados</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Advanced Search Options Drawer */}
            {showAdvanced && (
              <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in duration-200">
                {/* Origem */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Origem
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={originFilter}
                      onChange={(e) => setOriginFilter(e.target.value)}
                      placeholder="Ex: Cais do Sodré, Sintra, Dragão..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Destino */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Destino
                  </label>
                  <div className="relative">
                    <Navigation className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={destFilter}
                      onChange={(e) => setDestFilter(e.target.value)}
                      placeholder="Ex: Cascais, Rossio, Matosinhos..."
                      className="w-full pl-8 pr-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Operador */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Operador Oficial
                  </label>
                  <select
                    value={selectedOperator}
                    onChange={(e) => setSelectedOperator(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {OPERATORS_LIST.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Região */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Região / Área
                  </label>
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {REGIONS_LIST.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Data & Hora da Pesquisa */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Data de Partida
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Hora de Referência
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Paragem Específica */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Paragem ou Estação
                  </label>
                  <input
                    type="text"
                    value={stopFilter}
                    onChange={(e) => setStopFilter(e.target.value)}
                    placeholder="Ex: Marquês, Trindade, Campanhã..."
                    className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Only Realtime Toggle & Reset */}
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyRealtime}
                      onChange={(e) => setOnlyRealtime(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 font-medium">Apenas com Tempo Real ativo</span>
                  </label>

                  <button
                    onClick={handleResetFilters}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Limpar Filtros</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Legend Explanatory Bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Distinção de Dados Oficiais:</span>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-blue-300 border border-blue-500/30 font-semibold text-[10px]">
                  Programado
                </span>
                <span>Horário GTFS nominal</span>
              </span>

              <span className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-semibold text-[10px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Tempo Real
                </span>
                <span>Confirmado por GPS/GTFS-RT/API</span>
              </span>

              <span className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-amber-950/80 text-amber-300 border border-amber-600/40 font-semibold text-[10px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Alerta Oficial
                </span>
                <span>Publicado pelo operador</span>
              </span>
            </div>
          </div>

          {/* Error message if any */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-950/50 border border-red-800/60 text-red-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={loadTransitData}
                className="px-3 py-1 bg-red-800/60 hover:bg-red-700/80 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* SECTION 1: PERTO DE MIM (Requirement 3a) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    Perto de mim
                    {userCoords && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        GPS Ativo
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Linhas com paragens num raio de 500 m (ou 1 km) da sua localização atual
                  </p>
                </div>
              </div>
            </div>

            {gpsState === 'denied' ? (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    Sem acesso à localização GPS. Ative a localização no seu navegador para ver as linhas com paragens perto de si.
                  </span>
                </div>
              </div>
            ) : isNearLoading ? (
              <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400 mx-auto" />
                <p className="text-xs text-slate-400">A detetar linhas que servem paragens próximas...</p>
              </div>
            ) : nearLines.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                Nenhuma carreira encontrada com paragens próximas da sua posição.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {nearLines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    onClick={() => setSelectedLineId(line.id)}
                    isFavorite={favoriteLineIds.includes(line.id)}
                    onToggleFavorite={(e, id) => {
                      e.stopPropagation();
                      toggleFavoriteLine(id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: FAVORITOS (Requirement 3b) */}
          <div className="space-y-3 pt-4 border-t border-slate-800/60">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  Favoritos
                  {favoriteLines.length > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {favoriteLines.length}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-400">
                  As suas linhas e paragens frequentes guardadas localmente
                </p>
              </div>
            </div>

            {isFavLoading ? (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-amber-400 mx-auto" />
                <p className="text-xs text-slate-400">A carregar favoritos...</p>
              </div>
            ) : favoriteLines.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 space-y-1">
                <p>Ainda não adicionou nenhuma linha aos favoritos.</p>
                <p className="text-slate-500 text-[11px]">Toque na estrela de qualquer carreira para a guardar aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {favoriteLines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    onClick={() => setSelectedLineId(line.id)}
                    isFavorite={true}
                    onToggleFavorite={(e, id) => {
                      e.stopPropagation();
                      toggleFavoriteLine(id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: TODAS AS LINHAS (Requirement 3c) */}
          <div className="space-y-3 pt-4 border-t border-slate-800/60">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    Todas as linhas
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                      {allLinesTotal}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Todas as linhas de todos os feeds na base de dados em Portugal
                  </p>
                </div>
              </div>
            </div>

            {isAllLinesLoading ? (
              <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
                <p className="text-xs text-slate-400">A carregar rede oficial de carreiras...</p>
              </div>
            ) : allLines.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
                Nenhuma linha encontrada para o critério pesquisado.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allLines.map((line) => (
                    <LineCard
                      key={line.id}
                      line={line}
                      onClick={() => setSelectedLineId(line.id)}
                      isFavorite={favoriteLineIds.includes(line.id)}
                      onToggleFavorite={(e, id) => {
                        e.stopPropagation();
                        toggleFavoriteLine(id);
                      }}
                    />
                  ))}
                </div>

                {/* Pagination Controls (50 per page) */}
                {totalPages > 1 && (
                  <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                    >
                      Anterior
                    </button>

                    <span className="font-medium text-slate-400">
                      Página <strong className="text-white">{currentPage}</strong> de <strong className="text-white">{totalPages}</strong> ({allLinesTotal} carreiras)
                    </span>

                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                    >
                      Seguinte
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LINE DETAIL MODAL (Requirement 4) */}
          {selectedLineId && (
            <LineDetailModal
              lineId={selectedLineId}
              onClose={() => setSelectedLineId(null)}
              userCoords={userCoords}
              isFavorite={favoriteLineIds.includes(selectedLineId)}
              onToggleFavorite={(id) => toggleFavoriteLine(id)}
            />
          )}
          {false && (
            <div className="space-y-4">
              {services.map((service) => {
                const isExpanded = expandedRouteId === service.id;
                const hasAlerts = service.alerts && service.alerts.length > 0;
                const hasRealtime = service.data_classification === 'Tempo Real' || service.realtime_info?.has_realtime;
                const activeVehicles = service.realtime_info?.active_vehicles || [];

                return (
                  <div
                    key={service.id}
                    className="rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/90 transition-all shadow-lg overflow-hidden"
                  >
                    {/* Service Card Top Banner */}
                    <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60">
                      <div className="flex items-start sm:items-center gap-3">
                        {/* Line Code Badge */}
                        <div
                          className="px-3 py-1.5 rounded-xl font-extrabold text-sm sm:text-base flex items-center gap-1.5 shadow-md"
                          style={{
                            backgroundColor: service.color || '#2563eb',
                            color: service.text_color || '#ffffff',
                          }}
                        >
                          {getModeIcon(service.transport_mode)}
                          <span>{service.line_code}</span>
                        </div>

                        {/* Line Title & Operator */}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                              {service.line_name}
                            </h2>

                            {/* Data Classification Badge */}
                            {service.data_classification === 'Tempo Real' ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                Tempo Real
                              </span>
                            ) : service.data_classification === 'Alerta Oficial' ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                Alerta Oficial
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-blue-300 border border-blue-500/30 text-[10px] font-semibold">
                                Programado
                              </span>
                            )}

                            {/* Service Status Badge (Alerts/Operational status) */}
                            {service.service_status === 'Perturbado' ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-950/70 text-amber-300 border border-amber-600/40 text-[10px] font-bold">
                                Perturbação em Curso
                              </span>
                            ) : service.service_status === 'Interrompido' ? (
                              <span className="px-2 py-0.5 rounded-md bg-red-950/80 text-red-300 border border-red-700/50 text-[10px] font-bold">
                                Serviço Interrompido
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-950/40 text-emerald-400 border border-emerald-800/30 text-[10px] font-medium">
                                Serviço normal
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                            <span className="text-slate-300 font-medium">{service.operator_name}</span>
                            <span>•</span>
                            <span>{service.region}</span>
                            {service.frequency_minutes && (
                              <>
                                <span>•</span>
                                <span className="text-blue-300 font-medium">Frequência: a cada {service.frequency_minutes} min</span>
                              </>
                            )}
                            {service.duration_estimate_minutes && (
                              <>
                                <span>•</span>
                                <span>Duração estimada: ~{service.duration_estimate_minutes} min</span>
                              </>
                            )}
                          </div>

                          {/* Operational Status Notice Banner */}
                          {service.status_message && (
                            <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-medium flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span className="font-semibold">{service.status_message}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Favorite Button & Next Departure Primary Highlight */}
                      <div className="flex items-center gap-2.5">
                        <FavoriteButton
                          item={{
                            id: `line-${service.operator_id}-${service.line_code}`,
                            type: 'linha',
                            category: 'transportes',
                            title: `${service.line_code} - ${service.line_name}`,
                            subtitle: `${service.operator_name} • ${service.region}`,
                            operatorId: service.operator_id,
                            operatorName: service.operator_name,
                            lineCode: service.line_code,
                            lineName: service.line_name,
                            lineColor: service.color,
                            transportMode: service.transport_mode as any,
                            locality: service.region,
                          }}
                          size="md"
                        />
                        {service.next_departure ? (
                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-right min-w-[130px]">
                            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-end gap-1">
                              <Clock className="w-3 h-3 text-blue-400" />
                              <span>Próxima Partida</span>
                            </div>
                            <div className="text-xl font-extrabold text-white tracking-tight flex items-center justify-end gap-1.5 mt-0.5">
                              <span>{service.next_departure.time}</span>
                              {service.next_departure.is_realtime ? (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                                  RT
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-medium border border-blue-500/30">
                                  GTFS
                                </span>
                              )}
                            </div>
                            {(service.next_departure.aviso_horario || (service as any).aviso_horario) && (
                              <div className="text-[9px] text-amber-400/90 font-medium">
                                {service.next_departure.aviso_horario || (service as any).aviso_horario}
                              </div>
                            )}
                            <div className="text-[10px] font-semibold text-emerald-400">
                              {service.next_departure.is_realtime ? 'Tempo Real' : 'Programado'}
                            </div>
                          </div>
                        ) : (
                          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-right min-w-[130px]">
                            <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-end gap-1">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>Serviço</span>
                            </div>
                            <div className="text-xs text-slate-300 font-semibold mt-1">
                              {service.service_status === 'Interrompido' ? 'Fora de serviço' : 'Sem partidas'}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[140px]" title={service.status_message}>
                              {service.status_message || 'Data selecionada'}
                            </div>
                          </div>
                        )}

                        {/* Report Occurrence Action */}
                        {onOpenReportModal && (
                          <button
                            onClick={() => onOpenReportModal(service.operator_name, service.line_code)}
                            title="Reportar ocorrência ou atraso nesta linha"
                            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Route & Direction Bar */}
                    <div className="px-4 sm:px-5 py-3 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-slate-800/40">
                      <div className="flex items-center gap-2 text-slate-300 font-medium">
                        <span className="text-slate-400 font-normal">Sentido:</span>
                        <span className="font-semibold text-white">{service.direction}</span>
                        <span>(</span>
                        <span className="text-slate-200">{service.origin}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-slate-200 font-semibold">{service.destination}</span>
                        <span>)</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedRouteId(isExpanded ? null : service.id)}
                          className="text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>{isExpanded ? 'Ocultar Paragens' : `Ver ${service.stops.length} Paragens`}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Official Operator Alerts if active */}
                    {hasAlerts && (
                      <div className="p-4 bg-amber-950/30 border-b border-amber-900/40 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>Avisos e Perturbações Oficiais do Operador</span>
                        </div>
                        {service.alerts.map((alert) => (
                          <div key={alert.id} className="text-xs text-amber-200 bg-amber-950/60 p-2.5 rounded-xl border border-amber-800/40 space-y-1">
                            <div className="font-bold text-white">{alert.title}</div>
                            <div className="text-slate-300 leading-relaxed">{alert.description}</div>
                            {alert.url && (
                              <a
                                href={alert.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-blue-400 hover:underline inline-flex items-center gap-1 mt-1 font-semibold"
                              >
                                <span>Consultar aviso no portal oficial da transportadora</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Realtime Live GPS / Vehicles Section (NO SLICE - shows all vehicles) */}
                    {hasRealtime && activeVehicles.length > 0 && (
                      <div className="p-4 bg-emerald-950/20 border-b border-emerald-900/30 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            <span>Veículos em Circulação nesta Carreira (GTFS-Realtime)</span>
                          </span>
                          <span className="text-[10px] text-emerald-400 font-mono font-bold">
                            {activeVehicles.length} veículo(s) ativo(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 max-h-60 overflow-y-auto">
                          {activeVehicles.map((v, vIdx) => (
                            <div key={v.vehicle_id || vIdx} className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-800/40 space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-semibold text-white">
                                <span>Veículo {v.vehicle_id}</span>
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                                  {v.current_status || 'Em trânsito'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Gauge className="w-3 h-3 text-slate-400" />
                                  {v.speed !== undefined ? `${v.speed} km/h` : 'Velocidade N/D'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Compass className="w-3 h-3 text-slate-400" />
                                  {v.bearing !== undefined ? `${v.bearing}°` : 'Rumo N/D'}
                                </span>
                              </div>
                              {v.stop_name && (
                                <div className="text-[10px] text-blue-300 truncate">
                                  Próx: {v.stop_name}
                                </div>
                              )}
                              {v.eta_seconds !== undefined && (
                                <div className="text-[10px] text-emerald-400 font-semibold">
                                  ETA: ~{Math.round(v.eta_seconds / 60)} min ({v.eta_seconds}s)
                                </div>
                              )}
                              <div className="text-[9px] text-slate-500 font-mono">
                                GPS: {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upcoming Departures Timeline Pills */}
                    <div className="p-4 sm:p-5">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                        <span>Horários Seguintes Programados ({selectedDate})</span>
                        <span className="text-[10px] font-normal text-slate-500">
                          {service.upcoming_departures.length} partidas seguintes
                        </span>
                      </div>

                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {service.upcoming_departures.map((dep, idx) => (
                          <div
                            key={idx}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap flex flex-col items-center min-w-[65px] ${
                              idx === 0
                                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                                : 'bg-slate-950/70 border-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="text-sm font-bold text-white">{dep.time}</span>
                            {dep.is_realtime ? (
                              <span className="text-[9px] text-emerald-400 font-bold">Tempo Real</span>
                            ) : (
                              <span className="text-[9px] text-slate-500 font-normal">Programado</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Expandable Route & Stops Drawer */}
                    {isExpanded && (() => {
                      const activeDepTime = selectedTripDeparture[service.id] || service.next_departure?.time || service.upcoming_departures?.[0]?.time || 'sem horário';

                      return (
                        <div className="p-4 sm:p-5 bg-slate-950/90 border-t border-slate-800 animate-in slide-in-from-top-2 duration-200">
                          {/* Header with departure selector */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-slate-800/80">
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-2">
                                <span>Itinerário Completo da Linha ({service.stops.length} paragens)</span>
                                <span className="text-slate-500 text-[11px]">Sentido {service.direction}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                                <span>Partida oficial da viagem:</span>
                                <span className="font-mono font-bold text-cyan-300 bg-cyan-950/70 px-1.5 py-0.2 rounded border border-cyan-800/60 shadow-xs">{activeDepTime}</span>
                              </div>
                            </div>

                            {service.upcoming_departures && service.upcoming_departures.length > 1 && (
                              <div className="flex items-center gap-1.5 text-xs bg-slate-900/80 p-1.5 rounded-lg border border-slate-800 self-start sm:self-auto">
                                <span className="text-slate-400 text-[10px] font-medium pl-1 shrink-0">Outras viagens:</span>
                                <div className="flex items-center gap-1 overflow-x-auto max-w-xs scrollbar-none">
                                  {service.upcoming_departures.slice(0, 5).map((dep, dIdx) => {
                                    const isSelected = activeDepTime === dep.time;
                                    return (
                                      <button
                                        key={dIdx}
                                        type="button"
                                        onClick={() => setSelectedTripDeparture((prev) => ({ ...prev, [service.id]: dep.time }))}
                                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-1 ring-blue-400'
                                            : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                        }`}
                                      >
                                        {dep.time}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                            {service.stops.map((stop, sIdx) => {
                              const isFirst = sIdx === 0;
                              const isLast = sIdx === service.stops.length - 1;

                              // Official stop time strictly from stop_times.txt for this stop
                              const rawStopTime = stop.scheduled_time || (stop as any).departure_time || stop.arrival_time;
                              const stopTimeStr = rawStopTime ? rawStopTime.slice(0, 5) : 'sem horário';

                              return (
                                <div key={stop.id || sIdx} className="relative flex items-center justify-between text-xs gap-3">
                                  <div
                                    className={`absolute -left-6 w-3 h-3 rounded-full border-2 ${
                                      isFirst
                                        ? 'bg-blue-500 border-white ring-4 ring-blue-500/20'
                                        : isLast
                                        ? 'bg-emerald-500 border-white ring-4 ring-emerald-500/20'
                                        : 'bg-slate-900 border-slate-600'
                                    }`}
                                  />

                                  {/* Stop Name & Official Arrival Time */}
                                  <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                    <span className={`font-semibold ${isFirst || isLast ? 'text-white font-bold' : 'text-slate-200'}`}>
                                      {stop.name}
                                    </span>

                                    {/* Arrival time badge at this stop */}
                                    <span className={`inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded text-[11px] border shadow-xs ${
                                      stopTimeStr === 'sem horário'
                                        ? 'bg-slate-950 text-slate-500 border-slate-850'
                                        : isFirst
                                        ? 'bg-blue-950/80 text-blue-300 border-blue-700/60 ring-1 ring-blue-500/30'
                                        : isLast
                                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 ring-1 ring-emerald-500/30'
                                        : 'bg-slate-900 text-cyan-300 border-slate-700/80'
                                    }`}>
                                      <Clock className={`w-3 h-3 ${stopTimeStr === 'sem horário' ? 'text-slate-600' : 'text-cyan-400'} shrink-0`} />
                                      <span>{stopTimeStr}</span>
                                      {stopTimeStr !== 'sem horário' && isFirst ? (
                                        <span className="text-[9px] text-blue-400 uppercase font-bold ml-0.5">Partida</span>
                                      ) : stopTimeStr !== 'sem horário' && isLast ? (
                                        <span className="text-[9px] text-emerald-400 uppercase font-bold ml-0.5">Chegada</span>
                                      ) : null}
                                    </span>
                                  </div>

                                  <div className="text-right shrink-0 flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      Paragem #{stop.sequence}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Service Footer: Source Metadata */}
                    <div className="px-4 sm:px-5 py-2.5 bg-slate-950/40 border-t border-slate-800/40 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Database className="w-3 h-3 text-slate-500" />
                        <span>Fonte: {service.source_id}</span>
                      </div>

                      <a
                        href={service.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium hover:underline"
                      >
                        <span>Portal da Transportadora</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      {/* Official Sources Registry Modal */}
      {showSourcesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Registo de Fontes Oficiais de Transporte</h3>
                  <p className="text-xs text-slate-400">
                    Monitorização técnica de feeds GTFS, GTFS-RT, APIs e SIRI em Portugal
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSourcesModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* TOTAIS DE PORTUGAL NO TOPO DO REGISTO DE FONTES */}
              {(() => {
                const totalOps = sources.length;
                const totalLinesPt = sources.reduce((acc, s) => acc + (s.imported_lines ?? s.records_count ?? 0), 0);
                const totalStopsPt = sources.reduce((acc, s) => acc + (s.imported_stops ?? 0), 0);
                const totalTripsPt = sources.reduce((acc, s) => acc + (s.imported_trips ?? 0), 0);
                const totalExpiredPt = sources.filter((s) => s.sync_status === 'Horário expirado' || s.status === 'horário expirado').length;

                return (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-800/40 shadow-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wider font-extrabold text-blue-400">Totais de Portugal</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/60 text-blue-200 border border-blue-700/50">
                          Rede Nacional Unificada
                        </span>
                      </div>
                      {totalExpiredPt > 0 && (
                        <span className="text-[11px] font-bold text-amber-400 bg-amber-950/40 border border-amber-800/50 px-2 py-0.5 rounded-full">
                          {totalExpiredPt} com horário expirado
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Operadores</div>
                        <div className="text-lg sm:text-xl font-extrabold text-white mt-0.5">{totalOps}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Linhas Totais</div>
                        <div className="text-lg sm:text-xl font-extrabold text-blue-400 mt-0.5">{totalLinesPt.toLocaleString('pt-PT')}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Paragens Nacionais</div>
                        <div className="text-lg sm:text-xl font-extrabold text-emerald-400 mt-0.5">{totalStopsPt.toLocaleString('pt-PT')}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/70">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase">Viagens Agendadas</div>
                        <div className="text-lg sm:text-xl font-extrabold text-indigo-400 mt-0.5">{totalTripsPt.toLocaleString('pt-PT')}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-4">
                {sources.map((src) => {
                  const importedLines = src.imported_lines ?? src.records_count ?? 0;
                  const importedStops = src.imported_stops ?? 0;
                  const importedTrips = src.imported_trips ?? 0;
                  const recvVehicles = src.received_vehicles ?? 0;
                  const presVehicles = src.presented_vehicles ?? 0;
                  const recvAlerts = src.received_alerts ?? 0;
                  const hasDiscard = recvVehicles !== presVehicles;
                  const errorMsg = src.error || src.last_error;
                  const isExpired = src.sync_status === 'Horário expirado';

                  return (
                    <div
                      key={src.source_id}
                      className={`p-4 rounded-2xl border transition-all ${
                        isExpired
                          ? 'bg-amber-950/20 border-amber-800/60'
                          : src.sync_status === 'Online'
                          ? 'bg-slate-950/80 border-slate-800/80'
                          : 'bg-red-950/20 border-red-800/60'
                      }`}
                    >
                      {/* Top Header: Operator & Source URL & Status */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong className="text-base font-bold text-white">{src.operator}</strong>
                            <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/40 text-[10px] font-mono font-bold">
                              {src.source_type}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              src.sync_status === 'Online'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                                : isExpired
                                ? 'bg-amber-950 text-amber-300 border border-amber-600/50'
                                : 'bg-red-950 text-red-400 border border-red-800/50'
                            }`}>
                              {src.sync_status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>{src.region || 'Portugal'}</span>
                            <span>•</span>
                            <span>ID: <code className="text-slate-300">{src.source_id}</code></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <a
                            href={src.source_url || src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs flex items-center gap-1.5 transition-colors border border-slate-700/60"
                          >
                            <span>Fonte Oficial</span>
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          </a>
                        </div>
                      </div>

                      {/* 14 Official Audit Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 text-xs">
                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Linhas Importadas</div>
                          <div className="text-base font-bold text-white mt-0.5">{importedLines}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Paragens Importadas</div>
                          <div className="text-base font-bold text-white mt-0.5">{importedStops}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Viagens Importadas</div>
                          <div className="text-base font-bold text-white mt-0.5">{importedTrips}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Tempo Real / RT</div>
                          <div className="text-base font-bold text-emerald-400 mt-0.5">
                            {src.realtime_available ? 'Sim (Ativo)' : 'Não Suportado'}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Veículos Recebidos</div>
                          <div className="text-base font-bold text-white mt-0.5">{recvVehicles}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Veículos Apresentados</div>
                          <div className="text-base font-bold text-white mt-0.5">{presVehicles}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Alertas Recebidos</div>
                          <div className="text-base font-bold text-amber-400 mt-0.5">{recvAlerts}</div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Validade do GTFS</div>
                          <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                            {src.validity_start ? `${src.validity_start} até ${src.validity_end}` : 'Contínua / API ao vivo'}
                          </div>
                        </div>
                      </div>

                      {/* Discard Reason Notice (Se dados recebidos != apresentados) */}
                      {hasDiscard && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-xs text-amber-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-amber-200">Motivo da discrepância de telemetria:</strong>{' '}
                            {src.discard_reasons?.join(', ') || 'Coordenadas GPS nulas ou fora dos limites geográficos auditados da rede.'}
                          </div>
                        </div>
                      )}

                      {/* Error Banner */}
                      {errorMsg && (
                        <div className="mt-3 p-2.5 rounded-xl bg-red-950/40 border border-red-800/50 text-xs text-red-300 flex items-start gap-2">
                          <AlertOctagon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-red-200">Diagnóstico de Falha:</strong> {errorMsg}
                          </div>
                        </div>
                      )}

                      {/* Sync Timestamp Footer */}
                      <div className="mt-3 pt-2 border-t border-slate-800/50 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Última Sincronização: {new Date(src.last_update || src.last_sync || Date.now()).toLocaleString('pt-PT')}</span>
                        {isExpired && (
                          <span className="text-amber-400 font-bold">Aviso: Horário expirado no feed oficial da transportadora</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>{sources.length} operadores registados</span>
              <button
                onClick={() => setShowSourcesModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors cursor-pointer"
              >
                Fechar Registo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Availability Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                  <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Auditoria Global de Disponibilidade de Serviços</span>
                    {auditReport && (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        auditReport.verdict === 'Passou'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : 'bg-red-950 text-red-400 border border-red-800/60'
                      }`}>
                        {auditReport.verdict === 'Passou' ? '✓ Aprovado / Conforme' : '✗ Falhou'}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Validação exaustiva de rotas, sentidos, calendários e partidas sem partidas inventadas
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowAuditModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date Selection & Filter Toolbar */}
            <div className="p-4 bg-slate-950/70 border-b border-slate-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Quick Date Presets */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
                  <span className="text-slate-400 font-medium mr-1 text-[11px]">Data de Teste:</span>
                  <button
                    onClick={() => { setAuditDate('2026-10-01'); loadAuditReport('2026-10-01'); }}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      auditDate === '2026-10-01' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Hoje (Útil)
                  </button>
                  <button
                    onClick={() => { setAuditDate('2026-10-02'); loadAuditReport('2026-10-02'); }}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      auditDate === '2026-10-02' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Sexta-feira
                  </button>
                  <button
                    onClick={() => { setAuditDate('2026-10-03'); loadAuditReport('2026-10-03'); }}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      auditDate === '2026-10-03' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Sábado
                  </button>
                  <button
                    onClick={() => { setAuditDate('2026-10-04'); loadAuditReport('2026-10-04'); }}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      auditDate === '2026-10-04' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Domingo
                  </button>
                  <button
                    onClick={() => { setAuditDate('2026-10-05'); loadAuditReport('2026-10-05'); }}
                    className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                      auditDate === '2026-10-05' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Feriado (5 Out)
                  </button>
                </div>

                {/* Date Picker Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => {
                      setAuditDate(e.target.value);
                      loadAuditReport(e.target.value);
                    }}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => loadAuditReport(auditDate)}
                    disabled={isAuditLoading}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                    title="Recarregar auditoria"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isAuditLoading ? 'animate-spin text-blue-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Filter inside audit */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Pesquisar por carreira (ex: 801, 728, Azul), operador ou paragem no relatório..."
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {isAuditLoading && !auditReport ? (
                <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                  <p className="text-xs">A executar validação automática sobre todos os operadores e rotas...</p>
                </div>
              ) : auditReport ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Operadores</div>
                      <div className="text-xl font-extrabold text-white mt-0.5">{auditReport.total_operators_audited}</div>
                      <div className="text-[10px] text-slate-500">100% auditados</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Linhas Totais</div>
                      <div className="text-xl font-extrabold text-white mt-0.5">{auditReport.total_routes_audited}</div>
                      <div className="text-[10px] text-slate-500">Rotas oficiais</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Serviços Ativos</div>
                      <div className="text-xl font-extrabold text-emerald-400 mt-0.5">{auditReport.active_routes_count}</div>
                      <div className="text-[10px] text-emerald-500/80">Com viagens hoje</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Sem Viagens Hoje</div>
                      <div className="text-xl font-extrabold text-slate-300 mt-0.5">{auditReport.routes_without_trips_today}</div>
                      <div className="text-[10px] text-slate-500">Fora do calendário</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Falsos Fora de Serviço</div>
                      <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                        {auditReport.anomalies_detected.lines_incorrectly_marked_out_of_service}
                      </div>
                      <div className="text-[10px] text-emerald-500/80">0 anomalias</div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Partidas Fabricadas</div>
                      <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
                        {auditReport.anomalies_detected.artificially_generated_departures}
                      </div>
                      <div className="text-[10px] text-emerald-500/80">0 dados inventados</div>
                    </div>
                  </div>

                  {/* Audit Entries List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                      <span className="font-semibold text-slate-300">
                        Amostra Auditada ({
                          auditReport.sample_routes.filter(r => 
                            !auditSearch || 
                            r.route.toLowerCase().includes(auditSearch.toLowerCase()) || 
                            r.operator.toLowerCase().includes(auditSearch.toLowerCase())
                          ).length
                        } carreiras)
                      </span>
                      <span>Data: {auditReport.date} (Dia da Semana: {auditReport.day_of_week})</span>
                    </div>

                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {auditReport.sample_routes
                        .filter(r => 
                          !auditSearch || 
                          r.route.toLowerCase().includes(auditSearch.toLowerCase()) || 
                          r.operator.toLowerCase().includes(auditSearch.toLowerCase())
                        )
                        .map((entry, idx) => (
                          <div
                            key={`${entry.route_id}-${entry.direction_id}-${idx}`}
                            className={`p-3 rounded-2xl border transition-all text-xs ${
                              entry.discrepancy
                                ? 'bg-red-950/30 border-red-700/60'
                                : entry.valid_trips > 0
                                ? 'bg-slate-950/70 border-slate-800/80'
                                : 'bg-slate-950/40 border-slate-800/40 opacity-70'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800/50 font-bold text-[10px]">
                                    {entry.operator}
                                  </span>
                                  <strong className="text-white font-bold">{entry.route}</strong>
                                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                                    Sentido: {entry.direction} (dir: {entry.direction_id})
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                                  <span>Serviços ativos: <code className="text-slate-300">{entry.active_service_ids.join(', ') || 'Nenhum'}</code></span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 self-start sm:self-center">
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-400 font-semibold">Viagens / Partidas</div>
                                  <div className="text-xs font-bold text-white">
                                    {entry.valid_trips} viagens • {entry.valid_departures} partidas
                                  </div>
                                </div>

                                <div className="text-right min-w-[70px]">
                                  <div className="text-[10px] text-slate-400 font-semibold">1.ª Partida</div>
                                  <div className="text-xs font-mono font-bold text-emerald-400">
                                    {entry.next_departure || '—'}
                                  </div>
                                </div>

                                <div className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${
                                  entry.status === 'Ativo'
                                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}>
                                  {entry.status}
                                </div>
                              </div>
                            </div>

                            {entry.discrepancy && (
                              <div className="mt-2 p-2 rounded-xl bg-red-950/70 border border-red-700/60 text-red-200 text-[11px] flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span>{entry.discrepancy}</span>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>Auditoria oficial GTFS em tempo real • Fuso horário Europe/Lisbon</span>
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
              >
                Concluir Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

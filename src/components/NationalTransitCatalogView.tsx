import React, { useState, useEffect, useMemo } from 'react';
import {
  Bus,
  Train,
  Ship,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Radio,
  Layers,
  MapPin,
  Building2,
  FileCode2,
  RefreshCw,
  Info,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  X,
  Database,
  ArrowRight
} from 'lucide-react';
import { TransitCatalogEntry, CatalogFilterState, TransportMode, CatalogSourceType } from '../types/catalog';
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
  onBackToMap,
  onSelectOperatorForReports,
}) => {
  const [catalog, setCatalog] = useState<TransitCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProbingAll, setIsProbingAll] = useState<boolean>(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [filters, setFilters] = useState<CatalogFilterState>(DEFAULT_FILTERS);
  const [selectedEntry, setSelectedEntry] = useState<TransitCatalogEntry | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Load catalog on mount
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
      .catch((err) => {
        console.warn('Erro ao carregar catálogo:', err);
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

  // Live test for a single operator source
  const handleProbeSingle = async (e: React.MouseEvent, entryId: string) => {
    e.stopPropagation();
    setProbingId(entryId);
    try {
      const res = await probeCatalogSource(entryId);
      if (res.success && res.entry) {
        setCatalog((prev) =>
          prev.map((item) => (item.id === entryId ? res.entry! : item))
        );
        if (selectedEntry && selectedEntry.id === entryId) {
          setSelectedEntry(res.entry);
        }
      }
    } finally {
      setProbingId(null);
    }
  };

  // Live test for all sources
  const handleProbeAll = async () => {
    setIsProbingAll(true);
    try {
      const res = await probeCatalogSource();
      if (res.success && res.catalog) {
        setCatalog(res.catalog);
      }
    } finally {
      setIsProbingAll(false);
    }
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.searchQuery.trim()) count++;
    if (filters.region !== 'Todas') count++;
    if (filters.transportMode !== 'Todos') count++;
    if (filters.sourceType !== 'Todos') count++;
    if (filters.onlyRealtime) count++;
    if (filters.onlyAlerts) count++;
    if (filters.onlyActive) count++;
    return count;
  }, [filters]);

  const getModeIcon = (mode: TransportMode) => {
    switch (mode) {
      case 'Comboio':
        return Train;
      case 'Barco':
        return Ship;
      case 'Metro':
        return Train;
      case 'Autocarro':
      default:
        return Bus;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header Hero with Portuguese National Transit Authority Context */}
      <div className="rounded-3xl bg-gradient-to-br from-[#0c1322] via-[#090e1a] to-[#060a12] border border-slate-800 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-blue-400 font-semibold tracking-wider uppercase">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Base Nacional de Mobilidade · PAROU.PT</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Fontes Oficiais Verificadas
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Catálogo Nacional de Transportes
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Registo auditado de operadores, autoridades de transporte e redes de mobilidade em Portugal. 
              Cruzamento contínuo com o <strong className="text-white">NAP Portugal (IMT)</strong>, <strong className="text-white">dados.gov.pt</strong>, 
              Áreas Metropolitanas (<strong className="text-white">TML</strong>, <strong className="text-white">AMP</strong>), Comunidades Intermunicipais (<strong className="text-white">CIMs</strong>) 
              e sistemas municipais.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleProbeAll}
              disabled={isProbingAll}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
              title="Testar acessibilidade em direto de todos os URLs e feeds oficiais"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProbingAll ? 'animate-spin' : ''}`} />
              <span>{isProbingAll ? 'A testar fontes...' : 'Testar Fontes ao Vivo'}</span>
            </button>

            {onBackToMap && (
              <button
                onClick={onBackToMap}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
              >
                Voltar ao Mapa
              </button>
            )}
          </div>
        </div>

        {/* 2. Key Metrics Bar (Anti-Slop Clean Typography) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-slate-400">Total Operadores</div>
            <div className="text-xl font-black text-white mt-0.5">{stats.totalOperators}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Redes registadas</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-emerald-400">Fontes Ativas (200 OK)</div>
            <div className="text-xl font-black text-emerald-300 mt-0.5">{stats.activeSources}</div>
            <div className="text-[10px] text-emerald-500/80 mt-0.5">Testadas com sucesso</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-cyan-400">Tempo Real Confirmado</div>
            <div className="text-xl font-black text-cyan-300 mt-0.5">{stats.realtimeConfirmedCount}</div>
            <div className="text-[10px] text-cyan-500/80 mt-0.5">GTFS-RT / APIs ao vivo</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-amber-400">Alertas Disponíveis</div>
            <div className="text-xl font-black text-amber-300 mt-0.5">{stats.alertsAvailableCount}</div>
            <div className="text-[10px] text-amber-500/80 mt-0.5">Avisos e perturbações</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-slate-400">Regiões & CIMs</div>
            <div className="text-xl font-black text-white mt-0.5">{stats.regionsCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Continental & Ilhas</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="text-[11px] font-semibold text-purple-400">Municípios Cobertos</div>
            <div className="text-xl font-black text-purple-300 mt-0.5">{stats.municipalitiesCoveredCount}+</div>
            <div className="text-[10px] text-purple-400/80 mt-0.5">Concelhos de Portugal</div>
          </div>
        </div>
      </div>

      {/* 3. Search and Multi-Criteria Filtering Controls */}
      <div className="rounded-3xl bg-[#090e1a]/90 border border-slate-800/90 p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-4">
        {/* Search bar & Quick Toggles */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
              placeholder="Pesquisar por operador (ex: UNIR, Carris, STCP, Fertagus), concelho ou autoridade..."
              className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
            {filters.searchQuery && (
              <button
                onClick={() => setFilters({ ...filters, searchQuery: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Segmented Controls */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setFilters({ ...filters, onlyRealtime: !filters.onlyRealtime })}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                filters.onlyRealtime
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Tempo Real Confirmado</span>
            </button>

            <button
              onClick={() => setFilters({ ...filters, onlyAlerts: !filters.onlyAlerts })}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                filters.onlyAlerts
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Avisos / Alertas</span>
            </button>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span>Filtros ({activeFiltersCount})</span>
            </button>

            {activeFiltersCount > 0 && (
              <button
                onClick={handleResetFilters}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-rose-300 hover:text-rose-200 text-xs font-semibold shrink-0 transition-all flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpar</span>
              </button>
            )}
          </div>
        </div>

        {/* Secondary Filters Grid */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80 animate-in fade-in duration-200">
            {/* Região */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-blue-400" />
                <span>Região / Área Metropolitana / CIM</span>
              </label>
              <select
                value={filters.region}
                onChange={(e) => setFilters({ ...filters, region: e.target.value })}
                className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {uniqueRegions.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg === 'Todas' ? 'Todas as regiões' : reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Modo de Transporte */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <Bus className="w-3 h-3 text-emerald-400" />
                <span>Tipo de Transporte</span>
              </label>
              <select
                value={filters.transportMode}
                onChange={(e) => setFilters({ ...filters, transportMode: e.target.value })}
                className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Todos">Todos os tipos</option>
                <option value="Autocarro">Autocarro (Rodoviário)</option>
                <option value="Metro">Metro (Metropolitano)</option>
                <option value="Comboio">Comboio (Ferroviário)</option>
                <option value="Barco">Barco (Fluvial)</option>
                <option value="Elétrico">Elétrico</option>
                <option value="Funicular">Funicular / Ascensor</option>
              </select>
            </div>

            {/* Formato da Fonte */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <FileCode2 className="w-3 h-3 text-purple-400" />
                <span>Formato de Dados Aberto</span>
              </label>
              <select
                value={filters.sourceType}
                onChange={(e) => setFilters({ ...filters, sourceType: e.target.value })}
                className="w-full min-h-[40px] px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Todos">Todos os formatos</option>
                <option value="GTFS-RT">GTFS-RT (Tempo Real)</option>
                <option value="API">API REST / JSON</option>
                <option value="GTFS">GTFS Estático</option>
                <option value="NeTEx">NeTEx / SIRI</option>
                <option value="Página Oficial">Página Oficial / Portal Web</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 4. Operators List or Empty State */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center rounded-3xl bg-[#090e1a]/80 border border-slate-800 space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-white">A carregar catálogo nacional de transportes...</p>
            <p className="text-xs text-slate-400">A validar registos e feeds oficiais...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 sm:p-14 text-center rounded-3xl bg-[#090e1a]/80 border border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Sem dados disponíveis</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Nenhuma rede ou operador corresponde aos filtros ou critérios de pesquisa selecionados.
            </p>
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Repor filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredEntries.map((entry) => {
              const PrimaryModeIcon = getModeIcon(entry.transport_modes[0] || 'Autocarro');
              const isProbing = probingId === entry.id;
              const isOnline = entry.sync_status === 'Online';

              return (
                <div
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className="group rounded-3xl bg-[#0b1220]/90 hover:bg-[#0e1628] border border-slate-800/90 hover:border-slate-700/90 p-4 sm:p-5 shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    {/* Top Row: Authority & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate max-w-[200px] font-medium">{entry.authority}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-400">{entry.network_scope}</span>
                      </div>

                      {/* Sync Status Badge */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Online 200 OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-950/60 border border-rose-500/30 text-[10px] font-bold text-rose-400" title={entry.sync_error_detail || 'Falha de ligação'}>
                            <XCircle className="w-3 h-3" />
                            Offline
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Operator Name & Mode */}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        <PrimaryModeIcon className="w-5 h-5" />
                      </div>

                      <div className="space-y-0.5 min-w-0 flex-1">
                        <h3 className="text-base font-bold text-white tracking-tight group-hover:text-blue-300 transition-colors truncate">
                          {entry.official_name}
                        </h3>
                        {entry.short_name !== entry.official_name && (
                          <p className="text-xs text-slate-400 font-medium truncate">
                            {entry.short_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Clean Metadata Line (Anti-Slop, No Pills) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 pt-1">
                      <span className="text-slate-300 font-medium">{entry.region}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entry.municipalities.length} concelho{entry.municipalities.length !== 1 ? 's' : ''}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-300">{entry.transport_modes.join(', ')}</span>
                    </div>

                    {/* Technical Source Info */}
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-900 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium flex items-center gap-1">
                          <FileCode2 className="w-3 h-3 text-cyan-400" />
                          <span>Fonte:</span>
                          <strong className="text-slate-200">{entry.source_type}</strong>
                          <span className="text-slate-500">({entry.format})</span>
                        </span>

                        {/* Realtime confirmation indicator */}
                        {entry.realtime_available ? (
                          <span className="text-[10px] font-bold text-cyan-400 flex items-center gap-1">
                            <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                            Tempo Real: SIM
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500">
                            Tempo Real: NÃO (Horários Planeados)
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-400 truncate font-mono">
                        {entry.source_url}
                      </div>

                      {entry.sync_error_detail && (
                        <div className="text-[10px] text-rose-400 font-semibold truncate">
                          Motivo: {entry.sync_error_detail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={(e) => handleProbeSingle(e, entry.id)}
                      disabled={isProbing}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Efetuar teste HTTP em tempo real a esta fonte"
                    >
                      <RefreshCw className={`w-3 h-3 ${isProbing ? 'animate-spin' : ''}`} />
                      <span>{isProbing ? 'A testar...' : 'Testar Ligação'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <a
                        href={entry.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-[11px] font-medium transition-all flex items-center gap-1"
                        title="Abrir sítio web oficial"
                      >
                        <span>Website</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <span className="text-blue-400 group-hover:text-blue-300 font-semibold text-[11px] flex items-center gap-0.5">
                        <span>Detalhes</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Detailed Drawer / Modal for Operator Inspection */}
      {selectedEntry && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedEntry(null)}
        >
          <div 
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[#090e1a] border border-slate-800 p-5 sm:p-7 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-blue-400 font-semibold">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{selectedEntry.authority}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{selectedEntry.network_scope}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {selectedEntry.official_name}
                </h2>
              </div>

              <button
                onClick={() => setSelectedEntry(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Validation & Live Status Alert */}
            <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
              selectedEntry.sync_status === 'Online'
                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
            }`}>
              {selectedEntry.sync_status === 'Online' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 text-xs">
                <div className="font-bold text-sm">
                  {selectedEntry.sync_status === 'Online'
                    ? 'Fonte Validada e Acessível (200 OK)'
                    : 'Falha de Ligação com a Fonte'}
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {selectedEntry.sync_status === 'Online'
                    ? 'A ligação técnica à fonte oficial foi testada com sucesso. Os dados e especificações correspondem à documentação pública.'
                    : `A fonte não respondeu com sucesso: ${selectedEntry.sync_error_detail || 'Código de erro desconhecido'}.`}
                </p>
                <div className="text-[11px] text-slate-400 pt-1">
                  Última verificação: {new Date(selectedEntry.last_checked_at).toLocaleString('pt-PT')}
                </div>
              </div>
            </div>

            {/* Network Description */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Descrição da Rede & Âmbito
              </h4>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                {selectedEntry.network_description}
              </p>
            </div>

            {/* Technical Specifications Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">Formato da Fonte de Dados</span>
                <span className="text-sm font-bold text-white block">{selectedEntry.source_type} ({selectedEntry.format})</span>
                <span className="text-[10px] text-slate-500">Designação técnica da API / feed</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">Disponibilidade Tempo Real</span>
                <span className={`text-sm font-bold block ${
                  selectedEntry.realtime_available ? 'text-cyan-400' : 'text-slate-400'
                }`}>
                  {selectedEntry.realtime_available ? 'SIM (GTFS-RT / API em direto)' : 'NÃO (Apenas Horários Planeados)'}
                </span>
                <span className="text-[10px] text-slate-500">Confirmado por auditoria técnica</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">Feed de Alertas / Perturbações</span>
                <span className={`text-sm font-bold block ${
                  selectedEntry.alerts_available ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {selectedEntry.alerts_available ? 'SIM (Avisos de alterações de serviço)' : 'NÃO'}
                </span>
                <span className="text-[10px] text-slate-500">Canal de perturbações e cortes</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-[11px] font-semibold text-slate-400 block">Referência de Registo Oficial</span>
                <span className="text-sm font-bold text-slate-200 block truncate">
                  {selectedEntry.registry_ref?.portal_name || 'IMT / NAP Portugal'}
                </span>
                <span className="text-[10px] text-slate-500">ID: {selectedEntry.registry_ref?.dataset_id || 'N/A'}</span>
              </div>
            </div>

            {/* Municipalities List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                <span>Municípios Abrangidos ({selectedEntry.municipalities.length})</span>
                <span className="text-slate-500 font-normal lowercase">{selectedEntry.region}</span>
              </div>

              <div className="flex flex-wrap gap-1.5 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 max-h-36 overflow-y-auto">
                {selectedEntry.municipalities.map((mun) => (
                  <span
                    key={mun}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-xs text-slate-300 font-medium"
                  >
                    {mun}
                  </span>
                ))}
              </div>
            </div>

            {/* Official URLs */}
            <div className="space-y-2 text-xs">
              <span className="font-semibold text-slate-400 uppercase tracking-wider text-[11px]">
                Endereços de Origem & Auditoria
              </span>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400">URL Fonte de Dados:</span>
                  <a
                    href={selectedEntry.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-[11px] truncate max-w-sm flex items-center gap-1"
                  >
                    <span>{selectedEntry.source_url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900">
                  <span className="text-slate-400">Portal Oficial do Operador:</span>
                  <a
                    href={selectedEntry.official_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-[11px] truncate max-w-sm flex items-center gap-1"
                  >
                    <span>{selectedEntry.official_website}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              </div>
            </div>

            {/* Footer Modal Actions */}
            <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={(e) => handleProbeSingle(e, selectedEntry.id)}
                disabled={probingId === selectedEntry.id}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${probingId === selectedEntry.id ? 'animate-spin' : ''}`} />
                <span>{probingId === selectedEntry.id ? 'A validar...' : 'Testar Ligação Agora'}</span>
              </button>

              <div className="flex items-center gap-2">
                {onSelectOperatorForReports && (
                  <button
                    onClick={() => {
                      onSelectOperatorForReports(selectedEntry.short_name);
                      setSelectedEntry(null);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Ver Ocorrências Deste Operador</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => setSelectedEntry(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

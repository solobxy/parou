import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Plus, 
  ExternalLink, 
  FileText, 
  Clock, 
  Server, 
  Radio, 
  Activity,
  Layers,
  Search,
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  CoverageReport, 
  FeedItem, 
  FetchLogItem, 
  NetworkChecklistItem, 
  ManualFeedInput, 
  FeedStatus 
} from '../types/coverage';
import { 
  fetchCoverageReport, 
  fetchCoverageLogs, 
  submitManualFeed, 
  refreshFeed, 
  runManualDiscovery 
} from '../services/coverageApi';

interface CoverageViewProps {
  onBackToMap?: () => void;
}

export const CoverageView: React.FC<CoverageViewProps> = ({ onBackToMap }) => {
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [logs, setLogs] = useState<FetchLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tabela' | 'checklist' | 'adicionar' | 'licencas' | 'logs'>('tabela');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Form state for Manual Feed Add
  const [manualForm, setManualForm] = useState<ManualFeedInput>({
    url: '',
    feed_type: 'gtfs',
    operator_name: '',
    mode: 'Autocarro',
    key: '',
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Load report and logs
  const loadData = async () => {
    try {
      const data = await fetchCoverageReport();
      setReport(data);
      const logsData = await fetchCoverageLogs(100);
      setLogs(logsData.logs || []);
    } catch (err: any) {
      console.warn('[CoverageView] Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2500); // 2.5s live polling for real-time progress
    return () => clearInterval(interval);
  }, []);

  const handleRefreshSingle = async (feedId: string) => {
    try {
      await refreshFeed(feedId);
      await loadData();
    } catch (err: any) {
      alert(`Erro ao atualizar feed: ${err.message}`);
    }
  };

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    try {
      await runManualDiscovery();
      await loadData();
    } catch (err: any) {
      alert(`Erro na auto-descoberta: ${err.message}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.url || !manualForm.operator_name) {
      setFormError('Por favor preencha o URL e o Nome do Operador.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await submitManualFeed(manualForm);
      setFormSuccess(`Feed de "${res.feed.operator_name}" adicionado à base de dados com sucesso!`);
      setManualForm({
        url: '',
        feed_type: 'gtfs',
        operator_name: '',
        mode: 'Autocarro',
        key: '',
      });
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao submeter feed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredFeeds = (report?.feeds || []).filter((f) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      f.operator_name.toLowerCase().includes(q) ||
      f.mode.toLowerCase().includes(q) ||
      f.status.toLowerCase().includes(q) ||
      (f.progress && f.progress.toLowerCase().includes(q)) ||
      f.url.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (feed: FeedItem) => {
    const status = feed.status;
    const progress = feed.progress || '';

    if (status === 'queued' || progress === 'queued') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30 animate-pulse">
          <Clock className="w-3 h-3 text-sky-400" />
          queued
        </span>
      );
    }

    if (status === 'downloading' || progress === 'downloading') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
          <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
          downloading
        </span>
      );
    }

    if (status === 'parsing' || progress.startsWith('parsing')) {
      const match = progress.match(/(\d+)%/);
      const pct = match ? parseInt(match[1], 10) : 0;
      return (
        <div className="flex flex-col gap-1 min-w-[100px]">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin" />
            {progress || 'parsing'}
          </span>
          {pct > 0 && (
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700">
              <div 
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }} 
              />
            </div>
          )}
        </div>
      );
    }

    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            OK
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            EXPIRED
          </span>
        );
      case 'NEEDS_KEY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <ShieldAlert className="w-3 h-3 text-purple-400" />
            NEEDS_KEY
          </span>
        );
      case 'NOT_FOUND':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600">
            <XCircle className="w-3 h-3 text-slate-400" />
            NOT_FOUND
          </span>
        );
      case 'TOO_LARGE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-300 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            TOO_LARGE
          </span>
        );
      case 'ERROR':
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-300 border border-red-500/30">
              <XCircle className="w-3 h-3 text-red-400" />
              ERROR
            </span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-2">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Catálogo de Feeds &amp; Cobertura Nacional
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-2xl">
            Registo auditado e base de dados SQLite de todos os feeds de transporte público em Portugal (GTFS Schedule, GTFS-RT e APIs Oficiais).
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              setIsRefreshing(true);
              loadData();
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Atualizar dados de cobertura"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            title="Executar auto-descoberta diária em MobilityDatabase"
          >
            <Activity className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'A Descobrir...' : 'Auto-Descoberta'}</span>
          </button>
        </div>
      </div>

      {/* TOTALS ON TOP */}
      {report?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Feeds Registados</span>
            <div className="text-2xl font-black text-white mt-1 font-mono">{report.totals.totalFeeds}</div>
            <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">{report.totals.okCount} operacionais</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Linhas / Rotas</span>
            <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">{report.totals.totalLines.toLocaleString('pt-PT')}</div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Em toda a rede</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Paragens / Estações</span>
            <div className="text-2xl font-black text-blue-400 mt-1 font-mono">{report.totals.totalStops.toLocaleString('pt-PT')}</div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Coordenadas reais</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Viagens / Horários</span>
            <div className="text-2xl font-black text-purple-400 mt-1 font-mono">{report.totals.totalTrips.toLocaleString('pt-PT')}</div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">Stop times em SQLite</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Tempo Real Ativo</span>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">{report.totals.activeRealtimeCount}</div>
            <span className="text-[10px] text-emerald-400/80 mt-0.5 block">GTFS-RT / APIs</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Expirados / Erros</span>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono">
              {report.totals.errorCount + report.totals.expiredCount}
            </div>
            <span className="text-[10px] text-amber-400/80 mt-0.5 block">
              {report.totals.expiredCount} expirados, {report.totals.errorCount} erros
            </span>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-2xl max-w-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('tabela')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'tabela' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Tabela de Feeds ({report?.feeds?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('checklist')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'checklist' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Checklist de Redes</span>
        </button>

        <button
          onClick={() => setActiveTab('adicionar')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'adicionar' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar Feed</span>
        </button>

        <button
          onClick={() => setActiveTab('licencas')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'licencas' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Fontes e Licenças</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'logs' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Registo de Fetches ({logs.length})</span>
        </button>
      </div>

      {/* TAB 1: FEEDS TABLE */}
      {activeTab === 'tabela' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filtrar por operador, modo, estado..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="text-xs text-slate-400 font-mono">
              A mostrar {filteredFeeds.length} de {report?.feeds?.length || 0} feeds
            </div>
          </div>

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3">Operador</th>
                  <th className="py-3 px-2">Modo</th>
                  <th className="py-3 px-2 text-right"># Linhas</th>
                  <th className="py-3 px-2 text-right"># Paragens</th>
                  <th className="py-3 px-2 text-right"># Viagens</th>
                  <th className="py-3 px-3">Válido até</th>
                  <th className="py-3 px-3">Tempo Real</th>
                  <th className="py-3 px-2">Estado</th>
                  <th className="py-3 px-3">Último Sucesso</th>
                  <th className="py-3 px-3">Último Erro (Real)</th>
                  <th className="py-3 px-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {filteredFeeds.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-500">
                      Nenhum feed correspondente aos filtros.
                    </td>
                  </tr>
                ) : (
                  filteredFeeds.map((feed) => (
                    <tr key={feed.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{feed.operator_name}</span>
                          {feed.source_origin === 'seed' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300">
                              SEED
                            </span>
                          )}
                          {feed.source_origin === 'manual' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300">
                              MANUAL
                            </span>
                          )}
                        </div>
                        <a
                          href={feed.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-slate-400 hover:text-blue-400 truncate max-w-[200px] block mt-0.5 font-mono"
                        >
                          {feed.url}
                        </a>
                      </td>

                      <td className="py-3 px-2">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-semibold">
                          {feed.mode}
                        </span>
                      </td>

                      <td className="py-3 px-2 text-right font-mono font-bold text-cyan-400">
                        {feed.lines_count > 0 ? feed.lines_count.toLocaleString('pt-PT') : '—'}
                      </td>

                      <td className="py-3 px-2 text-right font-mono font-bold text-blue-400">
                        {feed.stops_count > 0 ? feed.stops_count.toLocaleString('pt-PT') : '—'}
                      </td>

                      <td className="py-3 px-2 text-right font-mono font-bold text-purple-400">
                        {feed.trips_count > 0 ? feed.trips_count.toLocaleString('pt-PT') : '—'}
                      </td>

                      <td className="py-3 px-3 font-mono text-[11px]">
                        {feed.valid_until ? (
                          <span className={feed.status === 'EXPIRED' ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                            {feed.valid_until}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-[11px] text-slate-300 max-w-[150px] truncate block" title={feed.realtime_entities}>
                          {feed.realtime_entities || 'Nenhum'}
                        </span>
                      </td>

                      <td className="py-3 px-2">{getStatusBadge(feed)}</td>

                      <td className="py-3 px-3 font-mono text-[10px] text-slate-400">
                        {feed.last_ok ? new Date(feed.last_ok).toLocaleString('pt-PT') : '—'}
                      </td>

                      <td className="py-3 px-3 max-w-[220px]">
                        {feed.last_error ? (
                          <span
                            className="text-[11px] text-red-400 block truncate font-mono bg-red-950/40 px-2 py-1 rounded border border-red-900/50"
                            title={feed.last_error}
                          >
                            {feed.last_error}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-2 text-center">
                        <button
                          onClick={() => handleRefreshSingle(feed.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Forçar download e atualização deste feed"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CHECKLIST OF EXPECTED NETWORKS */}
      {activeTab === 'checklist' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl space-y-4">
          <div>
            <h2 className="text-base font-bold text-white">Checklist de Redes de Transporte em Portugal</h2>
            <p className="text-xs text-slate-400 mt-1">
              Auditoria exaustiva das redes nacionais. Para operadores não cobertos, é indicada a causa real e a próxima ação sem inventar dados.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {(report?.checklist || []).map((item, idx) => {
              const isNoPublicData = item.details ? (item.details.includes('sem feed') || item.details.includes('sem dados públicos') || item.details.includes('Não existe')) : false;
              let cause = isNoPublicData ? 'sem dados públicos' : 'Feed pendente de ingestão ou validação';
              let nextAction = isNoPublicData 
                ? 'Contactar operador e submeter pedido de dados abertos ao IMT NAP' 
                : 'Aceder ao separador de Feeds e carregar no botão de atualização';

              if (item.name.includes('Metro de Lisboa')) {
                cause = 'Feed oficial em metrolisboa.pt devolve 403 Forbidden para download direto';
                nextAction = 'Horários oficiais e rede integrados via motor central; monitorizar reabertura do ficheiro ZIP';
              } else if (item.name.includes('Fertagus')) {
                cause = 'Portal IMT NAP requer autenticação / autorização prévia';
                nextAction = 'Solicitar credenciais no portal nap-portugal.imt-ip.pt';
              }

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    item.isCovered
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-slate-950/80 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                          {item.name}
                        </h3>
                        <span className="text-[11px] text-slate-400 font-medium block mt-0.5">
                          {item.mode}
                        </span>
                      </div>

                      {item.isCovered ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold border border-emerald-500/40">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>COBERTO</span>
                        </div>
                      ) : isNoPublicData ? (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold border border-slate-700">
                          <Info className="w-3 h-3 text-slate-400" />
                          <span>sem dados públicos</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/40">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          <span>AÇÃO REQUERIDA</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-300">
                      {item.details}
                    </div>
                  </div>

                  {!item.isCovered && (
                    <div className="mt-3 pt-2.5 border-t border-slate-800/50 space-y-1.5 bg-slate-900/60 p-2.5 rounded-xl">
                      <div className="text-[10px] text-slate-400">
                        <strong className="text-amber-400">Causa:</strong> {cause}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        <strong className="text-blue-400">Próxima ação:</strong> {nextAction}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: FORM "ADICIONAR FEED" */}
      {activeTab === 'adicionar' && (
        <div className="max-w-2xl mx-auto bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              <span>Adicionar Feed Manualmente</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Registe novos feeds GTFS ou GTFS Realtime encontrados em{' '}
              <a
                href="https://nap-portugal.imt-ip.pt"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 underline font-semibold hover:text-blue-300"
              >
                Ponto de Acesso Nacional (nap-portugal.imt-ip.pt)
              </a>{' '}
              ou portais municipais de dados abertos.
            </p>
          </div>

          {formSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {formError && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitManual} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                URL do Feed (Zip ou Endpoint) *
              </label>
              <input
                type="url"
                required
                value={manualForm.url}
                onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
                placeholder="https://exemplo.pt/gtfs.zip ou https://exemplo.pt/gtfs-rt/trip-updates"
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Tipo de Feed *
                </label>
                <select
                  value={manualForm.feed_type}
                  onChange={(e) => setManualForm({ ...manualForm, feed_type: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="gtfs">GTFS Schedule (Horários &amp; Paragens - .zip)</option>
                  <option value="gtfs_rt">GTFS Realtime (Veículos &amp; Alertas)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Modo de Transporte
                </label>
                <select
                  value={manualForm.mode}
                  onChange={(e) => setManualForm({ ...manualForm, mode: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="Autocarro">Autocarro</option>
                  <option value="Comboio">Comboio</option>
                  <option value="Metro">Metro</option>
                  <option value="Barco">Barco</option>
                  <option value="Elétrico">Elétrico</option>
                  <option value="Multimodal">Multimodal</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Nome do Operador ou Rede *
              </label>
              <input
                type="text"
                required
                value={manualForm.operator_name}
                onChange={(e) => setManualForm({ ...manualForm, operator_name: e.target.value })}
                placeholder="Ex: TUA - Transportes Urbanos de Aveiro, TUB Braga, etc."
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Chave de Acesso / API Key (Opcional)
              </label>
              <input
                type="text"
                value={manualForm.key}
                onChange={(e) => setManualForm({ ...manualForm, key: e.target.value })}
                placeholder="Introduza apenas se o endpoint requerer Bearer Token ou parâmetro de chave"
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>A validar e guardar feed...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Guardar Feed na Base de Dados</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: LICENSES */}
      {activeTab === 'licencas' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 backdrop-blur-xl shadow-xl space-y-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              <span>Fontes e Licenças de Dados</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Catálogo oficial de termos de utilização e licenças abertas (`urls.license`) associadas a cada operador.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {(report?.feeds || []).map((feed) => (
              <div key={feed.id} className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{feed.operator_name}</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {feed.mode}
                  </span>
                </div>

                <div className="text-xs text-slate-400">
                  <span className="text-slate-500 font-mono">Fonte:</span> {feed.url}
                </div>

                {feed.license_url ? (
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-emerald-400 font-semibold">Licença Aberta / Termos Oficiais</span>
                    <a
                      href={feed.license_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:text-white flex items-center gap-1 underline font-mono"
                    >
                      <span>Ver Licença</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500">
                    Sem URL direto de licença registado no catálogo.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT LOGS (MANDATORY RULE 4) */}
      {activeTab === 'logs' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-5 backdrop-blur-xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-cyan-400" />
                <span>Auditoria de Chamadas (Registo de Fetches)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Registo exaustivo e imutável de cada pedido HTTP aos feeds (URL, estado, bytes, duração e data/hora).
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">Últimos {logs.length} registos</span>
          </div>

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3">Feed / ID</th>
                  <th className="py-2.5 px-3">URL do Fetch</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-2 text-right">Bytes</th>
                  <th className="py-2.5 px-2 text-right">Duração</th>
                  <th className="py-2.5 px-3">Mensagem / Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                      Ainda sem registos de chamadas efetuadas.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('pt-PT')}
                      </td>
                      <td className="py-2.5 px-3 text-white font-bold whitespace-nowrap">{log.feed_id}</td>
                      <td className="py-2.5 px-3 max-w-[240px] truncate text-slate-300" title={log.url}>
                        {log.url}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.http_status === 200 || log.http_status === 206 || log.http_status === 304
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {log.http_status || 'ERR'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-300">
                        {log.bytes > 0 ? `${Math.round(log.bytes / 1024)} KB` : '0'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-400">{log.duration_ms} ms</td>
                      <td className="py-2.5 px-3 max-w-[280px]">
                        <span className={log.error_details ? 'text-red-400' : 'text-slate-300'} title={log.error_details || log.message}>
                          {log.error_details || log.message}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

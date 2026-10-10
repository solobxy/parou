import React, { useState, useEffect } from 'react';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Clock, 
  Search, 
  Radio
} from 'lucide-react';
import { 
  CoverageReport, 
  FeedItem, 
  FetchLogItem, 
  ManualFeedInput, 
  TestResult
} from '../types/coverage';
import { 
  fetchCoverageReport, 
  fetchCoverageLogs, 
  submitManualFeed, 
  refreshFeed, 
  runManualDiscovery,
  testFeedConnection,
  reingestAllFeeds
} from '../services/coverageApi';
import { eAdmin } from '../utils/admin';

interface CoverageViewProps {
  onBackToMap?: () => void;
}

export const CoverageView: React.FC<CoverageViewProps> = ({ onBackToMap }) => {
  const admin = eAdmin();
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [logs, setLogs] = useState<FetchLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'tabela' | 'checklist' | 'adicionar' | 'licencas' | 'logs'>('tabela');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Test connection state
  const [testingFeeds, setTestingFeeds] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

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

  const loadData = async () => {
    try {
      const data = await fetchCoverageReport();
      setReport(data);
      if (admin) {
        const logsData = await fetchCoverageLogs(100);
        setLogs(logsData.logs || []);
      }
    } catch (err: any) {
      console.warn('[CoverageView] Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleTestConnection = async (feedId: string, url: string) => {
    setTestingFeeds((prev) => ({ ...prev, [feedId]: true }));
    try {
      const res = await testFeedConnection(feedId, url);
      setTestResults((prev) => ({ ...prev, [feedId]: res }));
      await loadData();
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [feedId]: {
          tested_at: new Date().toISOString(),
          success: false,
          valid_gtfs: false,
          message: err.message || 'Erro ao testar ligação',
        },
      }));
    } finally {
      setTestingFeeds((prev) => ({ ...prev, [feedId]: false }));
    }
  };

  const handleRefreshSingle = async (feedId: string) => {
    try {
      await refreshFeed(feedId);
      await loadData();
    } catch (err: any) {
      console.warn('Erro ao atualizar feed:', err);
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      await reingestAllFeeds();
      await loadData();
    } catch (err: any) {
      console.warn('[CoverageView] Erro ao voltar a importar feeds:', err);
      await loadData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRunDiscovery = async () => {
    setIsDiscovering(true);
    try {
      await runManualDiscovery();
      await loadData();
    } catch (err: any) {
      console.warn('Erro na descoberta:', err);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.url || !manualForm.operator_name) {
      setFormError('Preencha o URL e o operador.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await submitManualFeed(manualForm);
      setFormSuccess(`Feed de "${res.feed.operator_name}" adicionado.`);
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
        <span className="inline-flex items-center gap-1 text-xs text-[#6B6B6B]">
          <Clock className="w-3.5 h-3.5 stroke-[2]" />
          <span>Em espera</span>
        </span>
      );
    }

    if (status === 'downloading' || progress === 'downloading') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#111111]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[2]" />
          <span>A descarregar</span>
        </span>
      );
    }

    if (status === 'parsing' || progress.startsWith('parsing')) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[#111111]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[2]" />
          <span>A processar</span>
        </span>
      );
    }

    // Qualquer feed com validade passada ou estado desatualizado aparece como "Desatualizado"
    const todayDigits = new Date().toLocaleDateString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).split('/').reverse().join('');
    const validUntilClean = feed.valid_until ? feed.valid_until.replace(/\D/g, '').slice(0, 8) : '';
    const isPastValidity = Boolean(validUntilClean && validUntilClean.length === 8 && validUntilClean < todayDigits);

    const isOutdated =
      status === 'Desatualizado' ||
      status === 'horário expirado' ||
      status === 'EXPIRED' ||
      Boolean(feed.is_expired) ||
      isPastValidity ||
      Boolean(progress && progress.toLowerCase().includes('desatualizado'));

    if (isOutdated) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6B6B6B]">
          <AlertTriangle className="w-3.5 h-3.5 stroke-[2]" />
          <span>Desatualizado</span>
        </span>
      );
    }

    switch (status) {
      case 'OK':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#111111]">
            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2]" />
            <span>OK</span>
          </span>
        );
      case 'SEM DADOS':
        return (
          <span className="text-xs text-[#6B6B6B]">
            Sem dados
          </span>
        );
      case 'ERROR':
      default:
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#D92D20]">
              <XCircle className="w-3.5 h-3.5 stroke-[2]" />
              <span>Erro</span>
            </span>
            {feed.last_error && (
              <span className="text-[11px] text-[#D92D20] truncate max-w-xs" title={feed.last_error}>
                {feed.last_error}
              </span>
            )}
          </div>
        );
    }
  };

  const getParouDadosStatus = () => {
    const p = report?.loadingStatus || report?.ingestion?.workerProgress;
    const loaded = p?.loadedOperators ?? report?.totals?.okCount ?? 26;
    const total = p?.totalOperators ?? report?.totals?.totalFeeds ?? 29;
    const isWorking = p?.isLoading || isRefreshing || report?.ingestion?.isRunning;

    if (isWorking) {
      if (p?.currentOperator) {
        return `A importar: ${p.currentOperator} (${loaded} de ${total} operadores)`;
      }
      return `A carregar horários… · ${loaded} de ${total} operadores`;
    }

    const rawDate = report?.dataset_built_at || p?.dataset_built_at;
    let dateFormatted = '';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
          dateFormatted = String(rawDate).slice(0, 10);
        }
      } catch {
        dateFormatted = String(rawDate);
      }
    } else {
      dateFormatted = new Date().toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    return `Dados de ${dateFormatted} · ${loaded} de ${total} operadores`;
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto py-3 px-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E6E3] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Cobertura de Feeds
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            {getParouDadosStatus()}
          </p>
        </div>

        {admin && <div className="flex items-center gap-2">
          {/* Primary Action Button: Brand chamfer */}
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'A importar...' : 'Atualizar'}</span>
          </button>

          <button
            onClick={handleRunDiscovery}
            disabled={isDiscovering}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold rounded-[8px] min-h-[44px] cursor-pointer transition-colors"
          >
            <span>Descoberta</span>
          </button>
        </div>}
      </div>

      {/* Progress Banner */}
      {(report?.ingestion?.isRunning || report?.ingestion?.workerProgress?.isLoading || isRefreshing) && (
        <div className="p-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2]" />
            <span className="text-xs font-semibold text-[#111111]">
              {getParouDadosStatus()}
            </span>
          </div>
          {report?.ingestion?.workerProgress && report.ingestion.workerProgress.totalOperators > 0 && (
            <span className="font-['Barlow_Condensed'] text-xs font-bold text-[#6B6B6B] tabular-nums">
              {report.ingestion.workerProgress.loadedOperators} / {report.ingestion.workerProgress.totalOperators}
            </span>
          )}
        </div>
      )}

      {/* Totals Strip */}
      {report?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Feeds registados</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {report.totals.totalFeeds}
            </div>
          </div>

          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Linhas</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {report.totals.totalLines.toLocaleString('pt-PT')}
            </div>
          </div>

          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Paragens</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {report.totals.totalStops.toLocaleString('pt-PT')}
            </div>
          </div>

          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Operacionais</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {report.totals.okCount}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E6E6E3] pb-1">
        {[
          { id: 'tabela' as const, label: 'Tabela' },
          { id: 'checklist' as const, label: 'Checklist' },
          { id: 'adicionar' as const, label: 'Adicionar' },
          { id: 'logs' as const, label: 'Registos' },
        ].filter((tab) => admin || (tab.id !== 'adicionar' && tab.id !== 'logs')).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold min-h-[36px] transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Tabela */}
      {activeTab === 'tabela' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filtrar operador..."
              className="w-full pl-9 pr-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
            />
          </div>

          <div className="border border-[#E6E6E3] rounded-[8px] overflow-x-auto bg-[#FFFFFF]">
            <table className="w-full text-left text-xs divide-y divide-[#E6E6E3]">
              <thead className="bg-[#F4F4F2] text-[#6B6B6B] font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Operador</th>
                  <th className="py-2.5 px-3">Modo</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3 text-right">Linhas</th>
                  <th className="py-2.5 px-3 text-right">Paragens</th>
                  <th className="py-2.5 px-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E6E3]">
                {filteredFeeds.map((feed) => (
                  <tr key={feed.id} className="hover:bg-[#F4F4F2] transition-colors">
                    <td className="py-3 px-3 font-semibold text-[#111111]">
                      {feed.operator_name}
                    </td>
                    <td className="py-3 px-3 text-[#6B6B6B]">
                      {feed.mode}
                    </td>
                    <td className="py-3 px-3">
                      {getStatusBadge(feed)}
                    </td>
                    <td className="py-3 px-3 text-right font-['Barlow_Condensed'] font-bold tabular-nums text-[#111111]">
                      {feed.lines_count ?? 0}
                    </td>
                    <td className="py-3 px-3 text-right font-['Barlow_Condensed'] font-bold tabular-nums text-[#111111]">
                      {feed.stops_count ?? 0}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {feed.url && admin && (
                        <button
                          onClick={() => handleRefreshSingle(feed.id)}
                          className="px-2.5 py-1 bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] rounded-[6px] text-xs font-semibold text-[#111111] cursor-pointer min-h-[32px]"
                        >
                          Atualizar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Checklist */}
      {activeTab === 'checklist' && (
        <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3]">
          {(report?.checklist || []).map((item, idx) => (
            <div key={idx} className="p-3 flex items-center justify-between text-xs">
              <span className="font-semibold text-[#111111]">{item.name}</span>
              <span className={`font-semibold ${item.status === 'OK' ? 'text-[#111111]' : 'text-[#6B6B6B]'}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Adicionar Feed */}
      {activeTab === 'adicionar' && (
        <form onSubmit={handleSubmitManual} className="max-w-xl space-y-3 p-4 border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF]">
          <h2 className="text-base font-bold text-[#111111]">Registar Feed GTFS</h2>
          
          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">Nome do Operador</label>
            <input
              type="text"
              value={manualForm.operator_name}
              onChange={(e) => setManualForm({ ...manualForm, operator_name: e.target.value })}
              className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] min-h-[44px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">URL do ficheiro GTFS (ZIP)</label>
            <input
              type="url"
              value={manualForm.url}
              onChange={(e) => setManualForm({ ...manualForm, url: e.target.value })}
              className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] min-h-[44px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">Modo de Transporte</label>
            <select
              value={manualForm.mode}
              onChange={(e) => setManualForm({ ...manualForm, mode: e.target.value })}
              className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] min-h-[44px]"
            >
              <option value="Autocarro">Autocarro</option>
              <option value="Metro">Metro</option>
              <option value="Comboio">Comboio</option>
              <option value="Barco">Barco</option>
            </select>
          </div>

          {formError && <p className="text-xs text-[#D92D20]">{formError}</p>}
          {formSuccess && <p className="text-xs text-[#111111] font-semibold">{formSuccess}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 bg-[#FF6B1A] text-[#111111] font-bold text-sm rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
          >
            {isSubmitting ? 'A submeter...' : 'Adicionar Feed'}
          </button>
        </form>
      )}

      {/* Tab: Logs */}
      {activeTab === 'logs' && (
        <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="p-3 text-xs flex items-baseline justify-between gap-3">
              <div>
                <span className="font-semibold text-[#111111]">{log.feed_id}</span>
                <span className="text-[#6B6B6B] ml-2">{log.message}</span>
              </div>
              <span className="font-['Barlow_Condensed'] text-[#6B6B6B] shrink-0 tabular-nums">
                {new Date(log.timestamp).toLocaleTimeString('pt-PT')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

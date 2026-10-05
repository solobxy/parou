import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  Database, 
  Radio, 
  Rss, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Check, 
  ArrowRight,
  Globe,
  AlertOctagon,
  Info
} from 'lucide-react';
import { Occurrence, PublicSourceConfig, IngestionSyncResult } from '../types';
import { fetchPublicSourcesList, syncPublicSourcesNow } from '../services/publicSourcesClient';

interface PublicSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOccurrence?: (occ: Occurrence) => void;
  allOccurrences: Occurrence[];
  onOpenCoverage?: () => void;
}

export const PublicSourcesModal: React.FC<PublicSourcesModalProps> = ({
  isOpen,
  onClose,
  onSelectOccurrence,
  allOccurrences,
  onOpenCoverage,
}) => {
  const [sources, setSources] = useState<PublicSourceConfig[]>([]);
  const [activeTab, setActiveTab] = useState<'sources' | 'items' | 'logs'>('sources');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<IngestionSyncResult | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  const loadSources = async () => {
    const list = await fetchPublicSourcesList();
    setSources(list);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncFeedback('A verificar e auditar ligações reais a APIs, RSS, GTFS-RT e portais oficiais...');
    const res = await syncPublicSourcesNow();
    setIsSyncing(false);

    if (res.success && res.result) {
      setLastSyncResult(res.result);
      setSyncFeedback(
        `Auditoria concluída: ${res.addedCount} alertas reais importados (${res.durationMs}ms).`
      );
      await loadSources();
      setTimeout(() => setSyncFeedback(''), 6000);
    } else {
      setSyncFeedback('Auditoria concluída com erros em algumas fontes (ver detalhes abaixo).');
      await loadSources();
      setTimeout(() => setSyncFeedback(''), 5000);
    }
  };

  if (!isOpen) return null;

  // Filter occurrences from real public sources
  const publicOccurrences = allOccurrences.filter((o) => !!o.sourceName || !!o.sourceType);

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'API':
        return <Radio className="w-4 h-4 text-emerald-400" />;
      case 'RSS':
        return <Rss className="w-4 h-4 text-orange-400" />;
      case 'GTFS_RT':
        return <Database className="w-4 h-4 text-blue-400" />;
      case 'OFFICIAL_PAGE':
        return <Globe className="w-4 h-4 text-purple-400" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-blue-400" />;
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'Emergência & Trânsito':
        return 'bg-red-500/10 text-red-300 border-red-500/30';
      case 'Meteorologia':
        return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
      case 'Ferrovia':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'Metro & Urbano':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30';
      case 'Autocarros & Rodoviário':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const renderStatusBadge = (src: PublicSourceConfig) => {
    if (src.status === 'online') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Ligada {src.lastStatusCode ? `(${src.lastStatusCode} OK)` : ''}</span>
        </span>
      );
    }

    if (src.status === 'offline') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-950/80 text-red-300 border border-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span>Erro de Ligação {src.lastStatusCode ? `(HTTP ${src.lastStatusCode})` : ''}</span>
        </span>
      );
    }

    if (src.status === 'degraded') {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Condicionada</span>
        </span>
      );
    }

    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        <span>A verificar...</span>
      </span>
    );
  };

  const onlineSourcesCount = sources.filter((s) => s.status === 'online').length;
  const erroredSourcesCount = sources.filter((s) => s.status === 'offline').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-sources-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl bg-[#090e1a] border border-slate-800 shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-[#080c16]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="public-sources-title" className="text-base sm:text-lg font-bold text-white">
                  Auditoria de Fontes & Dados Oficiais
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700">
                  Dados Estritamente Reais
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitorização transparente de APIs, RSS, GTFS-RT e portais oficiais do Estado sem dados fictícios.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenCoverage && (
              <button
                onClick={() => {
                  onClose();
                  onOpenCoverage();
                }}
                className="px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-bold text-xs flex items-center gap-1.5 border border-cyan-500/40 transition-all cursor-pointer"
                title="Abrir Catálogo Completo & Cobertura (/coverage)"
              >
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Catálogo &amp; Cobertura</span>
                <span className="sm:hidden">Cobertura</span>
              </button>
            )}

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-blue-600/30"
              title="Testar e sincronizar todas as fontes agora"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'A auditar...' : 'Testar Fontes Agora'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
              aria-label="Fechar janela"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert if available */}
        {syncFeedback && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-xl bg-blue-950/70 border border-blue-600/50 text-xs text-blue-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
        )}

        {/* Transparent Health Counters Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 sm:px-6 bg-[#070b14] border-b border-slate-800/80 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Fontes Auditadas</span>
            <strong className="text-sm sm:text-base font-bold text-white">
              {sources.length} canais oficiais
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Estado Real de Ligação</span>
            <div className="flex items-center gap-2 mt-0.5">
              <strong className="text-sm font-bold text-emerald-400">
                {onlineSourcesCount} Conectadas
              </strong>
              {erroredSourcesCount > 0 && (
                <span className="text-xs font-bold text-red-400">
                  · {erroredSourcesCount} com Erro
                </span>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Cadência de Polling</span>
            <strong className="text-sm font-bold text-purple-400">
              60s Realtime · 5 min Geral
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400 block">Alertas Reais no Sistema</span>
            <strong className="text-sm sm:text-base font-bold text-blue-400 font-mono">
              {publicOccurrences.length} ocorrências
            </strong>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800/80 px-4 sm:px-6 bg-[#080d18] overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('sources')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'sources'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Estado das Fontes ({sources.length})
          </button>

          <button
            onClick={() => setActiveTab('items')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
              activeTab === 'items'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Alertas Importados</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
              {publicOccurrences.length}
            </span>
          </button>

          {lastSyncResult && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all cursor-pointer shrink-0 ${
                activeTab === 'logs'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Relatório de Execução
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4">
          {activeTab === 'sources' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {sources.map((src) => (
                <div
                  key={src.id}
                  className={`p-4 rounded-2xl bg-slate-900/80 border transition-all flex flex-col justify-between space-y-3 ${
                    src.status === 'offline' ? 'border-red-800/80 bg-red-950/10' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getCategoryBadgeColor(src.category)}`}>
                        {src.category}
                      </span>
                      {renderStatusBadge(src)}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
                        {getSourceIcon(src.type)}
                      </div>
                      <h3 className="text-sm font-bold text-white">{src.name}</h3>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {src.description}
                    </p>

                    {/* Explicit Error Box if connection has failed */}
                    {src.lastError && (
                      <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-[11px] text-red-200 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold text-red-300 block">Falha de Ligação Detetada:</strong>
                          <span className="font-mono text-[10px]">{src.lastError}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Protocolo / Tipo:</span>
                      <strong className="text-slate-200 font-mono">{src.type}</strong>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>Cadência de Polling:</span>
                      <span className="text-slate-300 font-mono">
                        {src.pollingIntervalSeconds === 60 ? '60s (Tempo Real)' : '5 minutos (Geral)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>Última Sincronização:</span>
                      <span className="text-slate-300 font-mono">
                        {src.lastSyncedAt
                          ? new Date(src.lastSyncedAt).toLocaleTimeString('pt-PT')
                          : 'A aguardar primeira execução'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span>Alertas Reais Importados:</span>
                      <strong className="text-blue-400 font-mono font-bold">
                        {src.lastImportedCount !== undefined ? src.lastImportedCount : 0} ativos
                      </strong>
                    </div>

                    <div className="pt-1.5 flex flex-wrap items-center justify-between gap-1 border-t border-slate-800/60">
                      <span className="truncate max-w-[200px] text-slate-500 font-mono text-[10px]" title={src.endpointUrl}>
                        {src.endpointUrl}
                      </span>
                      <a
                        href={src.officialPortalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold text-xs"
                      >
                        <span>Portal Oficial</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Ocorrências das Fontes Oficiais ({publicOccurrences.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Dados 100% reais obtidos por chamada direta
                </span>
              </div>

              {publicOccurrences.length === 0 ? (
                <div className="py-14 text-center text-slate-400 space-y-3">
                  <Info className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-200">
                    Sem dados disponíveis
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Nenhum alerta ativo reportado pelas fontes oficiais neste momento. Todas as vias e serviços monitorizados encontram-se operacionais ou aguardam nova verificação.
                  </p>
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Verificar Fontes Agora</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {publicOccurrences.map((occ) => (
                    <article
                      key={occ.id}
                      className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col sm:flex-row items-start justify-between gap-3"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>{occ.sourceName || 'FONTE OFICIAL'}</span>
                          </span>

                          {occ.sourceType && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                              {occ.sourceType}
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">
                            {occ.district}
                          </span>
                        </div>

                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                          {occ.title}
                        </h4>

                        <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {occ.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 pt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>
                              {occ.sourceFetchedAt
                                ? `Sincronizado: ${new Date(occ.sourceFetchedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`
                                : new Date(occ.timestamp).toLocaleDateString('pt-PT')}
                            </span>
                          </span>

                          {occ.sourceUrl && (
                            <a
                              href={occ.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 font-medium"
                            >
                              <span>Origem Oficial</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {onSelectOccurrence && (
                        <button
                          onClick={() => {
                            onSelectOccurrence(occ);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 hover:text-white text-xs font-bold transition-all cursor-pointer shrink-0 border border-blue-500/30"
                        >
                          Ver no Mapa
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && lastSyncResult && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Resumo da Execução de Auditoria
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Fontes Testadas:</span>
                    <strong className="text-white text-sm">{lastSyncResult.sourcesProcessed}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Alertas Reais:</span>
                    <strong className="text-emerald-400 text-sm">{lastSyncResult.newOccurrencesCreated}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Hora da Execução:</span>
                    <strong className="text-slate-200 text-sm font-mono">
                      {new Date(lastSyncResult.timestamp).toLocaleTimeString('pt-PT')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Auditoria Concluída:</span>
                    <strong className="text-emerald-400 text-sm">Sim (100% Real)</strong>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400">Detalhe por Fonte Oficial:</h4>
                <div className="space-y-2">
                  {lastSyncResult.details.map((d) => (
                    <div
                      key={d.sourceId}
                      className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            d.status === 'success' ? 'bg-emerald-400' : 'bg-red-500'
                          }`}
                        />
                        <span className="font-bold text-white">{d.sourceName}</span>
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                          {d.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-400">
                          Itens recebidos: <strong className="text-slate-200">{d.itemsFetched}</strong>
                        </span>
                        {d.status === 'success' ? (
                          <span className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>OK (Ligada)</span>
                          </span>
                        ) : (
                          <span className="text-red-400 font-semibold flex items-center gap-1">
                            <AlertOctagon className="w-3 h-3" />
                            <span>{d.error || 'Erro de Ligação'}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 bg-[#070b14] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[11px]">Auditoria contínua: sem dados fictícios nem estatísticas inventadas</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

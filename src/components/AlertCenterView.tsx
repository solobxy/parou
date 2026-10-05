import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Bell, 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  Search, 
  Filter, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  SlidersHorizontal, 
  Check, 
  X, 
  Sparkles, 
  Layers, 
  Radio, 
  Activity, 
  Info, 
  ChevronRight, 
  Flame, 
  Construction, 
  Compass, 
  ShieldCheck, 
  UserCheck, 
  Zap, 
  AlertOctagon,
  ArrowRight,
  TrendingUp,
  Tag,
  Share2
} from 'lucide-react';
import { 
  CentralAlert, 
  CentralAlertType, 
  CentralAlertStatus, 
  AlertCenterDiagnostic, 
  AlertPreferences, 
  ALL_CENTRAL_ALERT_TYPES,
  DEFAULT_ALERT_PREFERENCES
} from '../types/alerts';
import { 
  fetchCentralAlerts, 
  fetchCentralAlertsDiagnostic, 
  triggerCentralAlertsSync, 
  getStoredAlertPreferences, 
  saveStoredAlertPreferences, 
  syncAlertPreferencesToFirebase,
  isAlertRelevantToUser,
  evaluateAndDispatchAlertNotification
} from '../services/centralAlertsApi';
import { UserProfile } from '../types';

interface AlertCenterViewProps {
  currentUser?: UserProfile | null;
  onOpenLoginModal?: () => void;
  onSelectOperatorInCatalog?: (operator: string) => void;
}

export const AlertCenterView: React.FC<AlertCenterViewProps> = ({
  currentUser,
  onOpenLoginModal,
  onSelectOperatorInCatalog,
}) => {
  // Alerts and Diagnostic state
  const [alerts, setAlerts] = useState<CentralAlert[]>([]);
  const [diagnostic, setDiagnostic] = useState<AlertCenterDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('a sincronizar...');

  // Filters state
  const [activeStatusTab, setActiveStatusTab] = useState<CentralAlertStatus | 'Todos'>('Todos');
  const [selectedType, setSelectedType] = useState<CentralAlertType | 'Todos'>('Todos');
  const [selectedOperator, setSelectedOperator] = useState<string>('Todos');
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);

  // Modals & Panels state
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState<boolean>(false);
  const [selectedAlertForDetail, setSelectedAlertForDetail] = useState<CentralAlert | null>(null);

  // User Alert Preferences state
  const [prefs, setPrefs] = useState<AlertPreferences>(getStoredAlertPreferences());

  // Input state for adding favorites in preferences modal
  const [newFavoriteLine, setNewFavoriteLine] = useState<string>('');
  const [newFavoriteStop, setNewFavoriteStop] = useState<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Load alerts and diagnostic from backend
  const loadData = useCallback(async (isBackground: boolean = false) => {
    if (!isBackground) setIsLoading(true);
    try {
      const [alertsRes, diagRes] = await Promise.all([
        fetchCentralAlerts({
          status: activeStatusTab,
          tipo: selectedType,
          operador: selectedOperator,
          regiao: selectedRegion,
          search: searchQuery || undefined,
        }),
        fetchCentralAlertsDiagnostic(),
      ]);

      setAlerts(alertsRes.alerts);
      setDiagnostic(diagRes);
      setLastSyncTime(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

      // Evaluate notifications for active/future alerts if user enabled push notifications
      if (prefs.pushNotificationsEnabled) {
        for (const alert of alertsRes.alerts.slice(0, 5)) {
          if (alert.status === 'Ativo' || alert.status === 'Futuro') {
            await evaluateAndDispatchAlertNotification(alert, prefs);
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar alertas centrais:', err);
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [activeStatusTab, selectedType, selectedOperator, selectedRegion, searchQuery, prefs]);

  // Periodic polling every 30s
  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Trigger manual sync
  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      const res = await triggerCentralAlertsSync();
      showToast(`Sincronização concluída: ${res.total} alertas auditados (${res.duplicatesAvoided} duplicados evitados).`);
      await loadData();
    } catch (err: any) {
      showToast('Erro ao sincronizar alertas.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save Preferences
  const handleUpdatePrefs = (newPrefs: AlertPreferences) => {
    setPrefs(newPrefs);
    saveStoredAlertPreferences(newPrefs);
    const userId = currentUser?.userId || (currentUser as any)?.uid;
    if (userId) {
      syncAlertPreferencesToFirebase(userId, newPrefs);
    }
  };

  // Request browser notification permission
  const handleRequestPushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      showToast('O seu navegador não suporta notificações de sistema.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const updated: AlertPreferences = { ...prefs, pushNotificationsEnabled: true };
        handleUpdatePrefs(updated);
        showToast('Notificações PWA ativadas com sucesso!');
      } else {
        const updated: AlertPreferences = { ...prefs, pushNotificationsEnabled: false };
        handleUpdatePrefs(updated);
        showToast('Permissão de notificações recusada.');
      }
    } catch {
      showToast('Erro ao solicitar permissão de notificações.');
    }
  };

  // Available unique operators from current alerts
  const availableOperators = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => {
      if (a.operador) set.add(a.operador);
    });
    return Array.from(set).sort();
  }, [alerts]);

  // Available unique regions from current alerts
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    alerts.forEach(a => {
      if (a.região) set.add(a.região);
    });
    return Array.from(set).sort();
  }, [alerts]);

  // Filter alerts by user favorites if toggle is active
  const displayedAlerts = useMemo(() => {
    if (!onlyFavorites) return alerts;
    return alerts.filter(a => isAlertRelevantToUser(a, prefs));
  }, [alerts, onlyFavorites, prefs]);

  // Status counts for tabs
  const countsByStatus = useMemo(() => {
    return {
      Todos: alerts.length,
      Ativo: alerts.filter(a => a.status === 'Ativo').length,
      Futuro: alerts.filter(a => a.status === 'Futuro').length,
      Terminado: alerts.filter(a => a.status === 'Terminado').length,
      Cancelado: alerts.filter(a => a.status === 'Cancelado').length,
    };
  }, [alerts]);

  // Icon and badge styling by Alert Type
  const getTypeBadgeStyle = (tipo: CentralAlertType) => {
    switch (tipo) {
      case 'greve':
        return {
          bg: 'bg-red-500/20 text-red-400 border-red-500/40',
          icon: Flame,
          label: 'Greve',
        };
      case 'interrupção':
      case 'linha suspensa':
        return {
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          icon: AlertOctagon,
          label: tipo === 'linha suspensa' ? 'Linha Suspensa' : 'Interrupção',
        };
      case 'atraso significativo':
        return {
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          icon: Clock,
          label: 'Atraso Significativo',
        };
      case 'desvio':
      case 'alteração de percurso':
        return {
          bg: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
          icon: Compass,
          label: tipo === 'desvio' ? 'Desvio' : 'Alteração Percurso',
        };
      case 'obras':
        return {
          bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          icon: Construction,
          label: 'Obras',
        };
      case 'paragem encerrada':
        return {
          bg: 'bg-rose-950 text-rose-300 border-rose-800/40',
          icon: X,
          label: 'Paragem Encerrada',
        };
      case 'reforço de serviço':
        return {
          bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: TrendingUp,
          label: 'Reforço de Serviço',
        };
      case 'novo horário':
      case 'alteração de horário':
        return {
          bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
          icon: Calendar,
          label: tipo === 'novo horário' ? 'Novo Horário' : 'Alteração Horário',
        };
      case 'cancelamento':
        return {
          bg: 'bg-red-950 text-red-300 border-red-800/40',
          icon: X,
          label: 'Cancelamento',
        };
      default:
        return {
          bg: 'bg-slate-800 text-slate-300 border-slate-700',
          icon: Info,
          label: 'Aviso Oficial',
        };
    }
  };

  // Status badge styling
  const getStatusBadgeStyle = (status: CentralAlertStatus) => {
    switch (status) {
      case 'Ativo':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-bold';
      case 'Futuro':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold';
      case 'Terminado':
        return 'bg-slate-800/70 text-slate-400 border-slate-700/60';
      case 'Cancelado':
        return 'bg-red-500/20 text-red-400 border-red-500/40';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#070b13] min-h-screen text-slate-100">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-slate-900 border border-blue-500 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-in fade-in duration-200 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header Ribbon */}
      <div className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md px-4 sm:px-6 py-5 sticky top-16 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-red-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  PAROU.PT — CENTRO DE ALERTAS
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    100% Fontes Oficiais
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Sistema central de avisos, greves, desvios e interrupções baseado exclusivamente em dados reais auditados.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions (Diagnóstico, Preferências, Sincronizar) */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPreferencesModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-blue-500/50 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Configurar Notificações PWA e Favoritos"
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>Notificações & Favoritos</span>
              {prefs.pushNotificationsEnabled && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              onClick={() => setShowDiagnosticModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 hover:border-purple-500/50 text-xs font-semibold transition-all cursor-pointer shadow-sm"
              title="Ver Diagnóstico Técnico e Deduplicação"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              <span>Diagnóstico</span>
            </button>

            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
              title="Forçar Re-sincronização de todas as fontes oficiais"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'A Sincronizar...' : 'Atualizar'}</span>
            </button>
          </div>
        </div>

        {/* Global Statistics Ribbon */}
        <div className="max-w-7xl mx-auto mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <strong>{countsByStatus.Ativo}</strong> alertas ativos agora
            </span>
            <span className="flex items-center gap-1.5 text-indigo-300">
              <Clock className="w-3.5 h-3.5" />
              <strong>{countsByStatus.Futuro}</strong> alertas futuros agendados
            </span>
            {diagnostic && (
              <span className="flex items-center gap-1.5 text-slate-400 hidden sm:inline-flex">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <strong>{diagnostic.duplicates_avoided_count}</strong> duplicados prevenidos
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Última sincronização oficial: {lastSyncTime}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
        {/* Search, Status Tabs and Filter Controls */}
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          {/* Status Tabs Switcher */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
              {(['Todos', 'Ativo', 'Futuro', 'Terminado', 'Cancelado'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setActiveStatusTab(st)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeStatusTab === st
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  <span>{st === 'Todos' ? 'Todos os Alertas' : (st === 'Ativo' ? 'Em Vigor (Ativos)' : (st === 'Futuro' ? 'Agendados (Futuros)' : st))}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeStatusTab === st ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {countsByStatus[st]}
                  </span>
                </button>
              ))}
            </div>

            {/* Relevance Switcher: "Apenas Meus Favoritos" */}
            <button
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                onlyFavorites
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/20'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
              title="Filtrar alertas relevantes para os seus operadores e concelhos favoritos (ex: UNIR, Porto, linhas guardadas)"
            >
              <Sparkles className={`w-3.5 h-3.5 ${onlyFavorites ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>Apenas Meus Favoritos</span>
              {onlyFavorites && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Search Input Bar & Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar linha (ex: 8003, Linha Azul, 1715), concelho, paragem, motivo..."
                className="w-full pl-10 pr-8 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Alert Type Selector */}
            <div className="md:col-span-3">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
              >
                <option value="Todos">Todos os Tipos de Alerta</option>
                {ALL_CENTRAL_ALERT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Selector */}
            <div className="md:col-span-2">
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
              >
                <option value="Todos">Todos Operadores</option>
                {availableOperators.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>

            {/* Region Selector */}
            <div className="md:col-span-2">
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-all"
              >
                <option value="Todas">Todas Regiões</option>
                {availableRegions.map((reg) => (
                  <option key={reg} value={reg}>{reg}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
            <p className="text-xs text-slate-400">A sincronizar alertas das fontes oficiais auditadas...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displayedAlerts.length === 0 && (
          <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Sem alertas registados com estes filtros</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {onlyFavorites 
                  ? 'Não existem alertas oficiais ativos para os seus favoritos selecionados. Pode ajustar os seus favoritos nas definições.'
                  : 'Nenhum alerta oficial cumpre os critérios pesquisados. A rede opera normalmente de acordo com as fontes oficiais.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => {
                  setActiveStatusTab('Todos');
                  setSelectedType('Todos');
                  setSelectedOperator('Todos');
                  setSelectedRegion('Todas');
                  setSearchQuery('');
                  setOnlyFavorites(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          </div>
        )}

        {/* Alerts Grid */}
        {!isLoading && displayedAlerts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedAlerts.map((alert) => {
              const typeStyle = getTypeBadgeStyle(alert.tipo);
              const TypeIcon = typeStyle.icon;
              const isFuture = alert.status === 'Futuro';
              const isEnded = alert.status === 'Terminado';

              return (
                <div
                  key={alert.id}
                  className={`p-5 rounded-3xl border transition-all duration-200 flex flex-col justify-between space-y-4 shadow-xl ${
                    isFuture 
                      ? 'bg-slate-900/90 border-indigo-500/40 shadow-indigo-950/20' 
                      : (alert.tipo === 'greve' 
                          ? 'bg-slate-900/90 border-red-500/40 shadow-red-950/20' 
                          : (isEnded ? 'bg-slate-950/50 border-slate-800/50 opacity-75' : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'))
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Type & Status Badges */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${typeStyle.bg}`}>
                          <TypeIcon className="w-3.5 h-3.5" />
                          <span>{typeStyle.label}</span>
                        </span>

                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] border ${getStatusBadgeStyle(alert.status)}`}>
                          <span>Estado: {alert.status}</span>
                        </span>
                      </div>

                      {/* Operator badge */}
                      <span className="text-[11px] font-bold text-slate-300 px-2 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/60 truncate max-w-[180px]">
                        {alert.operador}
                      </span>
                    </div>

                    {/* Alert Title */}
                    <h2 className="text-base font-bold text-white tracking-tight leading-snug">
                      {alert.título}
                    </h2>

                    {/* Description */}
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                      {alert.descrição}
                    </p>

                    {/* Affected Lines & Stops */}
                    {(alert.linhas.length > 0 || alert.paragens.length > 0) && (
                      <div className="pt-1 flex items-center gap-2 flex-wrap text-xs">
                        {alert.linhas.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase">Linhas:</span>
                            {Array.from(new Set(alert.linhas.map((l) => String(l).replace(/^\[.*?\]/, '').trim()).filter(Boolean)))
                              .slice(0, 6)
                              .map((ln, lnIdx) => (
                                <button
                                  key={`${alert.id}-ln-${ln}-${lnIdx}`}
                                  onClick={() => setSearchQuery(ln)}
                                  className="px-2 py-0.5 rounded-md bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800/50 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                                  title={`Filtrar alertas da carreira ${ln}`}
                                >
                                  {ln}
                                </button>
                              ))}
                            {alert.linhas.length > 6 && (
                              <span className="text-[10px] text-slate-500">+{alert.linhas.length - 6}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Affected Geographic Region & Municipalities */}
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        <span>{alert.região}</span>
                      </span>
                      {alert.municípios.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Concelhos: {alert.municípios.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dates & Source Card Footer */}
                  <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                    {/* Datetime Period */}
                    <div className="flex items-center justify-between flex-wrap gap-2 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-300 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        <span>Início: {new Date(alert.start_datetime).toLocaleDateString('pt-PT')} {new Date(alert.start_datetime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {alert.end_datetime ? (
                        <div className="flex items-center gap-1 text-slate-400 font-mono">
                          <span>Fim: {new Date(alert.end_datetime).toLocaleDateString('pt-PT')} {new Date(alert.end_datetime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Término indeterminado</span>
                      )}
                    </div>

                    {/* Official Source & Verification Link */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Fonte: <strong className="text-white font-medium">{alert.source}</strong></span>
                      </div>

                      <a
                        href={alert.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                      >
                        <span>Fonte Oficial</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DASHBOARD MODAL: ÁREA DE DIAGNÓSTICO */}
      {showDiagnosticModal && diagnostic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Activity className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Dashboard e Diagnóstico do Centro de Alertas</h3>
                  <p className="text-xs text-slate-400">
                    Auditoria em tempo real de integridade, deduplicação e fontes oficiais
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Key Diagnostic Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Alertas Ativos</div>
                  <div className="text-2xl font-black text-emerald-400">{diagnostic.active_alerts_count}</div>
                  <div className="text-[9px] text-slate-500">Em vigor neste momento</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Alertas Futuros</div>
                  <div className="text-2xl font-black text-indigo-400">{diagnostic.future_alerts_count}</div>
                  <div className="text-[9px] text-slate-500">Agendados para breve</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Alertas Terminados</div>
                  <div className="text-2xl font-black text-slate-400">{diagnostic.ended_alerts_count}</div>
                  <div className="text-[9px] text-slate-500">Prazo ultrapassado</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Duplicados Evitados</div>
                  <div className="text-2xl font-black text-blue-400">{diagnostic.duplicates_avoided_count}</div>
                  <div className="text-[9px] text-slate-500">Via source + external_id</div>
                </div>
              </div>

              {/* Extra Metric Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Notificações Emitidas</div>
                    <div className="text-[11px] text-slate-400">Total de alertas enviados com consentimento</div>
                  </div>
                  <div className="text-2xl font-black text-amber-400">{diagnostic.notifications_sent_count}</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Fontes com Erro</div>
                    <div className="text-[11px] text-slate-400">
                      {diagnostic.sources_error_count === 0 ? 'Todas as fontes operacionais' : `${diagnostic.sources_error_count} fontes com anomalia`}
                    </div>
                  </div>
                  <div className={`text-2xl font-black ${diagnostic.sources_error_count === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {diagnostic.sources_error_count}
                  </div>
                </div>
              </div>

              {/* Error list if any */}
              {diagnostic.sources_error_list.length > 0 && (
                <div className="p-4 rounded-2xl bg-red-950/20 border border-red-800/40 space-y-2">
                  <div className="text-xs font-bold text-red-300">Registo de Fontes com Erro:</div>
                  <div className="space-y-1 text-xs text-red-200">
                    {diagnostic.sources_error_list.map((e, idx) => (
                      <div key={idx} className="flex justify-between gap-2 border-b border-red-900/30 pb-1">
                        <span>{e.source}: {e.error}</span>
                        <span className="text-[10px] text-red-400 font-mono">{new Date(e.last_attempt).toLocaleTimeString('pt-PT')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification Principles */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Princípios de Confiabilidade PAROU.PT:</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400">
                  <li><strong>Exclusivamente Oficial:</strong> Nenhum alerta é gerado sem link e identificador oficial da autoridade de transportes.</li>
                  <li><strong>Anti-Spam Garantido:</strong> Comparações de hash garantem que republicações idênticas não enviam notificações duplicadas.</li>
                  <li><strong>Gestão Temporal:</strong> Passagem automática de <em>Futuro</em> para <em>Ativo</em> à hora de início e para <em>Terminado</em> no fim.</li>
                </ul>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>Última Sincronização: {new Date(diagnostic.last_sync).toLocaleString('pt-PT')}</span>
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors cursor-pointer"
              >
                Fechar Diagnóstico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREFERENCES & NOTIFICATIONS MODAL */}
      {showPreferencesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  <Bell className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">Preferências e Notificações PWA</h3>
                  <p className="text-xs text-slate-400">
                    Defina que alertas deseja receber no dispositivo e personalize os seus favoritos
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPreferencesModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Account Sync Notice */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-bold text-white">
                      {currentUser ? `Sincronizado com: ${currentUser.displayName || currentUser.email}` : 'Modo Sem Conta (Local)'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {currentUser ? 'As suas preferências são sincronizadas na nuvem com a sua conta.' : 'As preferências ficam guardadas localmente no seu dispositivo.'}
                    </div>
                  </div>
                </div>

                {!currentUser && onOpenLoginModal && (
                  <button
                    onClick={() => {
                      setShowPreferencesModal(false);
                      onOpenLoginModal();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors cursor-pointer"
                  >
                    Entrar para Sincronizar
                  </button>
                )}
              </div>

              {/* PWA Push Notification Master Switch */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white text-sm">Notificações Push PWA</div>
                    <div className="text-slate-400 text-[11px]">Nunca enviamos alertas sem o utilizador ativar expressamente.</div>
                  </div>

                  <button
                    onClick={prefs.pushNotificationsEnabled 
                      ? () => handleUpdatePrefs({ ...prefs, pushNotificationsEnabled: false }) 
                      : handleRequestPushNotifications}
                    className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer ${
                      prefs.pushNotificationsEnabled 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {prefs.pushNotificationsEnabled ? 'Ativadas' : 'Ativar Notificações'}
                  </button>
                </div>

                {prefs.pushNotificationsEnabled && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="font-semibold text-slate-300">Gatilhos de Notificação Permitidos:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-400">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.notifyFutureStrikes}
                          onChange={(e) => handleUpdatePrefs({ ...prefs, notifyFutureStrikes: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Greve futura relevante</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.notifyStrikeStart}
                          onChange={(e) => handleUpdatePrefs({ ...prefs, notifyStrikeStart: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Início de greve</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.notifyInterruptions}
                          onChange={(e) => handleUpdatePrefs({ ...prefs, notifyInterruptions: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Interrupção de circulação</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.notifyImportantChanges}
                          onChange={(e) => handleUpdatePrefs({ ...prefs, notifyImportantChanges: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Alterações de percurso / desvios</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.notifyScheduleChanges}
                          onChange={(e) => handleUpdatePrefs({ ...prefs, notifyScheduleChanges: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>Alterações de horário</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Favorites Configuration (Operadores, Concelhos, Linhas) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div>
                  <div className="font-bold text-white text-sm">Os Meus Favoritos (Relevância)</div>
                  <div className="text-slate-400 text-[11px]">
                    Receba e filtre apenas os alertas que afetam as suas deslocações diárias (ex: UNIR + Porto).
                  </div>
                </div>

                {/* Popular Operators Quick Selector */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold">Operadores Favoritos:</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['UNIR', 'Carris Metropolitana', 'Metropolitano de Lisboa', 'Metro do Porto', 'CP', 'Fertagus', 'STCP', 'Transtejo Soflusa'].map((op) => {
                      const isSelected = prefs.favoriteOperators.includes(op);
                      return (
                        <button
                          key={op}
                          onClick={() => {
                            const updated = isSelected 
                              ? prefs.favoriteOperators.filter(o => o !== op)
                              : [...prefs.favoriteOperators, op];
                            handleUpdatePrefs({ ...prefs, favoriteOperators: updated });
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                          <span>{op}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Municipalities Quick Selector */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold">Concelhos Favoritos:</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['Porto', 'Lisboa', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Sintra', 'Cascais', 'Amadora', 'Setúbal', 'Braga', 'Coimbra'].map((mun) => {
                      const isSelected = prefs.favoriteMunicipalities.includes(mun);
                      return (
                        <button
                          key={mun}
                          onClick={() => {
                            const updated = isSelected 
                              ? prefs.favoriteMunicipalities.filter(m => m !== mun)
                              : [...prefs.favoriteMunicipalities, mun];
                            handleUpdatePrefs({ ...prefs, favoriteMunicipalities: updated });
                          }}
                          className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                          <span>{mun}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Specific Lines input */}
                <div className="space-y-1.5">
                  <div className="text-slate-400 font-semibold">Linhas / Carreiras Específicas:</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newFavoriteLine}
                      onChange={(e) => setNewFavoriteLine(e.target.value)}
                      placeholder="Ex: 8003, Linha Azul, 1715, 500..."
                      className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs flex-1 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => {
                        if (newFavoriteLine.trim() && !prefs.favoriteLines.includes(newFavoriteLine.trim())) {
                          const updated = [...prefs.favoriteLines, newFavoriteLine.trim()];
                          handleUpdatePrefs({ ...prefs, favoriteLines: updated });
                          setNewFavoriteLine('');
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      Adicionar
                    </button>
                  </div>

                  {prefs.favoriteLines.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {Array.from(new Set(prefs.favoriteLines)).map((ln, lnIdx) => (
                        <span key={`fav-ln-${ln}-${lnIdx}`} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-blue-950 border border-blue-800 text-blue-300 font-mono text-[10px] font-bold">
                          <span>{ln}</span>
                          <button
                            onClick={() => {
                              const updated = prefs.favoriteLines.filter(l => l !== ln);
                              handleUpdatePrefs({ ...prefs, favoriteLines: updated });
                            }}
                            className="hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Category Toggles (Ativar/Desativar Categorias de Alertas) */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div>
                  <div className="font-bold text-white text-sm">Categorias de Alerta Permitidas</div>
                  <div className="text-slate-400 text-[11px]">
                    Desative tipos de alerta que não deseja ver nem receber no Centro de Alertas.
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300">
                  {ALL_CENTRAL_ALERT_TYPES.map((tipo) => {
                    const isEnabled = prefs.enabledTypes[tipo] !== false;
                    return (
                      <label key={tipo} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800/80 cursor-pointer">
                        <span className="capitalize">{tipo}</span>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => {
                            const updatedTypes = { ...prefs.enabledTypes, [tipo]: e.target.checked };
                            handleUpdatePrefs({ ...prefs, enabledTypes: updatedTypes });
                          }}
                          className="rounded text-blue-600"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
              <span>Preferências guardadas instantaneamente</span>
              <button
                onClick={() => setShowPreferencesModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

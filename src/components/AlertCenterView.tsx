import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  Search, 
  ExternalLink, 
  Calendar, 
  MapPin, 
  Check, 
  X, 
  Activity, 
  ChevronRight
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
}) => {
  const [alerts, setAlerts] = useState<CentralAlert[]>([]);
  const [diagnostic, setDiagnostic] = useState<AlertCenterDiagnostic | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('a carregar...');

  // Filters state
  const [activeStatusTab, setActiveStatusTab] = useState<CentralAlertStatus | 'Todos'>('Todos');
  const [selectedType, setSelectedType] = useState<CentralAlertType | 'Todos'>('Todos');
  const [selectedOperator, setSelectedOperator] = useState<string>('Todos');
  const [selectedRegion, setSelectedRegion] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);

  // Modals state
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [showPreferencesModal, setShowPreferencesModal] = useState<boolean>(false);

  // User Alert Preferences state
  const [prefs, setPrefs] = useState<AlertPreferences>(getStoredAlertPreferences());
  const [newFavoriteLine, setNewFavoriteLine] = useState<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [alertsData, diagData] = await Promise.all([
        fetchCentralAlerts(),
        fetchCentralAlertsDiagnostic().catch(() => null),
      ]);
      setAlerts(alertsData.alerts || []);
      if (diagData) {
        setDiagnostic(diagData);
        setLastSyncTime(new Date(diagData.last_sync).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
      } else {
        setLastSyncTime(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch (err) {
      console.error('Erro ao carregar centro de alertas:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await triggerCentralAlertsSync();
      await loadData();
      showToast('Alertas atualizados.');
    } catch (err) {
      showToast('Erro ao sincronizar.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdatePrefs = (newPrefs: AlertPreferences) => {
    setPrefs(newPrefs);
    saveStoredAlertPreferences(newPrefs);
    if (currentUser?.uid) {
      syncAlertPreferencesToFirebase(currentUser.uid, newPrefs);
    }
  };

  const handleRequestPushNotifications = async () => {
    if (!('Notification' in window)) {
      showToast('O navegador não suporta notificações.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const updated = { ...prefs, pushNotificationsEnabled: true };
      handleUpdatePrefs(updated);
      showToast('Notificações ativadas.');
    } else {
      showToast('Permissão de notificações recusada.');
    }
  };

  // Status counts
  const countsByStatus = useMemo(() => {
    const counts = { Todos: alerts.length, Ativo: 0, Futuro: 0, Terminado: 0, Cancelado: 0 };
    alerts.forEach((a) => {
      if (counts[a.status] !== undefined) counts[a.status] += 1;
    });
    return counts;
  }, [alerts]);

  const availableOperators = useMemo(() => {
    const ops = new Set<string>();
    alerts.forEach((a) => {
      if (a.operador) ops.add(a.operador);
    });
    return Array.from(ops).sort();
  }, [alerts]);

  const availableRegions = useMemo(() => {
    const regs = new Set<string>();
    alerts.forEach((a) => {
      if (a.região) regs.add(a.região);
    });
    return Array.from(regs).sort();
  }, [alerts]);

  const displayedAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      if (activeStatusTab !== 'Todos' && alert.status !== activeStatusTab) return false;
      if (selectedType !== 'Todos' && alert.tipo !== selectedType) return false;
      if (selectedOperator !== 'Todos' && alert.operador !== selectedOperator) return false;
      if (selectedRegion !== 'Todas' && alert.região !== selectedRegion) return false;

      if (onlyFavorites) {
        if (!isAlertRelevantToUser(alert, prefs)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = alert.título.toLowerCase().includes(q);
        const matchesDesc = alert.descrição.toLowerCase().includes(q);
        const matchesOp = alert.operador.toLowerCase().includes(q);
        const matchesLines = alert.linhas.some((l) => String(l).toLowerCase().includes(q));
        const matchesMuns = alert.municípios.some((m) => m.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesOp && !matchesLines && !matchesMuns) return false;
      }

      return true;
    });
  }, [alerts, activeStatusTab, selectedType, selectedOperator, selectedRegion, onlyFavorites, searchQuery, prefs]);

  return (
    <div className="w-full flex-1 flex flex-col bg-[#FFFFFF] min-h-screen text-[#111111]">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 bg-[#111111] text-[#FFFFFF] px-4 py-2.5 rounded-[8px] text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#FFFFFF] stroke-[2]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-[#E6E6E3] bg-[#FFFFFF] px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
              Alertas
            </h1>
            <p className="text-xs text-[#6B6B6B] mt-0.5">
              Avisos e perturbações oficiais em vigor.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPreferencesModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer transition-colors"
            >
              <Bell className="w-4 h-4 stroke-[2]" />
              <span>Notificações</span>
            </button>

            <button
              onClick={() => setShowDiagnosticModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer transition-colors"
            >
              <Activity className="w-4 h-4 stroke-[2]" />
              <span>Diagnóstico</span>
            </button>

            {/* Primary Action Button: Brand chamfer */}
            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] text-xs font-bold min-h-[44px] cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'A atualizar...' : 'Atualizar'}</span>
            </button>
          </div>
        </div>

        {/* Global Statistics Ribbon */}
        <div className="max-w-6xl mx-auto mt-3 pt-3 border-t border-[#E6E6E3] flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 font-semibold text-[#111111]">
              <span className="font-['Barlow_Condensed'] font-bold text-sm tabular-nums text-[#C2410C]">
                {countsByStatus.Ativo}
              </span>
              <span>ativos</span>
            </span>

            <span className="flex items-center gap-1.5 text-[#6B6B6B]">
              <span className="font-['Barlow_Condensed'] font-bold text-sm tabular-nums text-[#111111]">
                {countsByStatus.Futuro}
              </span>
              <span>agendados</span>
            </span>

            {diagnostic && (
              <span className="text-[#6B6B6B] hidden sm:inline-flex">
                <span>{diagnostic.duplicates_avoided_count} duplicados prevenidos</span>
              </span>
            )}
          </div>

          <div className="text-xs text-[#6B6B6B]">
            <span>Atualizado: {lastSyncTime}</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 space-y-4 flex-1">
        {/* Filter Controls */}
        <div className="p-3.5 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-3">
          {/* Status Tabs Switcher */}
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-[#E6E6E3]">
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 w-full sm:w-auto">
              {(['Todos', 'Ativo', 'Futuro', 'Terminado'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setActiveStatusTab(st)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold cursor-pointer min-h-[36px] transition-colors whitespace-nowrap ${
                    activeStatusTab === st
                      ? 'bg-[#111111] text-[#FFFFFF]'
                      : 'text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  <span>{st}</span>
                  <span className="font-['Barlow_Condensed'] font-bold tabular-nums text-xs">
                    ({countsByStatus[st]})
                  </span>
                </button>
              ))}
            </div>

            {/* Relevance Switcher */}
            <button
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold cursor-pointer min-h-[36px] transition-colors border ${
                onlyFavorites
                  ? 'bg-[#111111] text-[#FFFFFF] border-[#111111]'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border-[#E6E6E3]'
              }`}
            >
              <span>Favoritos</span>
            </button>
          </div>

          {/* Search Input Bar & Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            {/* Search Input */}
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar linha, concelho, motivo..."
                className="w-full pl-9 pr-8 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111]"
                >
                  <X className="w-4 h-4 stroke-[2]" />
                </button>
              )}
            </div>

            {/* Alert Type Selector */}
            <div className="md:col-span-3">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] font-semibold focus:outline-none min-h-[44px]"
              >
                <option value="Todos">Todos os tipos</option>
                {ALL_CENTRAL_ALERT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Operator Selector */}
            <div className="md:col-span-3">
              <select
                value={selectedOperator}
                onChange={(e) => setSelectedOperator(e.target.value)}
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] font-semibold focus:outline-none min-h-[44px]"
              >
                <option value="Todos">Todos os operadores</option>
                {availableOperators.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="py-16 text-center space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin text-[#111111] mx-auto stroke-[2]" />
            <p className="text-xs text-[#6B6B6B]">A carregar alertas...</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displayedAlerts.length === 0 && (
          <div className="p-8 text-center rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] text-sm text-[#6B6B6B]">
            Sem alertas para os filtros selecionados.
          </div>
        )}

        {/* Alerts List: 1px divider lines */}
        {!isLoading && displayedAlerts.length > 0 && (
          <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
            {displayedAlerts.map((alert) => {
              const isSevere = alert.tipo === 'interrupção' || alert.tipo === 'linha suspensa' || alert.tipo === 'cancelamento';

              return (
                <div
                  key={alert.id}
                  className="p-4 hover:bg-[#F4F4F2] transition-colors space-y-2"
                >
                  {/* Top Row: Type & Operator */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {isSevere && <AlertTriangle className="w-4 h-4 text-[#D92D20] stroke-[2] shrink-0" />}
                      <span className="font-semibold text-[#111111] uppercase tracking-wide">
                        {alert.tipo}
                      </span>
                      <span className="text-[#6B6B6B]">·</span>
                      <span className="text-[#6B6B6B]">
                        {alert.status}
                      </span>
                    </div>

                    <span className="font-semibold text-[#111111] text-xs">
                      {alert.operador}
                    </span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h2 className="text-base font-semibold text-[#111111] leading-snug">
                      {alert.título}
                    </h2>
                    <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">
                      {alert.descrição}
                    </p>
                  </div>

                  {/* Lines if any */}
                  {alert.linhas.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[11px] text-[#6B6B6B]">Linhas:</span>
                      {Array.from(new Set(alert.linhas.map((l) => String(l).replace(/^\[.*?\]/, '').trim()).filter(Boolean)))
                        .slice(0, 8)
                        .map((ln, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] text-[11px] font-['Barlow_Condensed'] font-bold tabular-nums text-[#111111]"
                          >
                            {ln}
                          </span>
                        ))}
                    </div>
                  )}

                  {/* Bottom details */}
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-[#6B6B6B] pt-1">
                    <div className="flex items-center gap-3">
                      <span>Início: <strong className="font-['Barlow_Condensed'] tabular-nums text-[#111111]">{new Date(alert.start_datetime).toLocaleDateString('pt-PT')}</strong></span>
                      {alert.end_datetime && (
                        <span>Fim: <strong className="font-['Barlow_Condensed'] tabular-nums text-[#111111]">{new Date(alert.end_datetime).toLocaleDateString('pt-PT')}</strong></span>
                      )}
                    </div>

                    {alert.source_url && (
                      <a
                        href={alert.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#111111] hover:underline font-semibold cursor-pointer"
                      >
                        <span>Fonte ({alert.source})</span>
                        <ExternalLink className="w-3 h-3 stroke-[2]" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* DIAGNOSTIC MODAL */}
      {showDiagnosticModal && diagnostic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111111]">Diagnóstico</h3>
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="p-1 rounded-[6px] text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
                  <span className="text-[11px] text-[#6B6B6B]">Ativos</span>
                  <div className="font-['Barlow_Condensed'] text-xl font-bold text-[#111111] tabular-nums mt-0.5">
                    {diagnostic.active_alerts_count}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
                  <span className="text-[11px] text-[#6B6B6B]">Futuros</span>
                  <div className="font-['Barlow_Condensed'] text-xl font-bold text-[#111111] tabular-nums mt-0.5">
                    {diagnostic.future_alerts_count}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
                  <span className="text-[11px] text-[#6B6B6B]">Terminados</span>
                  <div className="font-['Barlow_Condensed'] text-xl font-bold text-[#111111] tabular-nums mt-0.5">
                    {diagnostic.ended_alerts_count}
                  </div>
                </div>

                <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
                  <span className="text-[11px] text-[#6B6B6B]">Duplicados</span>
                  <div className="font-['Barlow_Condensed'] text-xl font-bold text-[#111111] tabular-nums mt-0.5">
                    {diagnostic.duplicates_avoided_count}
                  </div>
                </div>
              </div>

              {diagnostic.sources_error_list.length > 0 && (
                <div className="p-3 rounded-[8px] bg-[#F4F4F2] border border-[#D92D20] space-y-1">
                  <div className="font-semibold text-[#D92D20]">Fontes com erro:</div>
                  {diagnostic.sources_error_list.map((e, idx) => (
                    <div key={idx} className="text-[#D92D20]">
                      {e.source}: {e.error}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-[#E6E6E3] flex justify-end">
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="px-4 py-2 bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold rounded-[8px] min-h-[44px] cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PREFERENCES MODAL */}
      {showPreferencesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between">
              <h3 className="text-base font-bold text-[#111111]">Notificações e preferências</h3>
              <button
                onClick={() => setShowPreferencesModal(false)}
                className="p-1 rounded-[6px] text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* Push notifications switch */}
              <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3] flex items-center justify-between">
                <div>
                  <div className="font-bold text-[#111111]">Notificações no dispositivo</div>
                  <div className="text-[#6B6B6B]">Receber avisos sobre greves e perturbações.</div>
                </div>

                <button
                  onClick={prefs.pushNotificationsEnabled 
                    ? () => handleUpdatePrefs({ ...prefs, pushNotificationsEnabled: false }) 
                    : handleRequestPushNotifications}
                  className={`px-3 py-2 rounded-[8px] font-semibold text-xs min-h-[44px] cursor-pointer ${
                    prefs.pushNotificationsEnabled 
                      ? 'bg-[#111111] text-[#FFFFFF]' 
                      : 'bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111]'
                  }`}
                >
                  {prefs.pushNotificationsEnabled ? 'Ativadas' : 'Ativar'}
                </button>
              </div>

              {/* Operators list */}
              <div className="space-y-1.5">
                <div className="font-semibold text-[#111111]">Operadores frequentes:</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['Carris Metropolitana', 'Metropolitano de Lisboa', 'Metro do Porto', 'CP', 'Fertagus', 'STCP', 'UNIR'].map((op) => {
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
                        className={`px-3 py-1.5 rounded-[6px] text-xs font-semibold cursor-pointer min-h-[36px] transition-colors ${
                          isSelected
                            ? 'bg-[#111111] text-[#FFFFFF]'
                            : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                        }`}
                      >
                        {op}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Specific Lines input */}
              <div className="space-y-1.5">
                <div className="font-semibold text-[#111111]">Linhas específicas:</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newFavoriteLine}
                    onChange={(e) => setNewFavoriteLine(e.target.value)}
                    placeholder="Ex: 8003, Linha Azul, 728..."
                    className="px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-[#111111] text-xs flex-1 focus:outline-none min-h-[44px]"
                  />
                  <button
                    onClick={() => {
                      if (newFavoriteLine.trim() && !prefs.favoriteLines.includes(newFavoriteLine.trim())) {
                        const updated = [...prefs.favoriteLines, newFavoriteLine.trim()];
                        handleUpdatePrefs({ ...prefs, favoriteLines: updated });
                        setNewFavoriteLine('');
                      }
                    }}
                    className="px-3 py-2 bg-[#111111] text-[#FFFFFF] font-semibold rounded-[8px] text-xs min-h-[44px] cursor-pointer"
                  >
                    Adicionar
                  </button>
                </div>

                {prefs.favoriteLines.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {prefs.favoriteLines.map((ln) => (
                      <span key={ln} className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] font-['Barlow_Condensed'] font-bold tabular-nums">
                        <span>{ln}</span>
                        <button
                          onClick={() => {
                            const updated = prefs.favoriteLines.filter(l => l !== ln);
                            handleUpdatePrefs({ ...prefs, favoriteLines: updated });
                          }}
                          className="hover:text-[#D92D20] ml-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3 stroke-[2]" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 border-t border-[#E6E6E3] flex justify-end">
              <button
                onClick={() => setShowPreferencesModal(false)}
                className="px-4 py-2 bg-[#111111] text-[#FFFFFF] text-xs font-semibold rounded-[8px] min-h-[44px] cursor-pointer"
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

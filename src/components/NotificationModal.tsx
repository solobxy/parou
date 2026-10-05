import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  BellRing, 
  Check, 
  AlertTriangle, 
  MapPin, 
  Volume2, 
  VolumeX, 
  Smartphone, 
  Sparkles, 
  Trash2, 
  Clock, 
  Train, 
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Info
} from 'lucide-react';
import { NotificationPreferences, NotificationLogItem } from '../types';
import { 
  getStoredNotificationPreferences, 
  saveStoredNotificationPreferences,
  getNotificationPermissionState,
  requestNotificationPermission,
  getStoredNotificationHistory,
  clearStoredNotificationHistory,
  triggerTestNotification
} from '../services/notifications';
import { CIDADES_OPTIONS } from '../data/mockData';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPreferencesChange: (newPrefs: NotificationPreferences) => void;
  onViewReport: (reportId: string) => void;
  onTestNotification: (item: NotificationLogItem) => void;
  onOpenAlertCenter?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onPreferencesChange,
  onViewReport,
  onTestNotification,
  onOpenAlertCenter,
}) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const [prefs, setPrefs] = useState<NotificationPreferences>(getStoredNotificationPreferences());
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>('default');
  const [history, setHistory] = useState<NotificationLogItem[]>([]);
  const [testSuccess, setTestSuccess] = useState(false);
  const [requestingPerm, setRequestingPerm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentPrefs = getStoredNotificationPreferences();
      setPrefs(currentPrefs);
      setPermissionState(getNotificationPermissionState());
      setHistory(getStoredNotificationHistory());
      setTestSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleEnabled = async () => {
    const nextEnabled = !prefs.enabled;

    // If turning on and permission not yet granted, request it
    if (nextEnabled && permissionState !== 'granted' && permissionState !== 'unsupported') {
      setRequestingPerm(true);
      const res = await requestNotificationPermission();
      setRequestingPerm(false);
      setPermissionState(res.permission);

      const updatedPrefs: NotificationPreferences = {
        ...prefs,
        enabled: nextEnabled,
        pushSubscribed: res.isPWAReady,
      };
      setPrefs(updatedPrefs);
      saveStoredNotificationPreferences(updatedPrefs);
      onPreferencesChange(updatedPrefs);
      return;
    }

    const updatedPrefs: NotificationPreferences = {
      ...prefs,
      enabled: nextEnabled,
    };
    setPrefs(updatedPrefs);
    saveStoredNotificationPreferences(updatedPrefs);
    onPreferencesChange(updatedPrefs);
  };

  const handleUpdatePref = <K extends keyof NotificationPreferences>(
    key: K,
    val: NotificationPreferences[K]
  ) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    saveStoredNotificationPreferences(updated);
    onPreferencesChange(updated);
  };

  const handleRequestPermissionDirect = async () => {
    setRequestingPerm(true);
    const res = await requestNotificationPermission();
    setRequestingPerm(false);
    setPermissionState(res.permission);
    if (res.permission === 'granted') {
      const updated: NotificationPreferences = {
        ...prefs,
        enabled: true,
        pushSubscribed: res.isPWAReady,
      };
      setPrefs(updated);
      saveStoredNotificationPreferences(updated);
      onPreferencesChange(updated);
    }
  };

  const handleRunTest = async () => {
    const logItem = await triggerTestNotification(prefs);
    setHistory((prev) => [logItem, ...prev.filter((i) => i.id !== logItem.id)]);
    setTestSuccess(true);
    onTestNotification(logItem);
    setTimeout(() => setTestSuccess(false), 4000);
  };

  const handleClearHistory = () => {
    clearStoredNotificationHistory();
    setHistory([]);
  };

  const popularDistricts = ['Todas', 'Lisboa', 'Porto', 'Setúbal', 'Braga', 'Coimbra', 'Faro'];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-[#090e1a] border border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-slate-100"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 pb-4 border-b border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h2 id="notification-modal-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Notificações do PAROU</span>
                {prefs.enabled && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Alertas em tempo real sobre transportes e trânsito em Portugal
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label="Fechar janela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Banner: Direct Link to Centro de Alertas */}
        {onOpenAlertCenter && (
          <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Novo: <strong>Centro de Alertas Oficiais</strong> (140+ greves, interrupções e desvios auditados)</span>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenAlertCenter();
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all shrink-0 cursor-pointer"
            >
              Abrir Alertas
            </button>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800/80 px-4 sm:px-6 bg-[#070b14]">
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Definições de Alertas
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Histórico de Alertas</span>
            {history.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {activeTab === 'settings' ? (
            <>
              {/* Master Activation Box */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-[#0b1220] border border-blue-500/30 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">
                      Ativar Alertas do PAROU.PT
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      prefs.enabled 
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700' 
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {prefs.enabled ? 'Ativo' : 'Desativado'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Receba notificações automáticas no browser e ecrã de bloqueio
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={prefs.enabled}
                    onChange={handleToggleEnabled}
                    disabled={requestingPerm}
                  />
                  <div className="w-12 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Browser Permission Alert Banner */}
              {permissionState === 'denied' && (
                <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Notificações bloqueadas pelo navegador</p>
                    <p className="text-[11px] text-red-200">
                      As notificações do sistema estão desativadas nas permissões do seu browser. Para receber alertas com o ecrã bloqueado, clique no cadeado na barra de endereço e altere para &quot;Permitir&quot;.
                    </p>
                  </div>
                </div>
              )}

              {permissionState === 'default' && (
                <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-700/60 text-amber-200 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Autorização de notificações pendente no browser</span>
                  </div>
                  <button
                    onClick={handleRequestPermissionDirect}
                    disabled={requestingPerm}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    {requestingPerm ? 'A pedir...' : 'Autorizar'}
                  </button>
                </div>
              )}

              {permissionState === 'granted' && (
                <div className="p-2.5 px-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Permissão concedida: O seu navegador aceita notificações push do PAROU.PT.</span>
                </div>
              )}

              {/* City/District Selection */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-400" />
                  <label htmlFor="select-city" className="text-sm font-bold text-white">
                    Cidade / Distrito a Monitorizar
                  </label>
                </div>
                <p className="text-xs text-slate-400">
                  Receba avisos instantâneos sempre que for reportada uma ocorrência nesta área geográfica:
                </p>

                {/* Popular pills */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {popularDistricts.map((city) => (
                    <button
                      key={city}
                      onClick={() => handleUpdatePref('selectedDistrict', city)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        prefs.selectedDistrict.toLowerCase() === city.toLowerCase()
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30 ring-1 ring-blue-400'
                          : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>

                {/* Dropdown for complete list */}
                <div className="pt-2">
                  <select
                    id="select-city"
                    value={prefs.selectedDistrict}
                    onChange={(e) => handleUpdatePref('selectedDistrict', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Todas">Portugal Inteiro (Todas as regiões)</option>
                    {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transport & Priority Rules */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Train className="w-4 h-4 text-purple-400" />
                  <span>Regras e Filtros Inteligentes</span>
                </h3>

                {/* Rule 1: Important Transport Disruption */}
                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-200 block">
                      Alterações Importantes nos Transportes
                    </span>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Receber avisos imediatos de greves nacionais, cortes de linhas de comboio (CP/Fertagus), linhas de metro suspensas e cortes de pontes, mesmo fora do seu distrito selecionado.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={prefs.importantTransportOnly}
                      onChange={(e) => handleUpdatePref('importantTransportOnly', e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {/* Rule 2: Severe Only */}
                <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-200 block">
                      Apenas Ocorrências Graves
                    </span>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Filtrar apenas alertas de gravidade alta (corte total de via, perturbação geral).
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={prefs.severeOnly}
                      onChange={(e) => handleUpdatePref('severeOnly', e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                  </label>
                </div>

                {/* Rule 3: Sound */}
                <div className="flex items-start justify-between gap-3 pt-2 border-t border-slate-800/80">
                  <div className="space-y-0.5">
                    <span className="text-xs sm:text-sm font-bold text-slate-200 flex items-center gap-1.5">
                      {prefs.soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-blue-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                      <span>Aviso Sonoro Acústico</span>
                    </span>
                    <span className="text-xs text-slate-400 block leading-relaxed">
                      Emitir sinal sonoro suave quando um novo alerta for acionado.
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={prefs.soundEnabled}
                      onChange={(e) => handleUpdatePref('soundEnabled', e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* PWA Push Notification Readiness Banner */}
              <div className="p-4 rounded-2xl bg-[#0d1627] border border-blue-500/20 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0 text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">Preparado para Web Push & PWA</span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                      Service Worker Ativo
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    O PAROU.PT utiliza um Service Worker com suporte a Web Push Notifications. Em dispositivos móveis (Android e iOS 16.4+), instale a aplicação através do botão <strong>Instalar App</strong> para receber notificações no ecrã principal mesmo com a app fechada.
                  </p>
                </div>
              </div>

              {/* Test Notification Action */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={handleRunTest}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-slate-700/80"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Testar Notificação Agora</span>
                </button>

                {testSuccess && (
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                    <Check className="w-4 h-4" />
                    <span>Notificação de teste enviada!</span>
                  </span>
                )}
              </div>
            </>
          ) : (
            /* Tab 2: History */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Alertas Recebidos ({history.length})
                </span>
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar histórico</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Bell className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">
                    Ainda não recebeu notificações
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Os alertas enviados de acordo com as suas preferências serão registados aqui.
                  </p>
                  <button
                    onClick={handleRunTest}
                    className="mt-3 px-3 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs font-bold transition-colors cursor-pointer border border-blue-500/40"
                  >
                    Enviar notificação de teste
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 flex items-start justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-white truncate">
                            {item.title}
                          </h4>
                          {item.district && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400">
                              {item.district}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                          {item.body}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-0.5">
                          <Clock className="w-3 h-3 text-slate-600" />
                          <span>{new Date(item.timestamp).toLocaleString('pt-PT')}</span>
                        </div>
                      </div>

                      {item.reportId && (
                        <button
                          onClick={() => {
                            if (item.reportId) {
                              onViewReport(item.reportId);
                              onClose();
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 mt-0.5"
                          title="Ver detalhes da ocorrência"
                        >
                          <span>Ver</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 bg-[#070b14] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Cidade atual:{' '}
              <strong className="text-slate-200">{prefs.selectedDistrict}</strong>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md shadow-blue-600/20"
          >
            Guardar & Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

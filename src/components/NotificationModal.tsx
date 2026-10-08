import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  MapPin, 
  Trash2, 
  Clock
} from 'lucide-react';
import { NotificationPreferences, NotificationLogItem } from '../types';
import { 
  getStoredNotificationPreferences, 
  saveStoredNotificationPreferences,
  getNotificationPermissionState,
  requestNotificationPermission,
  getStoredNotificationHistory,
  clearStoredNotificationHistory,
  triggerTestNotification,
  sincronizarPush,
  testarPush
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
  const temporizadorSync = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarSync = (p: NotificationPreferences) => {
    if (temporizadorSync.current) clearTimeout(temporizadorSync.current);
    temporizadorSync.current = setTimeout(() => { void sincronizarPush(p); }, 1200);
  };

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

    if (nextEnabled && permissionState !== 'granted' && permissionState !== 'unsupported') {
      const res = await requestNotificationPermission();
      setPermissionState(res.permission);

      const updatedPrefs: NotificationPreferences = {
        ...prefs,
        enabled: res.permission === 'granted',
      };
      setPrefs(updatedPrefs);
      saveStoredNotificationPreferences(updatedPrefs);
      onPreferencesChange(updatedPrefs);
      void sincronizarPush(updatedPrefs);
      return;
    }

    const updatedPrefs: NotificationPreferences = {
      ...prefs,
      enabled: nextEnabled,
    };
    setPrefs(updatedPrefs);
    saveStoredNotificationPreferences(updatedPrefs);
    onPreferencesChange(updatedPrefs);
    void sincronizarPush(updatedPrefs);
  };

  const handleToggleDistrict = (district: string) => {
    const currentDistricts = prefs.districts || [];
    const exists = currentDistricts.includes(district);
    const newDistricts = exists
      ? currentDistricts.filter((d) => d !== district)
      : [...currentDistricts, district];

    const updatedPrefs: NotificationPreferences = {
      ...prefs,
      districts: newDistricts,
    };
    setPrefs(updatedPrefs);
    saveStoredNotificationPreferences(updatedPrefs);
    onPreferencesChange(updatedPrefs);
    if (updatedPrefs.enabled) agendarSync(updatedPrefs);
  };

  const handleClearHistory = () => {
    clearStoredNotificationHistory();
    setHistory([]);
  };

  const handleRunTest = async () => {
    // Com as notificações ligadas, o teste vem do servidor (como os avisos verdadeiros)
    if (prefs.enabled && permissionState === 'granted' && await testarPush()) {
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 4000);
      return;
    }
    const testItem = await triggerTestNotification(prefs);
    onTestNotification(testItem);
    setHistory(getStoredNotificationHistory());
    setTestSuccess(true);
    setTimeout(() => setTestSuccess(false), 3000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 overflow-y-auto"
    >
      <div 
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] overflow-hidden text-[#111111]"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Notificações
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              Alertas de perturbações e trânsito.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#E6E6E3] px-4 bg-[#FFFFFF]">
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'border-[#111111] text-[#111111]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            Definições
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-[#111111] text-[#111111]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            <span>Histórico</span>
            {history.length > 0 && (
              <span className="font-['Barlow_Condensed'] font-bold text-xs tabular-nums text-[#6B6B6B]">
                ({history.length})
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'settings' ? (
            <>
              {/* Master toggle */}
              <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3] flex items-center justify-between">
                <div className="min-w-0 pr-3">
                  <div className="text-sm font-semibold text-[#111111]">Receber avisos</div>
                  <div className="text-xs text-[#6B6B6B] leading-snug">Greves, perturbações e ocorrências graves nos distritos que escolheres.</div>
                </div>

                <button
                  onClick={handleToggleEnabled}
                  role="switch"
                  aria-checked={prefs.enabled}
                  aria-label={prefs.enabled ? 'Desligar avisos' : 'Ligar avisos'}
                  className={`shrink-0 relative w-[52px] h-[30px] rounded-full transition-colors cursor-pointer ${
                    prefs.enabled ? 'bg-[#111111]' : 'bg-[#D6D6D2]'
                  }`}
                >
                  <span className={`absolute top-[3px] w-6 h-6 rounded-full bg-[#FFFFFF] shadow transition-all ${prefs.enabled ? 'left-[25px]' : 'left-[3px]'}`} />
                </button>
              </div>
              {permissionState === 'denied' && (
                <div className="p-3 rounded-[8px] border border-[#F3C5C1] bg-[#FDF2F1] text-xs text-[#111111] leading-snug">
                  As notificações estão bloqueadas para a PAROU. Para as receberes, permite-as nas definições do browser
                  (cadeado ao lado do endereço) ou do telemóvel e volta a ligar aqui.
                </div>
              )}
              {permissionState === 'unsupported' && (
                <div className="p-3 rounded-[8px] bg-[#F4F4F2] text-xs text-[#6B6B6B] leading-snug">
                  Este browser não suporta notificações. No iPhone, adiciona a PAROU ao ecrã principal (Partilhar › Adicionar ao ecrã principal) e abre-a a partir daí.
                </div>
              )}

              {/* Districts selector */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-[#111111]">Distritos que te interessam</div>
                <div className="flex flex-wrap gap-1.5">
                  {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((city) => {
                    const isSelected = (prefs.districts || []).includes(city);
                    return (
                      <button
                        key={city}
                        onClick={() => handleToggleDistrict(city)}
                        className={`px-2.5 py-1 rounded-[6px] text-xs font-semibold transition-colors cursor-pointer min-h-[32px] ${
                          isSelected
                            ? 'bg-[#111111] text-[#FFFFFF]'
                            : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                        }`}
                      >
                        {city}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Test button */}
              <div className="pt-2 border-t border-[#E6E6E3]">
                <button
                  onClick={handleRunTest}
                  className="px-3 py-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-xs font-semibold text-[#111111] cursor-pointer min-h-[44px]"
                >
                  {testSuccess ? 'Enviada — deve chegar em segundos' : 'Testar notificação'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#6B6B6B]">
                  {history.length} {history.length === 1 ? 'notificação' : 'notificações'}
                </span>
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="flex items-center gap-1 text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 stroke-[2]" />
                    <span>Limpar histórico</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#6B6B6B]">
                  Sem histórico de notificações.
                </div>
              ) : (
                <div className="border border-[#E6E6E3] rounded-[8px] divide-y divide-[#E6E6E3]">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        onClose();
                        if (item.occurrenceId) {
                          onViewReport(item.occurrenceId);
                        }
                      }}
                      className="p-3 hover:bg-[#F4F4F2] transition-colors cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#111111] truncate">{item.title}</span>
                        <span className="font-['Barlow_Condensed'] text-[#6B6B6B] tabular-nums shrink-0">
                          {new Date(item.timestamp).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#6B6B6B] line-clamp-1">{item.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E6E6E3] bg-[#FFFFFF] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#111111] text-[#FFFFFF] text-xs font-semibold rounded-[8px] min-h-[44px] cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

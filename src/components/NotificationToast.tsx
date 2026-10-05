import React, { useEffect } from 'react';
import { 
  Bell, 
  X, 
  ExternalLink, 
  AlertTriangle, 
  Train, 
  Bus, 
  Car, 
  Zap, 
  Users, 
  Wrench, 
  AlertCircle 
} from 'lucide-react';
import { NotificationLogItem, OccurrenceType } from '../types';

interface NotificationToastProps {
  notification: NotificationLogItem | null;
  onClose: () => void;
  onViewReport: (reportId: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notification,
  onClose,
  onViewReport,
}) => {
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      onClose();
    }, 7000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const getCategoryIcon = (type?: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return <Car className="w-5 h-5 text-red-400" />;
      case 'ATRASOS':
        return <Bus className="w-5 h-5 text-amber-400" />;
      case 'AVARIA':
        return <Zap className="w-5 h-5 text-yellow-400" />;
      case 'GREVE':
        return <Users className="w-5 h-5 text-blue-400" />;
      case 'OBRAS':
        return <Wrench className="w-5 h-5 text-cyan-400" />;
      case 'CORTE':
        return <AlertTriangle className="w-5 h-5 text-rose-400" />;
      case 'SERVICO_PUBLICO':
        return <Train className="w-5 h-5 text-purple-400" />;
      default:
        return <Bell className="w-5 h-5 text-amber-400" />;
    }
  };

  return (
    <aside
      aria-label="Notificação do sistema"
      className="fixed top-20 right-3 sm:right-6 z-50 max-w-sm sm:max-w-md w-full animate-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="relative rounded-2xl bg-[#0c1424]/95 border border-blue-500/40 p-4 shadow-2xl shadow-blue-500/20 backdrop-blur-md">
        {/* Glow ambient highlight */}
        <div className="absolute -top-1 -right-1 w-16 h-16 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />

        <div className="flex items-start gap-3">
          {/* Icon Badge */}
          <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 shadow-inner">
            {getCategoryIcon(notification.type)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                Alerta PAROU.PT
              </span>
              {notification.district && (
                <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.2 rounded bg-slate-800">
                  {notification.district}
                </span>
              )}
            </div>

            <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
              {notification.title}
            </h4>

            <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 mt-0.5 leading-snug">
              {notification.body}
            </p>

            {notification.reportId && (
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={() => {
                    if (notification.reportId) {
                      onViewReport(notification.reportId);
                    }
                    onClose();
                  }}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <span>Ver Ocorrência</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
                <button
                  onClick={onClose}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-medium text-xs transition-colors cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/80 transition-colors"
            aria-label="Fechar notificação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

import React, { useEffect } from 'react';
import { 
  Bell, 
  X, 
  ChevronRight
} from 'lucide-react';
import { NotificationLogItem } from '../types';
import { t } from '../i18n';

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
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  return (
    <aside
      aria-label={t('Notificação')}
      className="fixed top-20 right-3 sm:right-6 z-50 max-w-sm w-full"
    >
      <div className="relative rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] p-3.5 shadow-md text-[#111111]">
        <button
          onClick={onClose}
          aria-label={t('Fechar')}
          className="absolute top-2.5 right-2.5 p-1 text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
        >
          <X className="w-4 h-4 stroke-[2]" />
        </button>

        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-[6px] bg-[#F4F4F2] border border-[#E6E6E3] flex items-center justify-center shrink-0 text-[#111111]">
            <Bell className="w-4 h-4 stroke-[2]" />
          </div>

          <div className="flex-1 min-w-0 pr-4">
            <h4 className="text-xs font-bold text-[#111111] truncate">
              {notification.title}
            </h4>
            <p className="text-xs text-[#6B6B6B] mt-0.5 line-clamp-2">
              {notification.body}
            </p>

            {notification.reportId && (
              <button
                onClick={() => {
                  if (notification.reportId) {
                    onViewReport(notification.reportId);
                    onClose();
                  }
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#111111] hover:underline cursor-pointer"
              >
                <span>{t('Ver ocorrência')}</span>
                <ChevronRight className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

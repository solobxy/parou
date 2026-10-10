import React, { useState, useEffect } from 'react';
import { Radio, WifiOff, AlertTriangle } from 'lucide-react';
import { t } from '../i18n';

interface LiveSyncBarProps {
  lastUpdated: Date;
  totalAlertsCount: number;
  severeCount: number;
  districtsWithAlertsCount: number;
  verifiedCount: number;
  isSyncing?: boolean;
  publicCount?: number;
  onOpenPublicSourcesModal?: () => void;
  isOffline?: boolean;
  offlineCount?: number;
}

export const LiveSyncBar: React.FC<LiveSyncBarProps> = ({
  lastUpdated,
  totalAlertsCount,
  severeCount,
  districtsWithAlertsCount,
  isSyncing = false,
  publicCount,
  onOpenPublicSourcesModal,
  isOffline = false,
}) => {
  const [relativeTime, setRelativeTime] = useState('agora mesmo');

  useEffect(() => {
    const updateRelative = () => {
      const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (diffSec < 15) {
        setRelativeTime('agora mesmo');
      } else if (diffSec < 60) {
        setRelativeTime(t('há {n} s', { n: diffSec }));
      } else {
        const mins = Math.floor(diffSec / 60);
        setRelativeTime(t('há {n} min', { n: mins }));
      }
    };

    updateRelative();
    const interval = setInterval(updateRelative, 10000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const formattedTime = lastUpdated.toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="w-full max-w-full overflow-hidden rounded-[8px] border border-[#E6E6E3] bg-[#F4F4F2] px-3 sm:px-3.5 py-1.5 sm:py-2 mb-2.5 sm:mb-3.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
      {/* Left side: Live indicator and timestamp */}
      <div className="flex items-center gap-3">
        {isOffline ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B6B6B]">
            <WifiOff className="w-4 h-4 stroke-[2]" />
            <span>{t('Offline')}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#C2410C]">
            <Radio className="w-4 h-4 stroke-[2]" />
            <span>{t('Tempo real')}</span>
          </div>
        )}

        <div className="h-3 w-px bg-[#E6E6E3]" />

        <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
          <span className="hidden sm:inline">{t('Atualizado:')}</span>
          <span className="font-condensada font-bold text-[#111111] tabular-nums text-xs">
            <span className="sm:hidden">{formattedTime.slice(0, 5)}</span>
            <span className="hidden sm:inline">{formattedTime}</span>
          </span>
          <span className="hidden sm:inline">({relativeTime})</span>
        </div>

        {isSyncing && !isOffline && (
          <span className="text-xs text-[#6B6B6B]">
            {t('• A sincronizar...')}
          </span>
        )}
      </div>

      {/* Right side: Alert stats */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-[#6B6B6B]">{t('Ocorrências:')}</span>
          <span className="font-condensada font-bold text-[#111111] tabular-nums text-sm">
            {totalAlertsCount}
          </span>
        </div>

        {severeCount > 0 && (
          <div className="flex items-center gap-1 text-[#D92D20] font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 stroke-[2]" />
            <span className="font-condensada font-bold tabular-nums text-sm">
              {severeCount}
            </span>
          </div>
        )}

        {districtsWithAlertsCount > 0 && (
          <div className="hidden md:flex items-center gap-1.5 text-[#6B6B6B]">
            <span>{t('Distritos:')}</span>
            <span className="font-condensada font-bold text-[#111111] tabular-nums text-sm">
              {districtsWithAlertsCount}
            </span>
          </div>
        )}

        {publicCount !== undefined && publicCount > 0 && onOpenPublicSourcesModal && (
          <button
            onClick={onOpenPublicSourcesModal}
            className="text-xs text-[#111111] underline-offset-2 hover:underline font-semibold cursor-pointer min-h-[32px] px-1"
          >
            {t('Fontes públicas')}
          </button>
        )}
      </div>
    </div>
  );
};

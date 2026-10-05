import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Radio, AlertTriangle, ShieldCheck, MapPin, CheckCircle2, Database } from 'lucide-react';

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
  verifiedCount,
  isSyncing = false,
  publicCount,
  onOpenPublicSourcesModal,
  isOffline = false,
  offlineCount,
}) => {
  const [relativeTime, setRelativeTime] = useState('agora mesmo');
  const [justUpdatedAnimation, setJustUpdatedAnimation] = useState(false);

  // Trigger brief visual pulse when lastUpdated changes
  useEffect(() => {
    setJustUpdatedAnimation(true);
    const timer = setTimeout(() => setJustUpdatedAnimation(false), 2000);
    return () => clearTimeout(timer);
  }, [lastUpdated]);

  // Client-side timer to update "agora mesmo" / "há X min" without ANY backend requests
  useEffect(() => {
    const updateRelative = () => {
      const diffSec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);
      if (diffSec < 15) {
        setRelativeTime('agora mesmo');
      } else if (diffSec < 60) {
        setRelativeTime(`há ${diffSec}s`);
      } else {
        const mins = Math.floor(diffSec / 60);
        setRelativeTime(`há ${mins} min`);
      }
    };

    updateRelative();
    const interval = setInterval(updateRelative, 10000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Format exact timestamp HH:mm:ss
  const formattedTime = lastUpdated.toLocaleTimeString('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className={`w-full max-w-full overflow-hidden rounded-2xl border transition-all duration-300 px-3 sm:px-4 py-2 sm:py-2.5 mb-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 ${
        isOffline
          ? 'bg-amber-950/40 border-amber-600/50 shadow-md shadow-amber-950/30'
          : justUpdatedAnimation
          ? 'bg-blue-950/70 border-blue-500/80 shadow-lg shadow-blue-500/20'
          : 'bg-[#090e1a]/80 border-slate-800/80 shadow-md'
      }`}
    >
      {/* Left side: Live beacon and timestamp */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {isOffline ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5 inline text-amber-400" />
              <span>Modo Offline</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 inline animate-pulse" />
              <span>Tempo Real</span>
            </span>
          </div>
        )}

        <div className="h-3 w-px bg-slate-800 hidden sm:block" />

        <div className="flex items-center gap-1.5 text-slate-300 text-xs">
          <span className="text-slate-400 font-medium">
            {isOffline ? 'Cache guardada:' : 'Atualizado:'}
          </span>
          <span className="font-bold text-white font-mono bg-slate-800/90 px-2 py-0.5 rounded-md border border-slate-700/60 text-[11px] sm:text-xs">
            {formattedTime}
          </span>
          <span className="text-[11px] text-slate-400 italic hidden sm:inline">
            ({relativeTime})
          </span>
        </div>

        {isSyncing && !isOffline && (
          <span className="text-[10px] text-blue-400 animate-pulse font-medium">
            • A sincronizar...
          </span>
        )}

        {isOffline && (
          <span className="text-[11px] text-amber-300/80 flex items-center gap-1 font-medium hidden md:inline-flex">
            <Database className="w-3 h-3 text-amber-400" />
            <span>IndexedDB ativo</span>
          </span>
        )}
      </div>

      {/* Right side: Real-time dynamic counters */}
      <div className="flex items-center gap-2 sm:gap-3 text-xs overflow-x-auto py-0.5 no-scrollbar">
        {/* Total reports */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200">
          {isOffline ? <Database className="w-3 h-3 text-amber-400" /> : <Wifi className="w-3 h-3 text-blue-400" />}
          <span className="text-slate-400 text-[11px]">{isOffline ? 'Offline:' : 'Total:'}</span>
          <strong className="text-white font-bold">{totalAlertsCount}</strong>
        </div>

        {/* Severe alerts */}
        {severeCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            <span className="text-red-400 text-[11px]">Graves:</span>
            <strong className="text-white font-bold">{severeCount}</strong>
          </div>
        )}

        {/* Districts with alerts */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200">
          <MapPin className="w-3 h-3 text-amber-400" />
          <span className="text-slate-400 text-[11px]">Distritos:</span>
          <strong className="text-white font-bold">{districtsWithAlertsCount}</strong>
        </div>

        {/* Community Verified */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 hidden md:flex">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400/80 text-[11px]">Validados:</span>
          <strong className="text-emerald-200 font-bold">{verifiedCount}</strong>
        </div>

        {/* Public Sources Pill */}
        {publicCount !== undefined && (
          <button
            onClick={onOpenPublicSourcesModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 transition-all cursor-pointer"
            title="Ver Fontes Públicas & Dados Oficiais"
          >
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400/80 text-[11px]">Oficiais:</span>
            <strong className="text-emerald-200 font-bold">{publicCount}</strong>
          </button>
        )}
      </div>
    </div>
  );
};

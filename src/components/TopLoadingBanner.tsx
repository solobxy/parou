import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingStatus {
  isLoading: boolean;
  totalOperators: number;
  loadedOperators: number;
  currentOperator: string;
  message: string;
}

export const TopLoadingBanner: React.FC = () => {
  const [status, setStatus] = useState<LoadingStatus | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/transit/loading-status', {
          headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as LoadingStatus;
        if (isMounted) {
          setStatus(data);
        }
      } catch {}
    };

    checkStatus();

    const interval = setInterval(() => {
      checkStatus();
    }, status?.isLoading ? 2500 : 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [status?.isLoading]);

  if (!status || !status.isLoading || status.totalOperators === 0 || status.loadedOperators >= status.totalOperators) {
    return null;
  }

  return (
    <div className="fixed top-3 right-4 z-50 pointer-events-none transition-all duration-300">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] text-[#111111] border border-[#E6E6E3] shadow-sm text-xs font-medium">
        <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[2] shrink-0 text-[#111111]" />
        <span>
          A atualizar dados · <strong className="font-['Barlow_Condensed'] font-bold tabular-nums">{status.loadedOperators}/{status.totalOperators}</strong>
        </span>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

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

    // Initial check
    checkStatus();

    // Fast polling while loading, slow polling when idle
    const interval = setInterval(() => {
      checkStatus();
    }, status?.isLoading ? 2500 : 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [status?.isLoading]);

  // Requirement 4: Indicador pequeno que desaparece quando acabar
  if (!status || !status.isLoading || status.totalOperators === 0 || status.loadedOperators >= status.totalOperators) {
    return null;
  }

  return (
    <div className="fixed top-3 right-4 z-50 pointer-events-none transition-all duration-300">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/90 text-slate-200 border border-slate-700/80 shadow-lg backdrop-blur-md text-xs font-medium tracking-wide">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
        <span>
          A atualizar dados · {status.loadedOperators}/{status.totalOperators}
        </span>
      </div>
    </div>
  );
};

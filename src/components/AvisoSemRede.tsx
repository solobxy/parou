import React from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Aviso discreto quando o telemóvel fica sem internet (a app continua a mostrar a última
 * informação que tinha) e uma confirmação curta quando a ligação volta.
 */
export const AvisoSemRede: React.FC = () => {
  const [semRede, setSemRede] = React.useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [voltou, setVoltou] = React.useState(false);

  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = () => { setSemRede(true); setVoltou(false); };
    const on = () => {
      setSemRede((antes) => {
        if (antes) {
          setVoltou(true);
          if (t) clearTimeout(t);
          t = setTimeout(() => setVoltou(false), 3000);
        }
        return false;
      });
    };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => {
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
      if (t) clearTimeout(t);
    };
  }, []);

  if (!semRede && !voltou) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[45] bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-5 max-w-[calc(100%-32px)]"
    >
      <div className={`flex items-center gap-2 rounded-full px-4 h-10 text-[13px] font-semibold shadow-lg ${semRede ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#1F7A3A] text-[#FFFFFF]'}`}>
        {semRede ? <WifiOff className="w-4 h-4 shrink-0" /> : <Wifi className="w-4 h-4 shrink-0" />}
        <span className="truncate">{semRede ? 'Sem internet · a mostrar a última informação' : 'Ligação de volta'}</span>
      </div>
    </div>
  );
};

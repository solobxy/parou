import React from 'react';
import { Navigation, AlertTriangle, Clock } from 'lucide-react';

interface NotFoundViewProps {
  onNavigateHome: () => void;
  onNavigateTab: (tab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas') => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onNavigateHome, onNavigateTab }) => {
  return (
    <main className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12 text-center" role="main">
      <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#111111] tracking-tight">
          Página não encontrada
        </h1>

        <p className="text-xs text-[#6B6B6B] mt-2">
          Este endereço não existe ou mudou de sítio.
        </p>

        {/* Primary Action: Brand chamfer */}
        <div className="mt-6 space-y-2">
          <button
            onClick={onNavigateHome}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-xs min-h-[44px] cursor-pointer"
          >
            <Navigation className="w-4 h-4 stroke-[2]" />
            <span>Ir para o início</span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => onNavigateTab('alertas')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 stroke-[2]" />
              <span>Alertas</span>
            </button>

            <button
              onClick={() => onNavigateTab('horarios')}
              className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 stroke-[2]" />
              <span>Horários</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};

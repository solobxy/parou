import React from 'react';
import { MapPin, AlertTriangle, Compass, Clock, Star } from 'lucide-react';

export type MobileTab = 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'alertas' | 'catalogo' | 'filtros' | 'reclamacoes';

interface MobileNavProps {
  activeMobileView: MobileTab;
  onMobileViewChange: (view: MobileTab) => void;
  onOpenReportModal: () => void;
  totalAlertsCount: number;
  activeFiltersCount?: number;
  favoritesCount?: number;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeMobileView,
  onMobileViewChange,
  onOpenReportModal,
  totalAlertsCount,
  activeFiltersCount = 0,
  favoritesCount = 0,
}) => {
  return (
    <nav 
      aria-label="Navegação inferior mobile"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#070b13]/95 backdrop-blur-xl border-t border-slate-800/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_25px_rgba(0,0,0,0.6)] w-full max-w-full overflow-hidden"
    >
      <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
        {/* 1. MAPA */}
        <button
          onClick={() => onMobileViewChange('mapa')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center transition-all ${
            activeMobileView === 'mapa' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Ver Mapa"
        >
          <MapPin className={`w-5 h-5 ${activeMobileView === 'mapa' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-semibold mt-1 tracking-tight">Mapa</span>
        </button>

        {/* 2. REPORTS */}
        <button
          onClick={() => onMobileViewChange('reports')}
          className={`min-h-[44px] min-w-[44px] relative flex flex-col items-center justify-center transition-all ${
            activeMobileView === 'reports' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Ver Reports"
        >
          <AlertTriangle className={`w-5 h-5 ${activeMobileView === 'reports' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-semibold mt-1 tracking-tight">Reports</span>
          {totalAlertsCount > 0 && (
            <span className="absolute top-1 right-3 sm:right-5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
              {totalAlertsCount > 9 ? '9+' : totalAlertsCount}
            </span>
          )}
        </button>

        {/* 3. PERTO (Substitui o botão + com experiência de GPS, Radar e Paragens) */}
        <button
          onClick={() => onMobileViewChange('perto')}
          className={`min-h-[44px] min-w-[44px] relative flex flex-col items-center justify-center transition-all ${
            activeMobileView === 'perto' ? 'text-cyan-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Aba Perto - Localização e Transportes Próximos"
        >
          <div className="relative">
            <Compass className={`w-5 h-5 ${activeMobileView === 'perto' ? 'stroke-[2.5] text-cyan-400 animate-spin-slow' : ''}`} />
            {activeMobileView === 'perto' && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            )}
          </div>
          <span className="text-[10px] font-bold mt-1 tracking-tight">Perto</span>
        </button>

        {/* 4. HORÁRIOS */}
        <button
          onClick={() => onMobileViewChange('horarios')}
          className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center transition-all ${
            activeMobileView === 'horarios' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Ver Horários"
        >
          <Clock className={`w-5 h-5 ${activeMobileView === 'horarios' ? 'stroke-[2.5]' : ''}`} />
          <span className="text-[10px] font-semibold mt-1 tracking-tight">Horários</span>
        </button>

        {/* 5. FAVORITOS (Substitui Filtros na hotbar: MAPA | REPORTS | PERTO | HORÁRIOS | FAVORITOS) */}
        <button
          onClick={() => onMobileViewChange('favoritos')}
          className={`min-h-[44px] min-w-[44px] relative flex flex-col items-center justify-center transition-all ${
            activeMobileView === 'favoritos' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
          aria-label="Ver Favoritos"
        >
          <div className="relative">
            <Star className={`w-5 h-5 ${activeMobileView === 'favoritos' ? 'stroke-[2.5] text-amber-400 fill-amber-400/20' : ''}`} />
          </div>
          <span className="text-[10px] font-semibold mt-1 tracking-tight">Favoritos</span>
          {favoritesCount > 0 && (
            <span className="absolute top-1 right-3 sm:right-5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-slate-950 shadow-sm">
              {favoritesCount > 9 ? '9+' : favoritesCount}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};

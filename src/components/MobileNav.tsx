import React from 'react';
import { MapPin, TriangleAlert, Compass, Clock, Star, Users } from 'lucide-react';
import { t } from '../i18n';

export type MobileTab = 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'alertas' | 'catalogo' | 'filtros' | 'reclamacoes' | 'comunidade';

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
  favoritesCount = 0,
}) => {
  const tabs: Array<{ id: MobileTab; label: string; icon: React.ElementType; count?: number }> = [
    { id: 'mapa' as MobileTab, label: 'Mapa', icon: MapPin },
    { id: 'alertas' as MobileTab, label: 'Alertas', icon: TriangleAlert },
    { id: 'perto' as MobileTab, label: 'Perto', icon: Compass },
    { id: 'horarios' as MobileTab, label: 'Horários', icon: Clock },
    { id: 'comunidade' as MobileTab, label: 'Comunidade', icon: Users },
    { id: 'favoritos' as MobileTab, label: 'Favoritos', icon: Star, count: favoritesCount },
  ];

  return (
    <nav
      aria-label={t('Navegação inferior')}
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E6E6E3] pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.04)] w-full overflow-hidden"
    >
      <div className="grid grid-cols-6 items-center h-16 max-w-lg mx-auto px-0 min-[360px]:px-1 gap-0 min-[360px]:gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // As ocorrências da comunidade vivem dentro do Mapa
          const isActive = activeMobileView === tab.id || (tab.id === 'mapa' && activeMobileView === 'reports');

          return (
            <button
              key={tab.id}
              onClick={() => onMobileViewChange(tab.id)}
              className={`min-h-[48px] min-w-0 flex flex-col items-center justify-center transition-colors relative cursor-pointer ${
                isActive
                  ? 'bg-[#FF6B1A] text-[#111111] font-bold rounded-[8px] brand-chamfer py-1'
                  : 'text-[#6B6B6B] hover:text-[#111111] py-1'
              }`}
              aria-label={t(tab.label)}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                <Icon className="w-5 h-5 stroke-[2]" />
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`absolute -top-1 -right-2 flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#D92D20] text-[#FFFFFF]'
                    }`}
                  >
                    {tab.count > 9 ? '9+' : tab.count}
                  </span>
                )}
              </div>
              <span className={`text-[10px] min-[360px]:text-[10.5px] mt-0.5 tracking-tight max-w-full ${isActive ? 'font-bold text-[#111111]' : 'font-medium text-[#6B6B6B]'}`}>
                {t(tab.label)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

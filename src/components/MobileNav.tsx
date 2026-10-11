import React from 'react';
import { TriangleAlert, Newspaper, Compass, Clock, Users } from 'lucide-react';
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
}) => {
  // Ordem: o que se usa mais, à esquerda. Os Favoritos vivem dentro do Perto (estrela no topo do Perto).
  const tabs: Array<{ id: MobileTab; label: string; icon: React.ElementType }> = [
    { id: 'perto' as MobileTab, label: 'Perto', icon: Compass },
    { id: 'horarios' as MobileTab, label: 'Horários', icon: Clock },
    { id: 'mapa' as MobileTab, label: 'Alertas', icon: TriangleAlert },
    { id: 'alertas' as MobileTab, label: 'Notícias', icon: Newspaper },
    { id: 'comunidade' as MobileTab, label: 'Comunidade', icon: Users },
  ];

  return (
    <nav
      aria-label={t('Navegação inferior')}
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] border-t border-[#E6E6E3] pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.04)] w-full overflow-hidden"
    >
      <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-0 min-[360px]:px-1 gap-0 min-[360px]:gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          // As ocorrências da comunidade vivem dentro do Mapa e os Favoritos dentro do Perto
          const isActive = activeMobileView === tab.id
            || (tab.id === 'mapa' && activeMobileView === 'reports')
            || (tab.id === 'perto' && activeMobileView === 'favoritos');

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

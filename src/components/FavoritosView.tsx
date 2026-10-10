import React, { useState, useMemo } from 'react';
import { 
  Star, 
  MapPin, 
  Search, 
  Trash2, 
  Plus, 
  Radio, 
  ChevronRight
} from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
import { FavoriteItem, FavoriteCategory } from '../types/favorites';
import { INITIAL_TRANSIT_CATALOG } from '../data/nationalTransitCatalog';
import { CIDADES_OPTIONS } from '../data/mockData';
import { LineChip } from './LineChip';
import { InstalarApp } from './InstalarApp';
import { formatTransitName, parseDepartureTime } from '../utils/transitFormatter';
import { t } from '../i18n';

interface FavoritosViewProps {
  onOpenLoginModal: () => void;
  onNavigateToPertoWithDestination?: (dest: { title: string; lat: number; lon: number }) => void;
  onNavigateToHorariosLine?: (lineCode: string, operatorName?: string) => void;
  onNavigateToMap?: () => void;
}

export const FavoritosView: React.FC<FavoritosViewProps> = ({
  onNavigateToPertoWithDestination,
  onNavigateToHorariosLine,
}) => {
  const {
    filteredFavorites,
    countsByCategory,
    activeCategory,
    setActiveCategory,
    removeFavorite,
    addFavorite,
    liveStatuses,
  } = useFavorites();

  const [searchQuery, setSearchQuery] = useState('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState('');

  const displayedFavorites = useMemo(() => {
    let list = filteredFavorites;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.subtitle?.toLowerCase().includes(q) ||
          f.operatorName?.toLowerCase().includes(q) ||
          f.lineCode?.toLowerCase().includes(q) ||
          f.locality?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filteredFavorites, searchQuery]);

  const quickAddSuggestions = useMemo(() => {
    if (!quickAddSearch.trim() || quickAddSearch.length < 2) return [];
    const q = quickAddSearch.toLowerCase();
    const suggestions: Omit<FavoriteItem, 'addedAt'>[] = [];

    for (const op of INITIAL_TRANSIT_CATALOG) {
      const opName = op.short_name || op.official_name;
      if (
        opName.toLowerCase().includes(q) ||
        op.official_name.toLowerCase().includes(q) ||
        op.region.toLowerCase().includes(q)
      ) {
        suggestions.push({
          id: `op-${op.id}`,
          type: 'operador',
          category: 'transportes',
          title: opName,
          subtitle: `Operador · ${op.region}`,
          operatorId: op.id,
          operatorName: opName,
          locality: op.region,
        });
        if (suggestions.length >= 8) break;
      }
    }

    for (const cidade of CIDADES_OPTIONS) {
      if (cidade.toLowerCase().includes(q)) {
        suggestions.push({
          id: `city-${cidade.toLowerCase().replace(/\s+/g, '-')}`,
          type: 'cidade',
          category: 'locais',
          title: cidade,
          subtitle: 'Cidade',
          locality: cidade,
        });
        if (suggestions.length >= 12) break;
      }
    }

    return suggestions;
  }, [quickAddSearch]);

  const handleItemClick = (item: FavoriteItem) => {
    if (item.category === 'paragens' && item.latitude && item.longitude && onNavigateToPertoWithDestination) {
      onNavigateToPertoWithDestination({
        title: item.title,
        lat: item.latitude,
        lon: item.longitude,
      });
      return;
    }

    if (item.lineCode && onNavigateToHorariosLine) {
      onNavigateToHorariosLine(item.lineCode, item.operatorName);
      return;
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto py-2 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-row items-center justify-between gap-3 border-b border-[#E6E6E3] pb-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            {t('Favoritos')}
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            {t('As tuas paragens e linhas guardadas.')}
          </p>
        </div>

        <button
          onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
          className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{t('Adicionar')}</span>
        </button>
      </div>

      {/* Instalar no ecrã principal (só aparece quando faz sentido) */}
      <InstalarApp />

      {/* Quick Add Search Panel */}
      {isQuickAddOpen && (
        <div className="p-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] space-y-2">
          <input
            type="text"
            value={quickAddSearch}
            onChange={(e) => setQuickAddSearch(e.target.value)}
            placeholder={t('Pesquisar operador ou cidade...')}
            className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
            autoFocus
          />

          {quickAddSuggestions.length > 0 && (
            <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] max-h-48 overflow-y-auto">
              {quickAddSuggestions.map((sug) => (
                <div
                  key={sug.id}
                  className="p-2.5 flex items-center justify-between gap-2 hover:bg-[#F4F4F2] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[#111111] truncate">{sug.title}</div>
                    <div className="text-xs text-[#6B6B6B] truncate">{sug.subtitle}</div>
                  </div>
                  <button
                    onClick={() => {
                      addFavorite(sug);
                      setIsQuickAddOpen(false);
                      setQuickAddSearch('');
                    }}
                    className="px-2.5 py-1 bg-[#111111] text-[#FFFFFF] rounded-[6px] text-xs font-semibold cursor-pointer min-h-[32px]"
                  >
                    {t('Guardar')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-1 border-b border-[#E6E6E3] pb-1 overflow-x-auto">
        {(['todos', 'paragens', 'transportes', 'locais'] as (FavoriteCategory | 'todos')[]).map((cat) => {
          const isActive = activeCategory === cat;
          const count = countsByCategory[cat] || 0;
          const label = t(cat === 'todos' ? 'Todos' : cat === 'paragens' ? 'Paragens' : cat === 'transportes' ? 'Linhas' : 'Locais');
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
        {displayedFavorites.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Star className="w-8 h-8 mx-auto text-[#6B6B6B] stroke-[1.75]" aria-hidden="true" />
            {(countsByCategory['todos'] || 0) === 0 ? (
              <>
                <div className="mt-3 text-[15px] font-semibold text-[#111111]">{t('Ainda não guardaste nada')}</div>
                <p className="mt-1 text-sm text-[#6B6B6B] max-w-[30ch] mx-auto">
                  {t('Toca na estrela de uma paragem ou linha e ela fica aqui, sempre à mão.')}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-[#6B6B6B]">{t('Nada guardado neste separador.')}</p>
            )}
          </div>
        ) : (
          displayedFavorites.map((item) => {
            const live = liveStatuses.get(item.id);

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className="p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.lineCode ? (
                    <LineChip number={item.lineCode} color={item.lineColor} />
                  ) : (
                    <div className="w-8 h-7 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-[#111111] stroke-[2]" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#111111] truncate">
                      {formatTransitName(item.title)}
                    </h3>
                    <p className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                      {formatTransitName(item.operatorName || item.locality || item.subtitle)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {live && live.nextDepartureTime && (() => {
                    const parsed = parseDepartureTime({
                      time: live.nextDepartureTime,
                      isRealtime: live.isRealtime,
                    });
                    return (
                      <div className="flex flex-col items-end text-right">
                        <div className="flex items-center gap-1">
                          {parsed.isRealtime && (
                            <Radio 
                              className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                              style={{ color: parsed.textColor }} 
                            />
                          )}
                          <span 
                            className={`font-condensada text-base font-bold tabular-nums leading-none ${parsed.textColorClass}`}
                            style={{ color: parsed.textColor }}
                          >
                            {parsed.bigText}
                          </span>
                        </div>
                        {parsed.exactTime && (
                          <span className="font-condensada text-[11px] text-[#6B6B6B] tabular-nums mt-0.5">
                            {parsed.exactTime}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(item.id);
                    }}
                    className="p-2 text-[#6B6B6B] hover:text-[#D92D20] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title={t('Remover')}
                  >
                    <Trash2 className="w-4 h-4 stroke-[2]" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

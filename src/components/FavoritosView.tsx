import React, { useState, useMemo } from 'react';
import { 
  Star, 
  Bus, 
  Train, 
  Ship, 
  MapPin, 
  Clock, 
  Navigation, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  ArrowRight, 
  Sparkles, 
  Layers, 
  CheckCircle2, 
  ExternalLink, 
  Trash2, 
  Compass, 
  UserCheck, 
  Plus, 
  Radio, 
  Gauge, 
  Building,
  Footprints
} from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
import { FavoriteItem, FavoriteCategory, FavoriteLiveStatus } from '../types/favorites';
import { INITIAL_TRANSIT_CATALOG } from '../data/nationalTransitCatalog';
import { CIDADES_OPTIONS } from '../data/mockData';

interface FavoritosViewProps {
  onOpenLoginModal: () => void;
  onNavigateToPertoWithDestination?: (dest: { title: string; lat: number; lon: number }) => void;
  onNavigateToHorariosLine?: (lineCode: string, operatorName?: string) => void;
  onNavigateToMap?: () => void;
}

export const FavoritosView: React.FC<FavoritosViewProps> = ({
  onOpenLoginModal,
  onNavigateToPertoWithDestination,
  onNavigateToHorariosLine,
  onNavigateToMap,
}) => {
  const {
    favorites,
    filteredFavorites,
    countsByCategory,
    activeCategory,
    setActiveCategory,
    removeFavorite,
    addFavorite,
    totalCount,
    isAuthenticated,
    userEmail,
    liveStatuses,
    isLoadingLive,
    lastRefreshed,
    refreshLiveStatuses,
  } = useFavorites();

  const [searchQuery, setSearchQuery] = useState('');
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddSearch, setQuickAddSearch] = useState('');

  // 1. Search inside current favorites
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

  // 2. Quick Add Suggestions (Operators & Cities)
  const quickAddSuggestions = useMemo(() => {
    if (!quickAddSearch.trim() || quickAddSearch.length < 2) return [];
    const q = quickAddSearch.toLowerCase();
    const suggestions: Omit<FavoriteItem, 'addedAt'>[] = [];

    // Search Operators in National Transit Catalog
    for (const op of INITIAL_TRANSIT_CATALOG) {
      const opName = op.short_name || op.official_name;
      if (
        opName.toLowerCase().includes(q) ||
        op.official_name.toLowerCase().includes(q) ||
        op.region.toLowerCase().includes(q) ||
        (op.municipalities && op.municipalities.some((c: string) => c.toLowerCase().includes(q)))
      ) {
        suggestions.push({
          id: `op-${op.id}`,
          type: 'operador',
          category: 'transportes',
          title: opName,
          subtitle: `Operador • ${op.region}`,
          operatorId: op.id,
          operatorName: opName,
          locality: op.region,
        });
        if (suggestions.length >= 12) break;
      }
    }

    // Search Cities / Regiões
    for (const cidade of CIDADES_OPTIONS) {
      if (cidade.toLowerCase().includes(q)) {
        suggestions.push({
          id: `city-${cidade.toLowerCase().replace(/\s+/g, '-')}`,
          type: 'cidade',
          category: 'locais',
          title: cidade,
          subtitle: 'Cidade / Região de Portugal',
          locality: cidade,
        });
        if (suggestions.length >= 15) break;
      }
    }

    return suggestions;
  }, [quickAddSearch]);

  const getTransportIcon = (mode?: string) => {
    switch (mode) {
      case 'Metro':
        return <Train className="w-4 h-4 text-cyan-400" />;
      case 'Comboio':
        return <Train className="w-4 h-4 text-emerald-400" />;
      case 'Barco':
        return <Ship className="w-4 h-4 text-blue-400" />;
      case 'Elétrico':
        return <Train className="w-4 h-4 text-amber-400" />;
      default:
        return <Bus className="w-4 h-4 text-amber-400" />;
    }
  };

  const getCategoryBadge = (category: FavoriteCategory) => {
    switch (category) {
      case 'transportes':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Transporte</span>;
      case 'paragens':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Paragem</span>;
      case 'rotas':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Rota</span>;
      case 'locais':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Local</span>;
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-5">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0e1626] to-slate-900 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-sm">
                <Star className="w-5 h-5 fill-amber-400" />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Favoritos & Linhas Guardadas
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {totalCount} {totalCount === 1 ? 'item' : 'itens'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Acesso rápido com telemetria em tempo real, próximas partidas, perturbações e navegação ponto-a-ponto para o seu dia a dia.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => refreshLiveStatuses()}
              disabled={isLoadingLive}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-semibold text-slate-200 transition-all focus:outline-none"
              title="Atualizar dados em tempo real"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLive ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Atualizar</span>
              {lastRefreshed && (
                <span className="text-[10px] text-slate-400 font-mono">({lastRefreshed})</span>
              )}
            </button>

            <button
              onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition-all focus:outline-none"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Adicionar Favorito</span>
            </button>
          </div>
        </div>

        {/* Sync Status Indicator */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          {isAuthenticated ? (
            <div className="flex items-center gap-2 text-emerald-400 font-medium">
              <UserCheck className="w-4 h-4" />
              <span>Sincronizado na Conta ({userEmail})</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Guardado neste dispositivo (LocalStorage).</span>
              </div>
              <button
                onClick={onOpenLoginModal}
                className="text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-2 transition-colors text-left"
              >
                Inicie sessão para sincronizar com todos os seus telemóveis e PC →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Quick Add Modal / Inline Drawer */}
      {isQuickAddOpen && (
        <div className="bg-slate-900/95 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white">Pesquisa Rápida de Favoritos</h2>
            </div>
            <button
              onClick={() => setIsQuickAddOpen(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800"
            >
              Fechar ✕
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={quickAddSearch}
              onChange={(e) => setQuickAddSearch(e.target.value)}
              placeholder="Escreva paragem, operador, linha ou cidade (ex: Rossio, Metro Azul, Carris Metropolitana, Porto)..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
            />
          </div>

          {/* Suggestions List */}
          {quickAddSuggestions.length > 0 && (
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60">
              {quickAddSuggestions.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 hover:bg-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {item.category === 'transportes' ? (
                      <Bus className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : item.category === 'paragens' ? (
                      <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : (
                      <Compass className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      addFavorite(item);
                      setQuickAddSearch('');
                      setIsQuickAddOpen(false);
                    }}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-xs font-bold transition-all border border-amber-500/30"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Guardar</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {quickAddSearch.length >= 2 && quickAddSuggestions.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-3">
              Nenhum resultado encontrado para &quot;{quickAddSearch}&quot;. Experimente o nome de uma estação, operador ou cidade.
            </p>
          )}
        </div>
      )}

      {/* 3. Category Filter Tabs & In-Page Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-2 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveCategory('todos')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'todos'
                ? 'bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            Todos ({countsByCategory.todos})
          </button>
          <button
            onClick={() => setActiveCategory('transportes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'transportes'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bus className="w-3.5 h-3.5" />
            <span>Transportes ({countsByCategory.transportes})</span>
          </button>
          <button
            onClick={() => setActiveCategory('paragens')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'paragens'
                ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Paragens ({countsByCategory.paragens})</span>
          </button>
          <button
            onClick={() => setActiveCategory('rotas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'rotas'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Rotas ({countsByCategory.rotas})</span>
          </button>
          <button
            onClick={() => setActiveCategory('locais')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'locais'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Locais ({countsByCategory.locais})</span>
          </button>
        </div>

        {/* Filter input */}
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar guardados..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 focus:border-amber-400 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 4. Favorites Cards Grid */}
      {displayedFavorites.length === 0 ? (
        /* Empty State */
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400 shadow-inner">
            <Star className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-white">Nenhum favorito nesta categoria</h3>
            <p className="text-xs sm:text-sm text-slate-400">
              Guarde paragens frequentes, linhas diárias, rotas ou cidades com o ícone de estrela ⭐ no Mapa, Perto ou Horários para consultar em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5 pt-2">
            <button
              onClick={() => setIsQuickAddOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/10"
            >
              Pesquisar e Adicionar
            </button>
            {onNavigateToMap && (
              <button
                onClick={onNavigateToMap}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all border border-slate-700"
              >
                Explorar no Mapa
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {displayedFavorites.map((item) => {
            const live = liveStatuses.get(item.id);

            return (
              <div
                key={item.id}
                className="bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between shadow-lg relative group overflow-hidden"
              >
                {/* Top card accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{
                    backgroundColor: item.lineColor || (item.category === 'paragens' ? '#06b6d4' : item.category === 'rotas' ? '#a855f7' : item.category === 'locais' ? '#f59e0b' : '#3b82f6'),
                  }}
                />

                <div className="space-y-3">
                  {/* Category & Action header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {getCategoryBadge(item.category)}
                      {item.operatorName && (
                        <span className="text-[10px] text-slate-400 font-medium truncate max-w-[120px]">
                          {item.operatorName}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeFavorite(item.id)}
                      className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remover dos favoritos"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Title and transport mode */}
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 shrink-0 mt-0.5">
                      {getTransportIcon(item.transportMode)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {item.lineCode && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-black text-white shrink-0"
                            style={{ backgroundColor: item.lineColor || '#3b82f6' }}
                          >
                            {item.lineCode}
                          </span>
                        )}
                        <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                      </div>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* LIVE STATUS SECTION (Realtime info, ETA, delays, alerts) */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 space-y-2">
                    {/* Realtime ETA / Next Departure */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-300 font-semibold text-[11px]">
                          {live?.nextDepartureTime || 'Horário programado'}
                        </span>
                      </div>

                      {live?.isRealtime && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          AO VIVO
                        </span>
                      )}
                    </div>

                    {/* Service Status & Delay */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 truncate max-w-[170px]">
                        {live?.statusDescription || 'Circulação em velocidade normal'}
                      </span>
                      {live?.delayMinutes ? (
                        <span className="text-amber-400 font-bold shrink-0">
                          +{live.delayMinutes} min atraso
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-semibold shrink-0">Sem atrasos</span>
                      )}
                    </div>

                    {/* Active Alerts for this transport / stop */}
                    {live?.activeAlertsCount ? (
                      <div className="pt-1.5 border-t border-slate-800/60 flex items-start gap-1.5 text-[10px] text-red-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">
                          {live.alertsSummary?.[0] || 'Alerta de circulação ou greve ativo'}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Bottom Actions tailored to item type */}
                <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  {item.category === 'locais' ? (
                    /* Specific Requirement: "Locais favoritos devem permitir iniciar rapidamente uma rota a partir da localização atual através da aba PERTO" */
                    <button
                      onClick={() => {
                        if (onNavigateToPertoWithDestination) {
                          onNavigateToPertoWithDestination({
                            title: item.title,
                            lat: item.latitude || 38.7253,
                            lon: item.longitude || -9.15,
                          });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/15 transition-all"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Iniciar Rota no PERTO</span>
                    </button>
                  ) : item.category === 'transportes' ? (
                    <button
                      onClick={() => {
                        if (onNavigateToHorariosLine && item.lineCode) {
                          onNavigateToHorariosLine(item.lineCode, item.operatorName);
                        } else if (onNavigateToPertoWithDestination && item.latitude && item.longitude) {
                          onNavigateToPertoWithDestination({
                            title: item.title,
                            lat: item.latitude,
                            lon: item.longitude,
                          });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-colors"
                    >
                      <span>Consultar Horários & Linha</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : item.category === 'rotas' ? (
                    <button
                      onClick={() => {
                        if (onNavigateToPertoWithDestination && item.routeDestCoords) {
                          onNavigateToPertoWithDestination({
                            title: item.routeDestination || item.title,
                            lat: item.routeDestCoords.lat,
                            lon: item.routeDestCoords.lon,
                          });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-500/15 transition-all"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navegar no PERTO</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (onNavigateToPertoWithDestination && item.latitude && item.longitude) {
                          onNavigateToPertoWithDestination({
                            title: item.title,
                            lat: item.latitude,
                            lon: item.longitude,
                          });
                        }
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-cyan-600/90 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/15 transition-all"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Ver Partidas no PERTO</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

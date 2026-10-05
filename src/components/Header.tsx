import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  AlertTriangle, 
  Compass, 
  Clock, 
  Star, 
  MessageSquare, 
  Smartphone, 
  User, 
  ShieldAlert, 
  Bell, 
  Radio, 
  Database,
  ChevronDown,
  X
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { UserProfile } from '../types';

interface HeaderProps {
  activeTab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas' | 'coverage';
  onTabChange: (tab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas' | 'coverage') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenReportModal: () => void;
  onOpenLoginModal: () => void;
  currentUser?: UserProfile | null;
  onOpenUserProfileModal?: () => void;
  onOpenAdminModal?: () => void;
  pendingModerationCount?: number;
  onOpenNotificationModal?: () => void;
  isNotificationActive?: boolean;
  unreadNotificationsCount?: number;
  onOpenPublicSourcesModal?: () => void;
  publicReportsCount?: number;
  onOpenFiltersModal?: () => void;
  activeFiltersCount?: number;
  favoritesCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onOpenReportModal,
  onOpenLoginModal,
  currentUser,
  onOpenUserProfileModal,
  onOpenAdminModal,
  pendingModerationCount,
  onOpenNotificationModal,
  isNotificationActive,
  unreadNotificationsCount,
  onOpenPublicSourcesModal,
  publicReportsCount,
  onOpenFiltersModal,
  activeFiltersCount = 0,
  favoritesCount = 0,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  // Close "Mais" dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isMoreTabActive = ['favoritos', 'alertas', 'catalogo', 'reclamacoes', 'coverage'].includes(activeTab);

  const getMoreTabLabel = () => {
    switch (activeTab) {
      case 'favoritos': return 'Favoritos';
      case 'alertas': return 'Alertas';
      case 'catalogo': return 'Catálogo';
      case 'reclamacoes': return 'Reclamações';
      case 'coverage': return 'Cobertura';
      default: return 'Mais';
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#080c14]/95 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8 gap-2 sm:gap-4">
        {/* Zone 1: Brand Title with live pulse */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onTabChange('mapa')}
            className="group flex flex-col items-start text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg p-0.5 cursor-pointer"
            aria-label="PAROU.PT Início"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white group-hover:text-blue-400 transition-colors">
                PAROU<span className="text-blue-500">.</span><span className="text-red-500 font-extrabold">PT</span>
              </span>
              <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" title="Em direto" />
            </div>
            <span className="hidden sm:inline-block text-[11px] font-medium text-slate-400 -mt-1 tracking-tight">
              Transportes e serviços, Portugal.
            </span>
          </button>
        </div>

        {/* Zone 2: Streamlined Adaptive Navigation (No button collisions) */}
        <div className="hidden md:flex items-center gap-2 flex-1 justify-center min-w-0">
          <nav className="flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800 shadow-inner shrink-0">
            {/* 1. Mapa */}
            <button
              onClick={() => onTabChange('mapa')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'mapa'
                  ? 'bg-blue-600/90 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>Mapa</span>
            </button>

            {/* 2. Reports */}
            <button
              onClick={() => onTabChange('reports')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-blue-600/90 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Reports</span>
            </button>

            {/* 3. Perto */}
            <button
              onClick={() => onTabChange('perto')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'perto'
                  ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Compass className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'perto' ? 'text-cyan-200 animate-spin-slow' : 'text-cyan-400'}`} />
              <span>Perto</span>
            </button>

            {/* 4. Horários */}
            <button
              onClick={() => onTabChange('horarios')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'horarios'
                  ? 'bg-blue-600/90 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Horários</span>
            </button>

            {/* 5. Favoritos (Visible on larger screens >= 1200px) */}
            <button
              onClick={() => onTabChange('favoritos')}
              className={`hidden xl:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'favoritos'
                  ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Star className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'favoritos' ? 'fill-white text-white' : 'text-amber-400 fill-amber-400/30'}`} />
              <span>Favoritos</span>
              {favoritesCount !== undefined && favoritesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-300">
                  {favoritesCount}
                </span>
              )}
            </button>

            {/* 6. "Mais" Dropdown (Unclutters secondary views and admin tools) */}
            <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  isMoreTabActive
                    ? 'bg-blue-600/80 text-white shadow-sm shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title="Mais secções e ferramentas"
                aria-expanded={isMoreMenuOpen}
              >
                <span>{isMoreTabActive ? getMoreTabLabel() : 'Mais'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Card */}
              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150 backdrop-blur-xl">
                  {/* Favoritos (inside menu for < 1200px) */}
                  <button
                    onClick={() => {
                      onTabChange('favoritos');
                      setIsMoreMenuOpen(false);
                    }}
                    className={`xl:hidden w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === 'favoritos' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
                      <span>Favoritos</span>
                    </div>
                    {favoritesCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-300 font-mono">
                        {favoritesCount}
                      </span>
                    )}
                  </button>

                  {/* Alertas */}
                  <button
                    onClick={() => {
                      onTabChange('alertas');
                      setIsMoreMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === 'alertas' ? 'bg-blue-600/20 text-blue-300 font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Central de Alertas</span>
                  </button>

                  {/* Catálogo Nacional */}
                  <button
                    onClick={() => {
                      onTabChange('catalogo');
                      setIsMoreMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === 'catalogo' ? 'bg-blue-600/20 text-blue-300 font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Catálogo de Operadores</span>
                  </button>

                  {/* Reclamações */}
                  <button
                    onClick={() => {
                      onTabChange('reclamacoes');
                      setIsMoreMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === 'reclamacoes' ? 'bg-blue-600/20 text-blue-300 font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                    <span>Portal de Reclamações</span>
                  </button>

                  {/* Cobertura & Feeds (/coverage) */}
                  <button
                    onClick={() => {
                      onTabChange('coverage');
                      setIsMoreMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      activeTab === 'coverage' ? 'bg-cyan-600/20 text-cyan-300 font-bold' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Cobertura &amp; Feeds GTFS</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  {/* Fontes Oficiais & Open Data */}
                  {onOpenPublicSourcesModal && (
                    <button
                      onClick={() => {
                        onOpenPublicSourcesModal();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-emerald-400 hover:bg-slate-800 hover:text-emerald-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <Radio className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Fontes Oficiais & Dados</span>
                      </div>
                      {publicReportsCount !== undefined && publicReportsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                          {publicReportsCount}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Moderação Comunitária */}
                  {onOpenAdminModal && (
                    <button
                      onClick={() => {
                        onOpenAdminModal();
                        setIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-amber-400 hover:bg-slate-800 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span>Moderação Comunitária</span>
                      </div>
                      {pendingModerationCount !== undefined && pendingModerationCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold">
                          {pendingModerationCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </nav>

          {/* Compact Smart Header Search Bar (Auto-collapses gracefully without crowding) */}
          <div className="relative shrink-0 hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar..."
              className="w-32 xl:w-48 focus:w-60 pl-8 pr-7 py-1.5 bg-slate-900/80 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Zone 3: Actions (Notification Bell, User Profile, Report Button) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile search toggle */}
          <button
            onClick={() => setIsSearchExpanded(!isSearchExpanded)}
            className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900/90 border border-slate-800 transition-colors cursor-pointer"
            aria-label="Abrir pesquisa"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Notification Settings Button */}
          {onOpenNotificationModal && (
            <button
              onClick={onOpenNotificationModal}
              className="relative p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
              title="Notificações do PAROU"
              aria-label="Abrir Definições de Notificações"
            >
              <Bell className={`w-4 h-4 ${isNotificationActive ? 'text-amber-400' : 'text-slate-400'}`} />
              {isNotificationActive && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#080c14]" />
              )}
              {unreadNotificationsCount !== undefined && unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-mono text-[9px] font-bold shadow-sm">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          {/* User Profile Pill or "Entrar" button */}
          {currentUser ? (
            <button
              onClick={onOpenUserProfileModal}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 text-blue-200 hover:text-white border border-blue-500/40 hover:border-blue-400 rounded-xl transition-all shadow-sm focus:outline-none cursor-pointer shrink-0"
              title="Ver Perfil de Colaborador"
              aria-label="Perfil do utilizador"
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-5 h-5 rounded-lg object-cover ring-1 ring-blue-500 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                  {currentUser.displayName.substring(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-bold text-slate-100 max-w-[70px] sm:max-w-[90px] truncate">
                {currentUser.displayName.split(' ')[0]}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/30 hidden xs:inline-block">
                ★ {currentUser.reputationPoints}
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenLoginModal}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-600/30 border border-blue-400/40 active:scale-95 cursor-pointer shrink-0"
              title="Iniciar sessão no PAROU.PT"
              aria-label="Entrar na conta"
            >
              <User className="w-3.5 h-3.5" />
              <span>Entrar</span>
            </button>
          )}
        </div>
      </div>

      {/* Expanded search input for mobile */}
      {isSearchExpanded && (
        <div className="lg:hidden px-4 pb-3 pt-1 border-t border-slate-800/80 bg-slate-950/95 animate-in fade-in duration-150">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar cidade, transporte, autoestrada..."
              className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Instalar PAROU.PT no iPhone</h3>
                <p className="text-xs text-slate-400">Acede em qualquer lugar como app nativa</p>
              </div>
            </div>
            <ol className="mt-3 space-y-2.5 text-xs text-slate-300">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-blue-400">1</span>
                <span>Toca no botão <strong>Partilhar</strong> (ícone do quadrado com seta para cima) na barra do Safari.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-blue-400">2</span>
                <span>Desliza para baixo e seleciona <strong>"Adicionar ao Ecrã Principal"</strong>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-blue-400">3</span>
                <span>Toca em <strong>Adicionar</strong> no canto superior direito.</span>
              </li>
            </ol>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-semibold text-white transition-all shadow-md shadow-blue-600/20 cursor-pointer"
            >
              Compreendi
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

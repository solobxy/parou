import React, { useState, useRef, useEffect } from 'react';
import { Logo } from './Logo';
import { BotaoInstalar } from './InstalarApp';
import { SeletorTema } from './SeletorTema';
import { SeletorIdioma } from './SeletorIdioma';
import { Avatar } from './Avatar';
import { usePontoDiario } from '../hooks/usePontoDiario';
import { 
  Search, 
  Newspaper, 
  AlertTriangle, 
  Compass, 
  Clock, 
  Star, 
  MessageSquare, 
  User, 
  ShieldAlert, 
  Bell, 
  Radio, 
  Database,
  ChevronDown,
  Users,
  MessageCircle,
  Activity,
  Play,
  X
} from 'lucide-react';
import { UserProfile } from '../types';
import { eAdmin } from '../utils/admin';
import { t } from '../i18n';

interface HeaderProps {
  activeTab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'comunidade' | 'alertas' | 'coverage';
  onTabChange: (tab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'comunidade' | 'alertas' | 'coverage') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenReportModal: () => void;
  onOpenLoginModal: () => void;
  currentUser?: UserProfile | null;
  onOpenUserProfileModal?: () => void;
  onOpenAdminModal?: () => void;
  onOpenWhatsApp?: () => void;
  onOpenEstatisticas?: () => void;
  /** TEMPORÁRIO (administração): ver o carrossel de boas-vindas */
  onOpenBemVindo?: () => void;
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
  onOpenWhatsApp,
  onOpenEstatisticas,
  onOpenBemVindo,
  pendingModerationCount,
  onOpenNotificationModal,
  isNotificationActive,
  unreadNotificationsCount,
  onOpenPublicSourcesModal,
  publicReportsCount,
  favoritesCount = 0,
}) => {
  const admin = eAdmin();
  // O painel do WhatsApp também abre com a conta de administração (sem precisar da chave neste telemóvel)
  const painelWhatsApp = admin || Boolean(currentUser?.admin);
  // Ponto diário por resgatar: um pontinho laranja no botão da conta (a contagem em si está no perfil)
  const pontoPorResgatar = usePontoDiario(currentUser, 30_000)?.disponivel ?? false;
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Em ecrã largo a Comunidade tem botão próprio; nos mais estreitos fica no menu "Mais"
  const [ecraLargo, setEcraLargo] = useState<boolean>(() => {
    try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(min-width: 1024px)'); } catch { return; }
    const mudar = () => setEcraLargo(mq.matches);
    mq.addEventListener?.('change', mudar);
    return () => mq.removeEventListener?.('change', mudar);
  }, []);

  const isMoreTabActive = ['reports', 'catalogo', 'reclamacoes', 'coverage'].includes(activeTab) || (activeTab === 'comunidade' && !ecraLargo);

  const getMoreTabLabel = () => t((() => {
    switch (activeTab) {
      case 'favoritos': return 'Favoritos';
      case 'reports': return 'Ocorrências';
      case 'catalogo': return 'Catálogo';
      case 'reclamacoes': return 'Reclamações';
      case 'comunidade': return 'Comunidade';
      case 'coverage': return 'Cobertura';
      default: return 'Mais';
    }
  })());

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#E6E6E3] bg-[#FFFFFF] transition-colors">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onTabChange('perto')}
            className="flex items-center text-left focus:outline-none rounded-[8px] min-h-[44px] cursor-pointer text-[#111111]"
            aria-label={`PAROU · ${t('Página inicial')}`}
          >
            <Logo size={28} className="max-[419px]:hidden" />
            <Logo size={22} className="min-[420px]:hidden" />
          </button>
        </div>

        {/* Center: Desktop Navigation */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center min-w-0">
          <nav className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onTabChange('perto')}
              aria-label={t('Perto')}
              title={t('Perto')}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'perto' || activeTab === 'favoritos'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
            >
              <Compass className="w-4 h-4 stroke-[2]" />
              <span className="hidden lg:inline">{t('Perto')}</span>
            </button>

            <button
              onClick={() => onTabChange('horarios')}
              aria-label={t('Horários')}
              title={t('Horários')}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'horarios'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
            >
              <Clock className="w-4 h-4 stroke-[2]" />
              <span className="hidden lg:inline">{t('Horários')}</span>
            </button>

            <button
              onClick={() => onTabChange('mapa')}
              aria-label={t('Alertas')}
              title={t('Alertas')}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'mapa'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 stroke-[2]" />
              <span className="hidden lg:inline">{t('Alertas')}</span>
            </button>

            <button
              onClick={() => onTabChange('alertas')}
              aria-label={t('Notícias')}
              title={t('Notícias')}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'alertas'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
            >
              <Newspaper className="w-4 h-4 stroke-[2]" />
              <span className="hidden lg:inline">{t('Notícias')}</span>
            </button>

            <button
              onClick={() => onTabChange('comunidade')}
              className={`hidden lg:flex items-center gap-1.5 px-2 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'comunidade'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
              data-teste="aba-comunidade"
            >
              <Users className="w-4 h-4 stroke-[2]" />
              <span>{t('Comunidade')}</span>
            </button>

            {admin && <button
              onClick={() => onTabChange('coverage')}
              className={`hidden md:flex items-center gap-1.5 px-2 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                activeTab === 'coverage'
                  ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                  : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
              }`}
            >
              <Database className="w-4 h-4 stroke-[2]" />
              <span>{t('Cobertura')}</span>
            </button>}

            {/* Mais Dropdown */}
            <div className="relative shrink-0" ref={moreMenuRef}>
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className={`flex items-center gap-1 px-2 lg:px-3 py-1.5 text-sm font-medium rounded-[8px] transition-colors min-h-[44px] cursor-pointer ${
                  isMoreTabActive
                    ? 'bg-[#F4F4F2] text-[#111111] font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
                }`}
                aria-expanded={isMoreMenuOpen}
              >
                {/* Em ecrãs médios o espaço é curto: o botão diz só "Mais" (a opção ativa aparece destacada ao abrir) */}
                <span className="hidden lg:inline">{isMoreTabActive ? getMoreTabLabel() : t('Mais')}</span>
                <span className="lg:hidden">{t('Mais')}</span>
                <ChevronDown className={`w-3.5 h-3.5 stroke-[2] transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-md py-1 z-50 divide-y divide-[#E6E6E3]">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        onTabChange('favoritos');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'favoritos' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Star className="w-4 h-4 stroke-[2]" />
                        <span>{t('Favoritos')}</span>
                      </div>
                      {favoritesCount > 0 && (
                        <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums">
                          {favoritesCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('reports');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'reports' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <ShieldAlert className="w-4 h-4 stroke-[2]" />
                      <span>{t('Ocorrências')}</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('catalogo');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'catalogo' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <Database className="w-4 h-4 stroke-[2]" />
                      <span>{t('Catálogo')}</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('comunidade');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`lg:hidden w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'comunidade' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <Users className="w-4 h-4 stroke-[2]" />
                      <span>{t('Comunidade')}</span>
                    </button>

                    <button
                      onClick={() => {
                        onTabChange('reclamacoes');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'reclamacoes' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4 stroke-[2]" />
                      <span>{t('Reclamações')}</span>
                    </button>

                    {admin && <button
                      onClick={() => {
                        onTabChange('coverage');
                        setIsMoreMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer min-h-[44px] ${
                        activeTab === 'coverage' ? 'font-semibold text-[#111111] bg-[#F4F4F2]' : 'text-[#111111] hover:bg-[#F4F4F2]'
                      }`}
                    >
                      <Database className="w-4 h-4 stroke-[2]" />
                      <span>{t('Cobertura')}</span>
                    </button>}
                  </div>

                  {(onOpenPublicSourcesModal || onOpenAdminModal || ((onOpenWhatsApp || onOpenEstatisticas || onOpenBemVindo) && painelWhatsApp)) && (
                    <div className="py-1">
                      {onOpenPublicSourcesModal && (
                        <button
                          onClick={() => {
                            onOpenPublicSourcesModal();
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 stroke-[2]" />
                            <span>{t('Fontes')}</span>
                          </div>
                          {publicReportsCount !== undefined && publicReportsCount > 0 && (
                            <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums">
                              {publicReportsCount}
                            </span>
                          )}
                        </button>
                      )}

                      {onOpenEstatisticas && painelWhatsApp && (
                        <button
                          onClick={() => {
                            onOpenEstatisticas();
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer min-h-[44px]"
                          data-teste="menu-estatisticas"
                        >
                          <Activity className="w-4 h-4 stroke-[2]" />
                          <span>Estatísticas</span>
                        </button>
                      )}

                      {onOpenBemVindo && painelWhatsApp && (
                        <button
                          onClick={() => {
                            onOpenBemVindo();
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer min-h-[44px]"
                          data-teste="menu-bemvindo"
                        >
                          <div className="flex items-center gap-2">
                            <Play className="w-4 h-4 stroke-[2]" />
                            <span>Ver boas-vindas</span>
                          </div>
                          <span className="font-condensada text-[11px] font-bold text-[#6B6B6B] uppercase tracking-wide">temporário</span>
                        </button>
                      )}

                      {onOpenWhatsApp && painelWhatsApp && (
                        <button
                          onClick={() => {
                            onOpenWhatsApp();
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer min-h-[44px]"
                          data-teste="menu-whatsapp"
                        >
                          <MessageCircle className="w-4 h-4 stroke-[2]" />
                          <span>Para o WhatsApp</span>
                        </button>
                      )}

                      {onOpenAdminModal && painelWhatsApp && (
                        <button
                          onClick={() => {
                            onOpenAdminModal();
                            setIsMoreMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm text-[#111111] hover:bg-[#F4F4F2] transition-colors cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 stroke-[2]" />
                            <span>{t('Moderação')}</span>
                          </div>
                          {pendingModerationCount !== undefined && pendingModerationCount > 0 && (
                            <span className="font-condensada text-xs font-bold text-[#D92D20] tabular-nums">
                              {pendingModerationCount}
                            </span>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </nav>

          {/* Desktop Search — Visível apenas no Mapa para evitar pesquisa duplicada */}
          {activeTab === 'mapa' && (
            <div className="relative shrink-0 hidden lg:block ml-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={t('Pesquisar...')}
                className="w-36 xl:w-48 pl-9 pr-7 py-1.5 bg-[#F4F4F2] border border-[#E6E6E3] focus:border-[#111111] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer p-1"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 min-[420px]:gap-1.5 shrink-0">
          {/* Mobile search toggle — apenas no Mapa */}
          {activeTab === 'mapa' && (
            <button
              onClick={() => setIsSearchExpanded(!isSearchExpanded)}
              className="lg:hidden p-2 max-[359px]:p-1.5 text-[#6B6B6B] hover:text-[#111111] rounded-[8px] min-h-[44px] min-w-[44px] max-[359px]:min-w-[36px] flex items-center justify-center transition-colors cursor-pointer"
              aria-label={t('Abrir pesquisa')}
            >
              <Search className="w-5 h-5 stroke-[2]" />
            </button>
          )}

          {/* Idioma: bandeira do idioma em uso; abre a lista (Português, English, Deutsch, Français) */}
          <SeletorIdioma />

          {/* Tema: Claro, Escuro, Âmbar ou Azul */}
          <SeletorTema />

          {/* Instalar a app (só aparece quando o browser permite e ainda não está instalada) */}
          <BotaoInstalar />

          {/* Notification Button */}
          {onOpenNotificationModal && (
            <button
              onClick={onOpenNotificationModal}
              className="relative p-2 rounded-[8px] text-[#6B6B6B] hover:text-[#111111] min-h-[40px] min-w-[40px] max-[359px]:min-w-[36px] max-[359px]:p-1.5 min-[420px]:min-h-[44px] min-[420px]:min-w-[44px] flex items-center justify-center transition-colors cursor-pointer"
              title={t('Notificações')}
              aria-label={t('Notificações')}
            >
              <Bell className="w-5 h-5 stroke-[2]" />
              {unreadNotificationsCount !== undefined && unreadNotificationsCount > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#D92D20]" />
              )}
            </button>
          )}

          {/* Conta: só o símbolo (sem texto) para o topo não ficar cheio; com sessão iniciada mostra
              a foto ou as iniciais, para se perceber logo que já entraste */}
          {currentUser ? (
            <button
              onClick={onOpenUserProfileModal}
              className="relative w-11 max-[359px]:w-10 h-11 flex items-center justify-center bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] rounded-[10px] transition-colors cursor-pointer"
              title={`${t('A tua conta')} (${currentUser.displayName})`}
              aria-label={`${t('A tua conta: {nome}', { nome: currentUser.displayName })}${pontoPorResgatar ? `. ${t('Tens 1 ponto por resgatar.')}` : ''}`}
              data-teste="botao-conta"
            >
              {currentUser.avatar ? (
                <Avatar config={currentUser.avatar} tamanho={38} />
              ) : currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-[#111111] text-[#FFFFFF] text-[11px] font-bold flex items-center justify-center" aria-hidden="true">
                  {currentUser.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'}
                </span>
              )}
              {pontoPorResgatar && (
                <span aria-hidden="true" data-teste="ponto-por-resgatar" className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#FF6B1A] border-2 border-[#FFFFFF]" />
              )}
            </button>
          ) : (
            <button
              onClick={onOpenLoginModal}
              className="w-11 max-[359px]:w-10 h-11 flex items-center justify-center bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] rounded-[10px] text-[#111111] transition-colors cursor-pointer"
              title={t('Entrar ou criar conta')}
              aria-label={t('Entrar ou criar conta')}
              data-teste="botao-entrar"
            >
              <User className="w-5 h-5 stroke-[2]" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded search input for mobile */}
      {isSearchExpanded && (
        <div className="lg:hidden px-3 pb-3 pt-1 border-t border-[#E6E6E3] bg-[#FFFFFF]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('Pesquisar...')}
              className="w-full pl-9 pr-8 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6B6B6B] cursor-pointer p-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

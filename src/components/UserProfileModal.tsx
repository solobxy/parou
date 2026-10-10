import React from 'react';
import { 
  X, 
  MapPin, 
  ThumbsUp, 
  LogOut, 
  Plus,
  ChevronRight,
  Pencil,
  UserX,
  MessageCircle
} from 'lucide-react';
import { UserProfile, Occurrence } from '../types';
import { logout, apagarConta } from '../services/conta';
import { eAdmin } from '../utils/admin';
import { quandoAconteceu } from '../utils/quando';
import { t } from '../i18n';
import { MedalhaPioneiro } from './MedalhaPioneiro';
import { Avatar } from './Avatar';
import { AvatarEditor } from './AvatarEditor';
import { BotaoWhatsApp } from './BotaoWhatsApp';
import { listarBloqueados, desbloquear } from '../services/comunidade';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  userReports: Occurrence[];
  onSelectOccurrence: (occ: Occurrence) => void;
  onOpenReportModal: () => void;
  onOpenWhatsApp?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  userReports,
  onSelectOccurrence,
  onOpenReportModal,
  onOpenWhatsApp,
}) => {
  const [aApagar, setAApagar] = React.useState<'nao' | 'confirmar' | 'a-apagar'>('nao');
  const [erroApagar, setErroApagar] = React.useState<string>('');
  const [palavraApagar, setPalavraApagar] = React.useState('');
  const [editorAvatar, setEditorAvatar] = React.useState(false);
  const [bloqueados, setBloqueados] = React.useState<Array<{ ref: string; nome: string }> | null>(null);
  const [bloqueadosAbertos, setBloqueadosAbertos] = React.useState(false);
  const [erroBloqueados, setErroBloqueados] = React.useState('');

  if (!isOpen || !user) return null;

  const alternarBloqueados = async () => {
    const abrir = !bloqueadosAbertos;
    setBloqueadosAbertos(abrir);
    if (abrir && bloqueados === null) {
      try { setBloqueados(await listarBloqueados()); setErroBloqueados(''); }
      catch { setErroBloqueados(t('Não foi possível carregar a lista. Tenta outra vez.')); }
    }
  };
  const tirarBloqueio = async (ref: string) => {
    try { await desbloquear(ref); setBloqueados((l) => (l || []).filter((x) => x.ref !== ref)); setErroBloqueados(''); }
    catch { setErroBloqueados(t('Não foi possível desbloquear agora. Tenta outra vez.')); }
  };

  const handleApagarConta = async () => {
    setAApagar('a-apagar');
    setErroApagar('');
    const r = await apagarConta(palavraApagar);
    if (r === 'ok') {
      onClose();
      return;
    }
    setAApagar('confirmar');
    setErroApagar(r === 'palavra-errada'
      ? 'A palavra-passe não está certa.'
      : 'Não foi possível apagar agora. Tenta outra vez ou escreve para diniscash@gmail.com.');
  };

  const handleLogout = async () => {
    try {
      await logout();
      onClose();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] p-5 shadow-lg text-[#111111] my-8"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabeçalho: título e fechar (o "Sair" fica em baixo, longe do X) */}
        <div className="flex items-center justify-between gap-3 -mt-1 mb-3">
          <h2 className="text-lg font-bold text-[#111111]">{t('A tua conta')}</h2>
          <button
            onClick={onClose}
            className="-mr-2 w-11 h-11 rounded-full text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer flex items-center justify-center"
            aria-label={t('Fechar')}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Profile Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-[#E6E6E3]">
          <button
            type="button"
            onClick={() => setEditorAvatar(true)}
            aria-label={t('Personalizar avatar')}
            className="relative shrink-0 w-14 h-14 rounded-full cursor-pointer"
            data-teste="avatar-perfil"
          >
            <Avatar config={user.avatar} tamanho={56} />
            <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#111111] text-[#FFFFFF] border-2 border-[#FFFFFF] flex items-center justify-center" aria-hidden="true">
              <Pencil className="w-3 h-3 stroke-[2.5]" />
            </span>
          </button>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#111111] truncate flex items-center gap-1.5">
              <span className="truncate">{user.displayName}</span>
              {user.pioneiro && <MedalhaPioneiro />}
            </h3>
            <p className="text-xs text-[#6B6B6B] truncate">
              {user.email}
            </p>
          </div>
        </div>

        {/* Avatar: próxima peça por abrir */}
        <button
          type="button"
          onClick={() => setEditorAvatar(true)}
          data-teste="personalizar-avatar"
          className="mt-3 w-full min-h-[48px] px-3 py-2 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] hover:bg-[#ECECE8] flex items-center gap-2 text-left cursor-pointer"
        >
          <Pencil className="w-4 h-4 stroke-[2] shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0 leading-tight">
            <span className="block text-[14px] font-semibold text-[#111111]">{t('Personalizar avatar')}</span>
            {user.proximaPeca && (
              <span className="block text-[12px] text-[#6B6B6B]">{t('Faltam {n} pts para: {nome}', { n: user.proximaPeca.falta, nome: t(user.proximaPeca.nome) })}</span>
            )}
          </span>
          <ChevronRight className="w-4 h-4 text-[#6B6B6B] shrink-0" aria-hidden="true" />
        </button>

        {/* Reputation strip */}
        <div className="grid grid-cols-2 gap-2 my-4">
          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">{t('Pontos de reputação')}</span>
            <div className="font-condensada text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {user.reputationPoints}
            </div>
          </div>

          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">{t('Ocorrências reportadas')}</span>
            <div className="font-condensada text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {userReports.length}
            </div>
          </div>
        </div>

        {/* User Reports List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#111111]">
              {t('As minhas ocorrências ({n})', { n: userReports.length })}
            </h4>

            {/* Primary Action Button: Brand chamfer */}
            <button
              onClick={() => {
                onClose();
                onOpenReportModal();
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[36px] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t('Nova')}</span>
            </button>
          </div>

          <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] max-h-56 overflow-y-auto">
            {userReports.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6B6B6B]">
                {t('Ainda não reportou nenhuma ocorrência.')}
              </div>
            ) : (
              userReports.map((occ) => (
                <div
                  key={occ.id}
                  onClick={() => {
                    onClose();
                    onSelectOccurrence(occ);
                  }}
                  className="p-3 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#111111] truncate">{occ.title}</div>
                    <div className="text-[11px] text-[#6B6B6B] truncate flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 stroke-[2]" />
                      <span>{t(occ.district)}</span>
                      <span>·</span>
                      <span className="font-condensada tabular-nums">{quandoAconteceu(occ)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B] shrink-0">
                    <ThumbsUp className="w-3 h-3 stroke-[2]" />
                    <span className="font-condensada font-bold tabular-nums">
                      {occ.confirmationsCount || occ.upvotes || 0}
                    </span>
                    <ChevronRight className="w-4 h-4 stroke-[2]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Utilizadores bloqueados na comunidade */}
        <div className="mt-4">
          <button
            type="button"
            onClick={alternarBloqueados}
            aria-expanded={bloqueadosAbertos}
            className="w-full min-h-[44px] flex items-center gap-2 text-[13.5px] font-semibold text-[#111111] cursor-pointer"
          >
            <UserX className="w-4 h-4 stroke-[2]" aria-hidden="true" />
            <span className="flex-1 text-left">{t('Utilizadores bloqueados')}</span>
            <ChevronRight className={`w-4 h-4 text-[#6B6B6B] transition-transform ${bloqueadosAbertos ? 'rotate-90' : ''}`} aria-hidden="true" />
          </button>
          {bloqueadosAbertos && (
            <div className="mt-1 rounded-[10px] border border-[#E6E6E3] divide-y divide-[#E6E6E3]">
              {erroBloqueados && <p role="alert" className="p-3 text-[12.5px] text-[#D92D20]">{erroBloqueados}</p>}
              {bloqueados === null && !erroBloqueados && <p className="p-3 text-[12.5px] text-[#6B6B6B]">{t('A carregar…')}</p>}
              {bloqueados !== null && bloqueados.length === 0 && <p className="p-3 text-[12.5px] text-[#6B6B6B]">{t('Não bloqueaste ninguém.')}</p>}
              {(bloqueados || []).map((b) => (
                <div key={b.ref} className="flex items-center gap-2 p-2 pl-3">
                  <span className="flex-1 min-w-0 truncate text-[13.5px] text-[#111111]">{b.nome}</span>
                  <button type="button" onClick={() => tirarBloqueio(b.ref)} className="h-11 px-3 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-[13px] font-semibold text-[#111111] cursor-pointer">
                    {t('Desbloquear')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <BotaoWhatsApp variante="cartao" className="mt-3" />

        {onOpenWhatsApp && eAdmin() && (
          <button
            type="button"
            onClick={onOpenWhatsApp}
            className="mt-3 w-full h-11 flex items-center justify-center gap-2 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14px] font-bold cursor-pointer"
            data-teste="abrir-painel-whatsapp"
          >
            <MessageCircle className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />
            <span>Para o WhatsApp (admin)</span>
          </button>
        )}

        {/* Sair da conta */}
        <button
          onClick={handleLogout}
          className="mt-5 w-full h-11 flex items-center justify-center gap-2 rounded-[10px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] cursor-pointer"
          data-teste="sair-conta"
        >
          <LogOut className="w-4 h-4 stroke-[2]" />
          <span>{t('Sair da conta')}</span>
        </button>

        {/* Apagar conta (RGPD / Google Play) */}
        <div className="mt-4 pt-4 border-t border-[#E6E6E3]">
          {aApagar === 'nao' ? (
            <button
              onClick={() => setAApagar('confirmar')}
              className="text-[12.5px] font-semibold text-[#D92D20] cursor-pointer min-h-[36px]"
            >
              {t('Apagar conta')}
            </button>
          ) : (
            <div className="rounded-[10px] border border-[#F3C5C1] bg-[#FDF2F1] p-3 space-y-2">
              <p className="text-[12.5px] text-[#111111] leading-snug">
                {t('Apagar a conta remove o teu perfil, os pontos, o avatar e os favoritos sincronizados. As ocorrências, publicações e respostas que escreveste continuam visíveis como “Utilizador PAROU”, sem ligação à conta (podes apagá-las antes). Isto não se pode desfazer.')}
              </p>
              <input
                type="password"
                value={palavraApagar}
                onChange={(e) => setPalavraApagar(e.target.value)}
                placeholder={t('Escreve a tua palavra-passe para confirmar')}
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-[12.5px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[40px]"
              />
              {erroApagar && <p role="alert" className="text-[12px] text-[#D92D20]">{t(erroApagar)}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleApagarConta}
                  disabled={aApagar === 'a-apagar' || palavraApagar.length === 0}
                  className="h-9 px-3 rounded-[8px] bg-[#D92D20] text-[#FFFFFF] text-[12.5px] font-semibold cursor-pointer disabled:opacity-60"
                >
                  {aApagar === 'a-apagar' ? t('A apagar…') : t('Sim, apagar a conta')}
                </button>
                <button
                  onClick={() => { setAApagar('nao'); setErroApagar(''); setPalavraApagar(''); }}
                  className="h-9 px-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] text-[12.5px] font-semibold text-[#111111] cursor-pointer"
                >
                  {t('Cancelar')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <AvatarEditor
        aberta={editorAvatar}
        onFechar={() => setEditorAvatar(false)}
        avatar={user.avatar}
        pontos={user.reputationPoints}
        onGuardado={() => setEditorAvatar(false)}
      />
    </div>
  );
};

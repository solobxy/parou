import React from 'react';
import { 
  X, 
  MapPin, 
  ThumbsUp, 
  LogOut, 
  Plus,
  ChevronRight
} from 'lucide-react';
import { UserProfile, Occurrence } from '../types';
import { logout, apagarConta } from '../services/firebase';
import { quandoAconteceu } from '../utils/quando';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  userReports: Occurrence[];
  onSelectOccurrence: (occ: Occurrence) => void;
  onOpenReportModal: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  userReports,
  onSelectOccurrence,
  onOpenReportModal,
}) => {
  const [aApagar, setAApagar] = React.useState<'nao' | 'confirmar' | 'a-apagar'>('nao');
  const [erroApagar, setErroApagar] = React.useState<string>('');

  if (!isOpen || !user) return null;

  const handleApagarConta = async () => {
    setAApagar('a-apagar');
    setErroApagar('');
    const r = await apagarConta();
    if (r === 'ok') {
      onClose();
      return;
    }
    setAApagar('confirmar');
    setErroApagar(r === 'reautenticar'
      ? 'Por segurança, sai e volta a entrar na conta e depois apaga-a.'
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
          <h2 className="text-lg font-bold text-[#111111]">A tua conta</h2>
          <button
            onClick={onClose}
            className="-mr-2 w-11 h-11 rounded-full text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2] cursor-pointer flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Profile Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-[#E6E6E3]">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName}
              className="w-12 h-12 rounded-[8px] object-cover border border-[#E6E6E3]"
            />
          ) : (
            <div className="w-12 h-12 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] flex items-center justify-center text-sm font-bold text-[#111111]">
              {user.displayName.substring(0, 2).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-[#111111] truncate">
              {user.displayName}
            </h3>
            <p className="text-xs text-[#6B6B6B] truncate">
              {user.email}
            </p>
          </div>
        </div>

        {/* Reputation strip */}
        <div className="grid grid-cols-2 gap-2 my-4">
          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Pontos de reputação</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {user.reputationPoints}
            </div>
          </div>

          <div className="p-3 bg-[#F4F4F2] rounded-[8px] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B]">Ocorrências reportadas</span>
            <div className="font-['Barlow_Condensed'] text-2xl font-bold text-[#111111] tabular-nums mt-0.5">
              {userReports.length}
            </div>
          </div>
        </div>

        {/* User Reports List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#111111]">
              As minhas ocorrências ({userReports.length})
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
              <span>Nova</span>
            </button>
          </div>

          <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] max-h-56 overflow-y-auto">
            {userReports.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#6B6B6B]">
                Ainda não reportou nenhuma ocorrência.
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
                      <span>{occ.district}</span>
                      <span>·</span>
                      <span className="font-['Barlow_Condensed'] tabular-nums">{quandoAconteceu(occ)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B] shrink-0">
                    <ThumbsUp className="w-3 h-3 stroke-[2]" />
                    <span className="font-['Barlow_Condensed'] font-bold tabular-nums">
                      {occ.confirmationsCount || occ.upvotes || 0}
                    </span>
                    <ChevronRight className="w-4 h-4 stroke-[2]" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sair da conta */}
        <button
          onClick={handleLogout}
          className="mt-5 w-full h-11 flex items-center justify-center gap-2 rounded-[10px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] cursor-pointer"
          data-teste="sair-conta"
        >
          <LogOut className="w-4 h-4 stroke-[2]" />
          <span>Sair da conta</span>
        </button>

        {/* Apagar conta (RGPD / Google Play) */}
        <div className="mt-4 pt-4 border-t border-[#E6E6E3]">
          {aApagar === 'nao' ? (
            <button
              onClick={() => setAApagar('confirmar')}
              className="text-[12.5px] font-semibold text-[#D92D20] cursor-pointer min-h-[36px]"
            >
              Apagar conta
            </button>
          ) : (
            <div className="rounded-[10px] border border-[#F3C5C1] bg-[#FDF2F1] p-3 space-y-2">
              <p className="text-[12.5px] text-[#111111] leading-snug">
                Apagar a conta remove o teu perfil, os pontos e os favoritos sincronizados. As ocorrências que publicaste
                continuam visíveis, sem ligação à conta. Isto não se pode desfazer.
              </p>
              {erroApagar && <p className="text-[12px] text-[#D92D20]">{erroApagar}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleApagarConta}
                  disabled={aApagar === 'a-apagar'}
                  className="h-9 px-3 rounded-[8px] bg-[#D92D20] text-[#FFFFFF] text-[12.5px] font-semibold cursor-pointer disabled:opacity-60"
                >
                  {aApagar === 'a-apagar' ? 'A apagar…' : 'Sim, apagar a conta'}
                </button>
                <button
                  onClick={() => { setAApagar('nao'); setErroApagar(''); }}
                  className="h-9 px-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] text-[12.5px] font-semibold text-[#111111] cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

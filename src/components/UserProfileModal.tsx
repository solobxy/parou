import React from 'react';
import { 
  X, 
  Award, 
  Sparkles, 
  MapPin, 
  Clock, 
  ThumbsUp, 
  LogOut, 
  ShieldCheck, 
  Plus,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { UserProfile, Occurrence } from '../types';
import { logout } from '../services/firebase';

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
  if (!isOpen || !user) return null;

  // Calculate next tier target
  let nextTier = 100;
  let nextBadgeName = 'Colaborador Ativo';
  if (user.reputationPoints >= 500) {
    nextTier = 1000;
    nextBadgeName = 'Guardião Nacional';
  } else if (user.reputationPoints >= 250) {
    nextTier = 500;
    nextBadgeName = 'Embaixador da Mobilidade';
  } else if (user.reputationPoints >= 100) {
    nextTier = 250;
    nextBadgeName = 'Sentinela de Trânsito';
  }
  const progressPercent = Math.min(Math.round((user.reputationPoints / nextTier) * 100), 100);

  const handleLogout = async () => {
    try {
      await logout();
      onClose();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const getBadgeStyle = (badge: string) => {
    if (badge.includes('Embaixador')) return 'bg-purple-950/80 text-purple-300 border-purple-700/80';
    if (badge.includes('Sentinela')) return 'bg-blue-950/80 text-blue-300 border-blue-700/80';
    if (badge.includes('Colaborador')) return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-3xl bg-[#0b1220] border border-slate-700/80 p-5 sm:p-7 shadow-2xl text-slate-100 my-8 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Profile Header */}
        <div className="flex items-center gap-4 pb-4 border-b border-slate-800">
          <div className="relative">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500/60 shadow-lg shadow-blue-500/20"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xl font-black text-white border-2 border-blue-400/40 shadow-lg shadow-blue-500/20">
                {user.displayName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0b1220]" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-white truncate">
                {user.displayName}
              </h3>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase tracking-wider ${getBadgeStyle(user.badge)}`}>
                {user.badge}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Reputation Score & Level Progress */}
        <div className="p-4 my-4 rounded-2xl bg-gradient-to-r from-blue-950/50 via-slate-900 to-indigo-950/40 border border-blue-900/40">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <div>
                <span className="text-xs font-bold text-slate-300">Pontos de Reputação</span>
                <div className="text-2xl font-black text-white font-mono flex items-center gap-1">
                  <span>{user.reputationPoints}</span>
                  <span className="text-xs text-amber-400 font-sans font-bold">pts</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-semibold text-slate-400">Próximo patamar:</span>
              <div className="text-xs font-bold text-blue-400">{nextBadgeName}</div>
              <span className="text-[10px] text-slate-500 font-mono">{nextTier} pts</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mt-1">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1.5">
            <span>{progressPercent}% completado</span>
            <span>+{nextTier - user.reputationPoints} pts para o próximo badge</span>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-5 text-center">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-400">Reports Feitos</div>
            <div className="text-base font-bold text-white font-mono mt-0.5">{userReports.length}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-400">Confirmações</div>
            <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
              {userReports.reduce((acc, curr) => acc + (curr.upvotes || 0), 0)}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-400">Nível</div>
            <div className="text-xs font-bold text-blue-400 mt-1 truncate">{user.badge}</div>
          </div>
        </div>

        {/* Histórico dos seus reports */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Histórico dos seus reports ({userReports.length})
            </h4>
            <button
              onClick={() => {
                onClose();
                onOpenReportModal();
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-white cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Novo report (+20 pts)</span>
            </button>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {userReports.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400">
                <p>Ainda não submeteste nenhum report com a tua conta.</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Cada ocorrência comunicada dá-te <strong>+20 pontos de reputação</strong>!
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onOpenReportModal();
                  }}
                  className="mt-3 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Criar Primeiro Report
                </button>
              </div>
            ) : (
              userReports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => {
                    onClose();
                    onSelectOccurrence(report);
                  }}
                  className="p-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                        {report.title}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                        report.status === 'Ativa'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}>
                        {report.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-blue-400" />
                        <span>{report.district}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-slate-500" />
                        <span>{report.reportedAt}</span>
                      </span>
                      <span className="flex items-center gap-1 text-slate-300">
                        <ThumbsUp className="w-2.5 h-2.5 text-blue-400" />
                        <span>{report.upvotes || 0}</span>
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 text-red-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Terminar Sessão</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

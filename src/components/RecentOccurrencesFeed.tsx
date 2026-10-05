import React from 'react';
import { 
  Train, 
  Bus, 
  Car, 
  Zap, 
  Users, 
  MapPin, 
  MessageSquare, 
  Camera, 
  ArrowRight,
  AlertCircle,
  ThumbsUp,
  ShieldCheck,
  Clock,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { Occurrence, OccurrenceType } from '../types';
import { calculateConfidence, getVerificationStatusConfig, getConfidenceLevelConfig } from '../utils/confidenceUtils';

interface RecentOccurrencesFeedProps {
  occurrences: Occurrence[];
  onSelectOccurrence: (occurrence: Occurrence) => void;
  onViewAll: () => void;
}

export const RecentOccurrencesFeed: React.FC<RecentOccurrencesFeedProps> = ({
  occurrences,
  onSelectOccurrence,
  onViewAll,
}) => {
  const getIconAndStyle = (type: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return {
          Icon: Car,
          bg: 'bg-red-500/20 text-red-400 border-red-500/30',
        };
      case 'ATRASOS':
        return {
          Icon: Bus,
          bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        };
      case 'AVARIA':
        return {
          Icon: type === 'AVARIA' && Math.random() > 0.5 ? Zap : Train,
          bg: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        };
      case 'GREVE':
        return {
          Icon: Users,
          bg: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        };
      default:
        return {
          Icon: AlertCircle,
          bg: 'bg-slate-700/30 text-slate-300 border-slate-600',
        };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Grave':
        return 'bg-red-950/70 border border-red-700/60 text-red-300';
      case 'Moderada':
        return 'bg-amber-950/70 border border-amber-700/60 text-amber-300';
      case 'Informação':
      default:
        return 'bg-blue-950/70 border border-blue-700/60 text-blue-300';
    }
  };

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-3 sm:p-5 shadow-xl backdrop-blur-md flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 mb-2 border-b border-slate-800/80">
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
          Ocorrências recentes
        </h3>
        <button
          onClick={onViewAll}
          className="group inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          <span>Ver todas</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Feed list */}
      <div className="space-y-2">
        {occurrences.filter((o) => o.status !== 'Ocultada').length === 0 ? (
          <div className="py-10 text-center text-slate-400 space-y-1.5">
            <p className="text-xs font-bold text-slate-300">Sem dados disponíveis</p>
            <p className="text-[11px] text-slate-500">Nenhum alerta ativo reportado por fontes oficiais ou utilizadores no momento.</p>
          </div>
        ) : (
          occurrences
            .filter((o) => o.status !== 'Ocultada')
            .slice(0, 5)
            .map((item) => {
            const { Icon, bg } = getIconAndStyle(item.type);
            const evaluation = calculateConfidence(item);
            const statusConfig = getVerificationStatusConfig(evaluation.status);
            const levelConfig = getConfidenceLevelConfig(evaluation.level);
            const isConfirmed = evaluation.status === 'Confirmado';

            return (
              <div
                key={item.id}
                onClick={() => onSelectOccurrence(item)}
                className={`group flex items-center justify-between p-3 rounded-2xl hover:bg-slate-800/50 cursor-pointer border transition-all duration-150 gap-3 ${
                  isConfirmed
                    ? 'border-emerald-500/40 bg-slate-900/70 shadow-sm shadow-emerald-500/10 hover:border-emerald-400/70'
                    : evaluation.status === 'Em verificação'
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-transparent hover:border-slate-700/60'
                }`}
                role="button"
                tabIndex={0}
              >
                {/* Left category icon */}
                <div
                  className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border ${bg} transition-transform group-hover:scale-105`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>

                {/* Middle details */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Status & Confidence row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Verification Status Badge */}
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${statusConfig.badgeBg} ${statusConfig.badgeText}`}>
                      {evaluation.status === 'Confirmado' ? (
                        <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                      ) : evaluation.status === 'Em verificação' ? (
                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                      ) : evaluation.status === 'Resolvido' ? (
                        <CheckCircle2 className="w-2.5 h-2.5 text-slate-400" />
                      ) : (
                        <Radio className="w-2.5 h-2.5 text-blue-400" />
                      )}
                      <span>{statusConfig.label}</span>
                    </span>

                    {/* Confidence pill */}
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${levelConfig.pill}`}>
                      <span className={`w-1 h-1 rounded-full ${levelConfig.dot}`} />
                      <span>{evaluation.score}%</span>
                    </span>

                    <span className="text-[10px] text-slate-400 truncate max-w-[130px] sm:max-w-none">
                      {evaluation.sourcesSummary}
                    </span>
                  </div>

                  <h4 className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors truncate">
                    {item.title}
                  </h4>

                  {/* Location & Updated time */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <MapPin className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="truncate">{item.district} · {evaluation.lastUpdatedText}</span>
                  </div>

                  {/* Badges & Metrics Row */}
                  <div className="flex items-center gap-2.5 pt-0.5">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${getSeverityBadge(item.severity)}`}>
                      {item.severity}
                    </span>

                    {/* Community Confirmations Counter */}
                    <div 
                      className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${
                        isConfirmed 
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60 font-bold' 
                          : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                      title={`${evaluation.confirmations} confirmações comunitárias`}
                    >
                      <ThumbsUp className="w-2.5 h-2.5 text-emerald-400" />
                      <span>{evaluation.confirmations}</span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                      <MessageSquare className="w-3 h-3 text-slate-500" />
                      <span>{item.commentsCount}</span>
                    </div>

                    {item.imagesCount > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                        <Camera className="w-3 h-3 text-slate-500" />
                        <span>{item.imagesCount}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right thumbnail photo (if exists) */}
                {item.imageUrl && (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 border border-slate-700/80 bg-slate-900 group-hover:border-slate-500 transition-colors">
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

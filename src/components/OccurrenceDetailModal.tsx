import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Train, 
  Clock, 
  ThumbsUp, 
  ThumbsDown,
  Share2, 
  MessageSquare, 
  Camera, 
  ShieldCheck, 
  AlertTriangle,
  Award,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { Occurrence } from '../types';

interface OccurrenceDetailModalProps {
  occurrence: Occurrence | null;
  onClose: () => void;
  voterId?: string;
  onVote?: (id: string, action: 'confirm' | 'unconfirm') => void;
  onUpdateStatus?: (id: string, newStatus: 'Ativa' | 'Em resolução' | 'Resolvida') => void;
}

export const OccurrenceDetailModal: React.FC<OccurrenceDetailModalProps> = ({
  occurrence,
  onClose,
  voterId,
  onVote,
  onUpdateStatus,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  if (!occurrence) return null;

  const confirmations = occurrence.confirmationsCount !== undefined ? occurrence.confirmationsCount : (occurrence.upvotes || 0);
  const unconfirmed = occurrence.unconfirmedCount || 0;

  const hasConfirmed = voterId && occurrence.confirmedBy ? occurrence.confirmedBy.includes(voterId) : false;
  const hasUnconfirmed = voterId && occurrence.unconfirmedBy ? occurrence.unconfirmedBy.includes(voterId) : false;
  const isHighlighted = occurrence.isCommunityVerified || confirmations >= 3;

  const handleVote = (action: 'confirm' | 'unconfirm') => {
    if (action === 'confirm' && hasConfirmed) {
      setVoteFeedback('Já confirmaste esta ocorrência com esta conta.');
      setTimeout(() => setVoteFeedback(null), 2500);
      return;
    }
    if (action === 'unconfirm' && hasUnconfirmed) {
      setVoteFeedback('Já marcaste esta ocorrência como não confirmada.');
      setTimeout(() => setVoteFeedback(null), 2500);
      return;
    }

    if (onVote) {
      onVote(occurrence.id, action);
      setVoteFeedback(action === 'confirm' ? 'Obrigado por confirmares! (+ reputação atribuída)' : 'Voto registado.');
      setTimeout(() => setVoteFeedback(null), 3000);
    }
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className={`relative w-full max-w-xl rounded-3xl bg-[#0b1220] border ${
          isHighlighted ? 'border-amber-500/60 shadow-amber-500/10' : 'border-slate-700/80'
        } overflow-hidden shadow-2xl text-slate-100 my-8 animate-in fade-in zoom-in-95 duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-20 p-2 text-white bg-black/50 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Photo if available */}
        {occurrence.imageUrl && (
          <div className="relative h-56 sm:h-64 w-full">
            <img
              src={occurrence.imageUrl}
              alt={occurrence.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-transparent to-black/40" />
          </div>
        )}

        <div className="p-5 sm:p-7 space-y-4">
          {/* Top Badges & Highlights */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase border ${
                occurrence.severity === 'Grave'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : occurrence.severity === 'Moderada'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              }`}
            >
              {occurrence.severity}
            </span>

            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {occurrence.type}
            </span>

            {/* Prominent Highlight Badge for community-verified reports */}
            {isHighlighted && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-sm animate-pulse">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Destaque Comunitário ({confirmations} confirmações)</span>
              </span>
            )}
          </div>

          {/* Title & Metadata */}
          <div>
            {/* Official Source Banner */}
            {occurrence.sourceName && (
              <div className="mb-3 p-3 rounded-2xl bg-emerald-950/40 border border-emerald-600/40 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-300">Fonte Oficial Verificada:</span>{' '}
                    <span className="text-white font-medium">{occurrence.sourceName}</span>
                    {occurrence.sourceType && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-900/60 text-emerald-200">
                        {occurrence.sourceType}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {occurrence.sourceFetchedAt && (
                    <span className="text-[11px] text-emerald-400 font-mono">
                      {new Date(occurrence.sourceFetchedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {occurrence.sourceUrl && (
                    <a
                      href={occurrence.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-[11px] font-semibold underline"
                    >
                      Fonte ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            <h3 className="text-xl sm:text-2xl font-bold text-white leading-snug">
              {occurrence.title}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span>{occurrence.locationDetails || occurrence.district}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Reportado {occurrence.reportedAt}</span>
              </div>
              {occurrence.companyOrService && (
                <div className="flex items-center gap-1">
                  <Train className="w-3.5 h-3.5 text-amber-400" />
                  <span>{occurrence.companyOrService}</span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-sm text-slate-200 leading-relaxed">
            {occurrence.description}
          </div>

          {/* Community Verification Callout when highlighted */}
          {isHighlighted && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 border border-amber-500/40 text-xs">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-200 block text-sm">
                  Ocorrência em Destaque pela Comunidade
                </strong>
                <p className="text-slate-300 mt-0.5">
                  Esta ocorrência foi confirmada por {confirmations} cidadãos no local, atestando elevada precisão em tempo real.
                </p>
              </div>
            </div>
          )}

          {/* Operational Status */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-blue-950/40 border border-blue-900/50 text-xs">
            <div className="flex items-center gap-2 text-blue-300">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>Estado da ocorrência: <strong>{occurrence.status}</strong></span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              PAROU.PT Network
            </span>
          </div>

          {/* Author Attribution */}
          {occurrence.authorName ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
              <span className="text-slate-400">
                Reportado por: <strong className="text-white">{occurrence.authorName}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 font-bold text-[10px] border border-blue-500/30 flex items-center gap-1">
                ★ Colaborador Registado
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-[11px] text-slate-500">
              <span>Reportado pela comunidade</span>
              <span className="text-slate-400">Anónimo</span>
            </div>
          )}

          {/* Feedback banner */}
          {voteFeedback && (
            <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-800 text-xs text-blue-200 text-center animate-in fade-in">
              {voteFeedback}
            </div>
          )}

          {/* Community Confirmation Section */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  Confirmação Comunitária
                </span>
                <span className="text-[11px] text-slate-400">
                  Estás ou estiveste no local? Confirma ou desmente este report.
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {confirmations} confirmações
                </span>
                {unconfirmed > 0 && (
                  <span className="text-[11px] font-mono text-slate-500 block">
                    {unconfirmed} não confirmados
                  </span>
                )}
              </div>
            </div>

            {/* Voting Action Buttons: "Confirmar" e "Não confirmado" */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Button Confirmar */}
              <button
                onClick={() => handleVote('confirm')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  hasConfirmed
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/25 ring-2 ring-emerald-400/40'
                    : 'bg-slate-900/90 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-800 hover:border-emerald-500/50'
                }`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 ${hasConfirmed ? 'fill-white' : 'text-emerald-400'}`} />
                <span>Confirmar ({confirmations})</span>
                {hasConfirmed && <CheckCircle2 className="w-3.5 h-3.5 ml-1 text-white" />}
              </button>

              {/* Button Não confirmado */}
              <button
                onClick={() => handleVote('unconfirm')}
                className={`flex-1 min-w-[130px] flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  hasUnconfirmed
                    ? 'bg-rose-900/80 border-rose-600 text-white shadow-lg shadow-rose-900/25 ring-2 ring-rose-500/40'
                    : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-rose-500/50'
                }`}
              >
                <ThumbsDown className={`w-3.5 h-3.5 ${hasUnconfirmed ? 'fill-white' : 'text-rose-400'}`} />
                <span>Não confirmado ({unconfirmed})</span>
              </button>

              {/* Share Button */}
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                title="Partilhar ocorrência"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Copiado!' : 'Partilhar'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

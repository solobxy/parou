import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  AlertTriangle,
  ThumbsUp,
  Share2
} from 'lucide-react';
import { Occurrence } from '../types';
import { quandoAconteceu } from '../utils/quando';
import { resumoDoVotante } from '../utils/resumo';
import { t } from '../i18n';
import { rotuloTipoOcorrencia } from '../utils/rotulos';

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
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  if (!occurrence) return null;

  const confirmations = occurrence.confirmationsCount !== undefined ? occurrence.confirmationsCount : (occurrence.upvotes || 0);
  const hasConfirmed = voterId && occurrence.confirmedBy ? occurrence.confirmedBy.includes(resumoDoVotante(voterId)) : false;
  const isSevere = occurrence.severity === 'Grave';

  const handleVote = (action: 'confirm' | 'unconfirm') => {
    if (action === 'confirm' && hasConfirmed) {
      setVoteFeedback(t('Já confirmaste esta ocorrência.'));
      setTimeout(() => setVoteFeedback(null), 2000);
      return;
    }

    if (onVote) {
      onVote(occurrence.id, action);
      setVoteFeedback(action === 'confirm' ? t('Confirmado.') : t('Voto registado.'));
      setTimeout(() => setVoteFeedback(null), 2000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-lg rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] overflow-hidden shadow-xl text-[#111111] animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between gap-3 bg-[#FFFFFF]">
          <div className="flex items-center gap-2 min-w-0">
            {isSevere && <AlertTriangle className="w-4 h-4 text-[#D92D20] stroke-[2] shrink-0" />}
            <span className="text-xs font-semibold text-[#6B6B6B] uppercase">
              {rotuloTipoOcorrencia(occurrence.type)} · {t(occurrence.severity)}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label={t('Fechar')}
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Photo if any */}
        {occurrence.imageUrl && (
          <div className="h-48 w-full border-b border-[#E6E6E3] overflow-hidden">
            <img
              src={occurrence.imageUrl}
              alt={occurrence.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Body */}
        <div className="p-4 space-y-3">
          <h2 className="text-[18px] font-semibold text-[#111111] leading-snug">
            {occurrence.title}
          </h2>

          <p className="text-sm text-[#6B6B6B] leading-relaxed whitespace-pre-line">
            {occurrence.description}
          </p>

          <div className="pt-2 border-t border-[#E6E6E3] space-y-1.5 text-xs text-[#6B6B6B]">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#111111] stroke-[2] shrink-0" />
              <span>{occurrence.locationDetails || `${t(occurrence.concelho)}, ${t(occurrence.district)}`}</span>
            </div>
            {occurrence.transporte && (
              <div>
                <span>{t('Transporte:')} <strong>{occurrence.transporte}</strong></span>
              </div>
            )}
            <div>
              <span>{t('Publicado:')} <strong className="font-condensada tabular-nums">{quandoAconteceu(occurrence)}</strong></span>
            </div>
          </div>

          {voteFeedback && (
            <div className="p-2 text-xs bg-[#F4F4F2] text-[#111111] rounded-[6px]">
              {voteFeedback}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-[#E6E6E3] flex items-center justify-between gap-2">
            <button
              onClick={() => handleVote('confirm')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] text-xs font-semibold min-h-[44px] transition-colors cursor-pointer ${
                hasConfirmed
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111]'
              }`}
            >
              <ThumbsUp className="w-4 h-4 stroke-[2]" />
              <span>{t('Confirmar ({n})', { n: confirmations })}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer"
            >
              <Share2 className="w-4 h-4 stroke-[2]" />
              <span>{copiedLink ? t('Copiado') : t('Partilhar')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

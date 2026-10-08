import React, { useState } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  AlertTriangle, 
  ThumbsUp, 
  Share2, 
  ChevronRight
} from 'lucide-react';
import { Occurrence } from '../types';
import { quandoAconteceu } from '../utils/quando';

interface ReportDetailPageProps {
  occurrence: Occurrence;
  onBack: () => void;
  voterId: string;
  onVote: (id: string, action: 'confirm' | 'unconfirm') => void;
  onSelectOccurrence: (occ: Occurrence) => void;
  relatedOccurrences: Occurrence[];
}

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({
  occurrence,
  onBack,
  voterId,
  onVote,
  onSelectOccurrence,
  relatedOccurrences,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);

  const confirmations = occurrence.confirmationsCount !== undefined ? occurrence.confirmationsCount : (occurrence.upvotes || 0);
  const hasConfirmed = occurrence.confirmedBy?.includes(voterId) || false;
  const isSevere = occurrence.severity === 'Grave';

  const handleVoteClick = (action: 'confirm' | 'unconfirm') => {
    if (action === 'confirm' && hasConfirmed) {
      setVoteFeedback('Esta conta já confirmou esta ocorrência.');
      setTimeout(() => setVoteFeedback(null), 2000);
      return;
    }

    onVote(occurrence.id, action);
    setVoteFeedback(action === 'confirm' ? 'Confirmado.' : 'Voto registado.');
    setTimeout(() => setVoteFeedback(null), 2000);
  };

  const handleShareClick = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-3 sm:px-0 space-y-4">
      {/* Top back button */}
      <div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-xs font-semibold text-[#111111] transition-colors cursor-pointer min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4 stroke-[2]" />
          <span>Voltar</span>
        </button>
      </div>

      {/* Main Card */}
      <article className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] overflow-hidden">
        {/* Photo if present */}
        {occurrence.imageUrl && (
          <div className="h-64 sm:h-80 w-full overflow-hidden border-b border-[#E6E6E3]">
            <img
              src={occurrence.imageUrl}
              alt={occurrence.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-4 sm:p-6 space-y-4">
          {/* Metadata bar */}
          <div className="flex items-center justify-between gap-2 text-xs text-[#6B6B6B] border-b border-[#E6E6E3] pb-3">
            <div className="flex items-center gap-2">
              {isSevere && <AlertTriangle className="w-4 h-4 text-[#D92D20] stroke-[2]" />}
              <span className="font-semibold text-[#111111]">{occurrence.type}</span>
              <span>·</span>
              <span>{occurrence.severity}</span>
            </div>
            <span className="font-['Barlow_Condensed'] tabular-nums">{quandoAconteceu(occurrence)}</span>
          </div>

          {/* Title & Description */}
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111111] leading-tight">
              {occurrence.title}
            </h1>
            <p className="text-sm text-[#111111] mt-3 leading-relaxed whitespace-pre-line">
              {occurrence.description}
            </p>
          </div>

          {/* Details */}
          <div className="p-3 bg-[#F4F4F2] rounded-[8px] space-y-1.5 text-xs text-[#6B6B6B]">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#111111] stroke-[2] shrink-0" />
              <span>{occurrence.locationDetails || `${occurrence.concelho}, ${occurrence.district}`}</span>
            </div>
            {occurrence.transporte && (
              <div>
                Transporte: <strong className="text-[#111111]">{occurrence.transporte}</strong>
              </div>
            )}
            <div>
              Autor: <strong className="text-[#111111]">{occurrence.authorName}</strong>
            </div>
          </div>

          {voteFeedback && (
            <div className="p-2 text-xs bg-[#F4F4F2] text-[#111111] rounded-[6px]">
              {voteFeedback}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#E6E6E3]">
            <button
              onClick={() => handleVoteClick('confirm')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-xs font-semibold min-h-[44px] transition-colors cursor-pointer ${
                hasConfirmed
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111]'
              }`}
            >
              <ThumbsUp className="w-4 h-4 stroke-[2]" />
              <span>Confirmar ({confirmations})</span>
            </button>

            <button
              onClick={handleShareClick}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer"
            >
              <Share2 className="w-4 h-4 stroke-[2]" />
              <span>{copiedLink ? 'Copiado' : 'Partilhar'}</span>
            </button>
          </div>
        </div>
      </article>

      {/* Related occurrences */}
      {relatedOccurrences && relatedOccurrences.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-base font-semibold text-[#111111]">
            Ocorrências relacionadas
          </h2>
          <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
            {relatedOccurrences.map((rel) => (
              <div
                key={rel.id}
                onClick={() => onSelectOccurrence(rel)}
                className="p-3 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-2 min-h-[44px]"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#111111] truncate">{rel.title}</h3>
                  <p className="text-xs text-[#6B6B6B] truncate">{rel.district} · {quandoAconteceu(rel)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2] shrink-0" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Train, AlertCircle, ShieldCheck, Clock, Radio, CheckCircle2 } from 'lucide-react';
import { Occurrence } from '../types';
import { calculateConfidence, getVerificationStatusConfig, getConfidenceLevelConfig } from '../utils/confidenceUtils';

interface FeaturedOccurrenceProps {
  occurrences: Occurrence[];
  onSelectOccurrence: (occurrence: Occurrence) => void;
}

export const FeaturedOccurrence: React.FC<FeaturedOccurrenceProps> = ({
  occurrences,
  onSelectOccurrence,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!occurrences || occurrences.length === 0) return null;

  const current = occurrences[currentIndex] || occurrences[0];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === 0 ? occurrences.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev === occurrences.length - 1 ? 0 : prev + 1));
  };

  const evaluation = calculateConfidence(current);
  const statusConfig = getVerificationStatusConfig(evaluation.status);
  const levelConfig = getConfidenceLevelConfig(evaluation.level);

  return (
    <div
      onClick={() => onSelectOccurrence(current)}
      className={`group relative h-[280px] sm:h-80 lg:h-96 w-full rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer shadow-2xl transition-all duration-300 focus:outline-none border ${
        evaluation.status === 'Confirmado'
          ? 'border-emerald-500/50 shadow-emerald-500/15 hover:border-emerald-400'
          : 'border-slate-800/80 hover:border-slate-700'
      }`}
      role="button"
      tabIndex={0}
    >
      {/* Background Image with Cinematic Scrim */}
      {current.imageUrl ? (
        <img
          src={current.imageUrl}
          alt={current.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />
      )}

      {/* Scrim Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#060a12] via-[#060a12]/75 to-[#060a12]/35" />

      {/* Content Container */}
      <div className="relative h-full flex flex-col justify-between p-3.5 sm:p-5 lg:p-6 text-white">
        {/* Top Kicker Bar: Severity Badge, Verification Status, Confidence Level & Relative Time */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Severity Pill */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:py-1 rounded-full bg-red-600/90 text-white text-[10px] sm:text-[11px] font-bold tracking-wide uppercase shadow-lg shadow-red-600/30">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>{current.severity ? current.severity.toUpperCase() : 'GRAVE'}</span>
            </div>

            {/* Verification Status Badge */}
            <div className={`inline-flex items-center gap-1 px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wide border shadow-md ${
              evaluation.status === 'Confirmado'
                ? 'bg-emerald-500/90 text-slate-950 border-emerald-400/80 shadow-emerald-500/30'
                : statusConfig.bg + ' ' + statusConfig.text + ' ' + statusConfig.border
            }`}>
              {evaluation.status === 'Confirmado' ? (
                <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
              ) : evaluation.status === 'Em verificação' ? (
                <Clock className="w-3 h-3 text-amber-300" />
              ) : evaluation.status === 'Resolvido' ? (
                <CheckCircle2 className="w-3 h-3 text-slate-300" />
              ) : (
                <Radio className="w-3 h-3 text-blue-300" />
              )}
              <span>{statusConfig.label}</span>
              {evaluation.confirmations > 0 && evaluation.status === 'Confirmado' && (
                <span className="text-[10px] opacity-90">({evaluation.confirmations})</span>
              )}
            </div>

            {/* Confidence Pill */}
            <div className={`hidden xs:inline-flex items-center gap-1 px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold border backdrop-blur-md ${levelConfig.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${levelConfig.dot}`} />
              <span>{evaluation.score}% Confiança</span>
            </div>
          </div>

          <span className="text-[10px] sm:text-xs font-medium text-slate-300 drop-shadow flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>{evaluation.lastUpdatedText}</span>
          </span>
        </div>

        {/* Center & Bottom Information */}
        <div className="space-y-1.5 sm:space-y-2">
          <h2 className="text-base sm:text-xl lg:text-2xl font-bold leading-snug tracking-tight text-white group-hover:text-blue-200 transition-colors [text-wrap:balance]">
            {current.title}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 leading-relaxed">
            {current.description}
          </p>

          {/* Tags with Location, Company and Source Provenance */}
          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 sm:gap-x-4 pt-0.5 sm:pt-1 text-[11px] sm:text-xs text-slate-300 font-medium">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400 shrink-0" />
              <span>{current.district}</span>
            </div>

            {current.companyOrService && (
              <div className="flex items-center gap-1.5">
                <Train className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-400 shrink-0" />
                <span>{current.companyOrService}</span>
              </div>
            )}

            {/* Source Display */}
            <div className="flex items-center gap-1.5 text-slate-300/90 bg-slate-900/60 px-2 py-0.5 rounded-md border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase">Fonte:</span>
              <span className="font-semibold text-white truncate max-w-[140px] sm:max-w-xs">{evaluation.sourcesSummary}</span>
            </div>
          </div>

          {/* Carousel Pagination & Arrows */}
          <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-800/60 mt-1 sm:mt-2">
            <button
              onClick={handlePrev}
              aria-label="Ocorrência anterior"
              className="p-1 sm:p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white border border-slate-700/60 backdrop-blur-sm transition-all cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Dots */}
            <div className="flex items-center gap-1.5">
              {occurrences.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  aria-label={`Ver slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === currentIndex ? 'w-5 sm:w-6 bg-white' : 'w-1.5 bg-slate-500 hover:bg-slate-300'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              aria-label="Próxima ocorrência"
              className="p-1 sm:p-1.5 rounded-full bg-black/40 hover:bg-black/70 text-slate-300 hover:text-white border border-slate-700/60 backdrop-blur-sm transition-all cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { Occurrence } from '../types';
import { quandoAconteceu } from '../utils/quando';

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

  const isSevere = current.severity === 'Grave';

  return (
    <div
      onClick={() => onSelectOccurrence(current)}
      className="p-4 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] hover:border-[#111111] transition-colors cursor-pointer space-y-2.5"
      role="button"
      tabIndex={0}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isSevere ? (
            <span className="flex items-center gap-1 text-xs font-bold text-[#D92D20]">
              <AlertTriangle className="w-4 h-4 stroke-[2]" />
              <span>Grave</span>
            </span>
          ) : (
            <span className="text-xs font-bold text-[#111111]">
              Aviso
            </span>
          )}
          {current.transporte && (
            <span className="text-xs text-[#6B6B6B]">
              · {current.transporte}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B6B6B] font-condensada tabular-nums">
            {quandoAconteceu(current)}
          </span>
          {occurrences.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                className="p-1 rounded-[4px] hover:bg-[#E6E6E3] text-[#111111] cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2]" />
              </button>
              <button
                onClick={handleNext}
                className="p-1 rounded-[4px] hover:bg-[#E6E6E3] text-[#111111] cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Title & Description */}
      <div>
        <h3 className="text-[18px] font-semibold text-[#111111] leading-snug">
          {current.title}
        </h3>
        <p className="text-sm text-[#6B6B6B] mt-1 line-clamp-2 leading-relaxed">
          {current.description}
        </p>
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B] pt-1 border-t border-[#E6E6E3]">
        <MapPin className="w-3.5 h-3.5 text-[#111111] stroke-[2] shrink-0" />
        <span className="truncate">
          {current.district}{current.concelho ? ` · ${current.concelho}` : ''}
        </span>
      </div>
    </div>
  );
};

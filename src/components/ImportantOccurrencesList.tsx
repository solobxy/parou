import React from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { Occurrence } from '../types';
import { quandoAconteceu } from '../utils/quando';

interface ImportantOccurrencesListProps {
  occurrences: Occurrence[];
  onSelectOccurrence: (occurrence: Occurrence) => void;
  onViewAll: () => void;
}

export const ImportantOccurrencesList: React.FC<ImportantOccurrencesListProps> = ({
  occurrences,
  onSelectOccurrence,
  onViewAll,
}) => {
  return (
    <div className="w-full rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] overflow-hidden">
      {/* Header */}
      <div className="p-3.5 bg-[#F4F4F2] border-b border-[#E6E6E3] flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#111111]">
          Ocorrências importantes
        </h3>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-[#111111] hover:underline cursor-pointer min-h-[32px] flex items-center"
        >
          Ver todas
        </button>
      </div>

      {/* List */}
      <div className="divide-y divide-[#E6E6E3]">
        {occurrences.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#6B6B6B]">
            Sem ocorrências importantes no momento.
          </div>
        ) : (
          occurrences.map((item) => {
            const isSevere = item.severity === 'Grave';

            return (
              <div
                key={item.id}
                onClick={() => onSelectOccurrence(item)}
                className="p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
                role="button"
                tabIndex={0}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isSevere && (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#D92D20] stroke-[2] shrink-0" />
                    )}
                    <h4 className="text-sm font-semibold text-[#111111] truncate">
                      {item.title}
                    </h4>
                  </div>
                  <div className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                    {item.district}{item.concelho ? ` · ${item.concelho}` : ''}
                    {item.transporte ? ` · ${item.transporte}` : ''}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2 text-right">
                  <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums">
                    {quandoAconteceu(item)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2]" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

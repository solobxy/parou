import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  AlertTriangle, 
  ChevronRight
} from 'lucide-react';
import { Occurrence, SeverityLevel } from '../types';
import { MapCluster } from '../utils/mapClustering';
import { quandoAconteceu } from '../utils/quando';

interface ClusterDetailModalProps {
  cluster: MapCluster | null;
  onClose: () => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
}

export const ClusterDetailModal: React.FC<ClusterDetailModalProps> = ({
  cluster,
  onClose,
  onSelectOccurrence,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'Todas' | SeverityLevel>('Todas');

  if (!cluster) return null;

  const filteredOccurrences = cluster.occurrences.filter((occ) => {
    if (severityFilter === 'Todas') return true;
    return occ.severity === severityFilter;
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[85vh] flex flex-col rounded-t-[8px] sm:rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] overflow-hidden text-[#111111]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex items-start justify-between gap-3 bg-[#FFFFFF]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 text-xs text-[#6B6B6B]">
              <span className="font-semibold text-[#111111]">{cluster.dominantSeverity}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 stroke-[2] text-[#111111]" />
                <span>{cluster.district}</span>
              </span>
            </div>

            <h3 className="text-base font-bold text-[#111111] flex items-center gap-2">
              <span>{cluster.name}</span>
              <span className="font-['Barlow_Condensed'] text-xs font-bold text-[#6B6B6B] tabular-nums">
                ({cluster.totalCount})
              </span>
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Severity Filter Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-[#E6E6E3] bg-[#F4F4F2] text-xs">
          {(['Todas', 'Grave', 'Moderada', 'Informação'] as const).map((sev) => {
            const count = sev === 'Todas' 
              ? cluster.totalCount 
              : cluster.occurrences.filter((o) => o.severity === sev).length;

            return (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded-[6px] font-semibold cursor-pointer min-h-[32px] transition-colors ${
                  severityFilter === sev
                    ? 'bg-[#111111] text-[#FFFFFF]'
                    : 'text-[#6B6B6B] hover:text-[#111111]'
                }`}
              >
                {sev} ({count})
              </button>
            );
          })}
        </div>

        {/* Occurrences List: 1px divider lines */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#E6E6E3] bg-[#FFFFFF]">
          {filteredOccurrences.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#6B6B6B]">
              Sem ocorrências para este filtro.
            </div>
          ) : (
            filteredOccurrences.map((occ) => {
              const isSevere = occ.severity === 'Grave';

              return (
                <div
                  key={occ.id}
                  onClick={() => {
                    onClose();
                    onSelectOccurrence(occ);
                  }}
                  className="p-3.5 hover:bg-[#F4F4F2] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
                  role="button"
                  tabIndex={0}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isSevere && <AlertTriangle className="w-3.5 h-3.5 text-[#D92D20] stroke-[2] shrink-0" />}
                      <h4 className="text-sm font-semibold text-[#111111] truncate">
                        {occ.title}
                      </h4>
                    </div>

                    <div className="text-xs text-[#6B6B6B] mt-0.5 truncate">
                      {occ.concelho || occ.district}
                      {occ.transporte ? ` · ${occ.transporte}` : ''}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 text-right">
                    <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums">
                      {quandoAconteceu(occ)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2]" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

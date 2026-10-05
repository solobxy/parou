import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  AlertTriangle, 
  ChevronRight, 
  Clock, 
  ShieldCheck, 
  Layers, 
  Car, 
  Train, 
  Zap, 
  Users, 
  Wrench, 
  AlertCircle,
  ThumbsUp,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { Occurrence, OccurrenceType, SeverityLevel } from '../types';
import { MapCluster, getSeverityStyle } from '../utils/mapClustering';
import { ConfidenceMeter } from './ConfidenceMeter';
import { calculateConfidence, getVerificationStatusConfig } from '../utils/confidenceUtils';
import { FavoriteButton } from './FavoriteButton';

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

  const style = getSeverityStyle(cluster.dominantSeverity);

  const filteredOccurrences = cluster.occurrences.filter((occ) => {
    if (severityFilter === 'Todas') return true;
    return occ.severity === severityFilter;
  });

  const getCategoryIcon = (type: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return { Icon: Car, color: 'text-red-400 bg-red-500/20 border-red-500/30' };
      case 'ATRASOS':
        return { Icon: Train, color: 'text-amber-400 bg-amber-500/20 border-amber-500/30' };
      case 'AVARIA':
        return { Icon: Zap, color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30' };
      case 'GREVE':
        return { Icon: Users, color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' };
      case 'OBRAS':
        return { Icon: Wrench, color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/30' };
      default:
        return { Icon: AlertCircle, color: 'text-slate-300 bg-slate-700/40 border-slate-600' };
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[85vh] sm:max-h-[80vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#090f1d] border border-slate-700/80 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Pull Handle */}
        <div className="sm:hidden w-full pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-slate-700/80" />
        </div>

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-900/90 to-[#0b1428]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${style.badge}`}>
                Cluster {cluster.dominantSeverity}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-red-400" />
                <span>{cluster.district}</span>
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400 shrink-0" />
              <span>{cluster.name}</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-300 border border-blue-500/30">
                {cluster.totalCount} {cluster.totalCount === 1 ? 'ocorrência' : 'ocorrências'}
              </span>
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <FavoriteButton
              item={{
                id: `district-${cluster.district.toLowerCase()}`,
                type: 'regiao',
                category: 'locais',
                title: `Distrito de ${cluster.district}`,
                subtitle: `${cluster.totalCount} ocorrências ativas`,
                locality: cluster.district,
                district: cluster.district,
              }}
              size="sm"
            />
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700/60"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Severity Metrics & Filter Tabs */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setSeverityFilter('Todas')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                severityFilter === 'Todas'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Todas ({cluster.totalCount})
            </button>
            {cluster.graveCount > 0 && (
              <button
                onClick={() => setSeverityFilter('Grave')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  severityFilter === 'Grave'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-950/40'
                }`}
              >
                Graves ({cluster.graveCount})
              </button>
            )}
            {cluster.moderadaCount > 0 && (
              <button
                onClick={() => setSeverityFilter('Moderada')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  severityFilter === 'Moderada'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
                }`}
              >
                Moderadas ({cluster.moderadaCount})
              </button>
            )}
            {cluster.infoCount > 0 && (
              <button
                onClick={() => setSeverityFilter('Informação')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  severityFilter === 'Informação'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-blue-400 hover:text-blue-300 hover:bg-blue-950/40'
                }`}
              >
                Info ({cluster.infoCount})
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
            Densidade: {cluster.densityScore}%
          </span>
        </div>

        {/* Occurrences List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 divide-y divide-slate-800/40">
          {filteredOccurrences.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Nenhuma ocorrência encontrada com esta gravidade.
            </div>
          ) : (
            filteredOccurrences.map((occ) => {
              const { Icon, color } = getCategoryIcon(occ.type);
              const evaluation = calculateConfidence(occ);
              const statusConfig = getVerificationStatusConfig(evaluation.status);
              const isConfirmed = evaluation.status === 'Confirmado';

              return (
                <div
                  key={occ.id}
                  onClick={() => {
                    onSelectOccurrence(occ);
                    onClose();
                  }}
                  className={`group pt-2.5 first:pt-0 p-2.5 rounded-2xl cursor-pointer border transition-all ${
                    isConfirmed
                      ? 'bg-slate-900/60 border-emerald-500/30 hover:border-emerald-500/60'
                      : 'hover:bg-slate-800/50 border-transparent hover:border-slate-700/60'
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${color} mt-0.5`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Top badging */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className={`px-1.5 py-0.5 rounded-md font-bold border ${statusConfig.badgeBg} ${statusConfig.badgeText}`}>
                          {statusConfig.label}
                        </span>

                        <span className="px-1.5 py-0.5 rounded-md font-mono bg-slate-800 text-slate-300">
                          {evaluation.score}% Confiança
                        </span>

                        <span className="text-slate-400 truncate max-w-[130px]">
                          {evaluation.sourcesSummary}
                        </span>

                        <span className="text-slate-500 ml-auto">
                          {evaluation.lastUpdatedText}
                        </span>
                      </div>

                      <h4 className="text-xs sm:text-sm font-bold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                        {occ.title}
                      </h4>

                      <p className="text-xs text-slate-300 line-clamp-2">
                        {occ.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400 pt-0.5">
                        <span className="text-slate-300 font-medium">
                          {occ.concelho || occ.district}
                        </span>
                        {occ.companyOrService && (
                          <>
                            <span>·</span>
                            <span className="text-slate-400">{occ.companyOrService}</span>
                          </>
                        )}
                        {occ.confirmationsCount ? (
                          <>
                            <span>·</span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {occ.confirmationsCount} confirmações
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div className="pt-2 shrink-0">
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span className="text-[11px]">
            Toque numa ocorrência para abrir os detalhes completos
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

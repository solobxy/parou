import React from 'react';
import { 
  Car, 
  Train, 
  Zap, 
  Users, 
  Wrench, 
  AlertCircle, 
  ChevronRight, 
  ArrowRight,
  ShieldCheck,
  Clock,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { Occurrence, OccurrenceType } from '../types';
import { ConfidenceMeter } from './ConfidenceMeter';
import { calculateConfidence } from '../utils/confidenceUtils';

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
  const getCategoryConfig = (type: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return {
          icon: Car,
          label: 'ACIDENTE',
          bg: 'bg-red-500/15',
          border: 'border-red-500/30',
          text: 'text-red-400',
          iconColor: 'text-red-400',
          tagBg: 'bg-red-500/20 text-red-300',
        };
      case 'ATRASOS':
        return {
          icon: Train,
          label: 'ATRASOS',
          bg: 'bg-amber-500/15',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          iconColor: 'text-amber-400',
          tagBg: 'bg-amber-500/20 text-amber-300',
        };
      case 'AVARIA':
        return {
          icon: Zap,
          label: 'AVARIA',
          bg: 'bg-yellow-500/15',
          border: 'border-yellow-500/30',
          text: 'text-yellow-400',
          iconColor: 'text-yellow-400',
          tagBg: 'bg-yellow-500/20 text-yellow-300',
        };
      case 'GREVE':
        return {
          icon: Users,
          label: 'GREVE',
          bg: 'bg-blue-500/15',
          border: 'border-blue-500/30',
          text: 'text-blue-400',
          iconColor: 'text-blue-400',
          tagBg: 'bg-blue-500/20 text-blue-300',
        };
      case 'OBRAS':
        return {
          icon: Wrench,
          label: 'OBRAS',
          bg: 'bg-cyan-500/15',
          border: 'border-cyan-500/30',
          text: 'text-cyan-400',
          iconColor: 'text-cyan-400',
          tagBg: 'bg-cyan-500/20 text-cyan-300',
        };
      default:
        return {
          icon: AlertCircle,
          label: 'ALERTA',
          bg: 'bg-slate-700/30',
          border: 'border-slate-600',
          text: 'text-slate-300',
          iconColor: 'text-slate-300',
          tagBg: 'bg-slate-800 text-slate-300',
        };
    }
  };

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 p-3 sm:p-5 shadow-xl backdrop-blur-md">
      {/* Header with Title and "Ver todas ->" */}
      <div className="flex items-center justify-between pb-3.5 mb-2 border-b border-slate-800/80">
        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
          <span>Outras ocorrências importantes</span>
        </h3>
        <button
          onClick={onViewAll}
          className="group inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
        >
          <span>Ver todas</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* List Rows */}
      <div className="space-y-2">
        {occurrences.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-1">
            <p className="text-xs font-bold text-slate-300">Sem dados disponíveis</p>
            <p className="text-[11px] text-slate-500">Nenhum alerta de relevância ativo no momento.</p>
          </div>
        ) : (
          occurrences.map((item) => {
          const config = getCategoryConfig(item.type);
          const Icon = config.icon;
          const evaluation = calculateConfidence(item);
          const isConfirmed = evaluation.status === 'Confirmado';

          return (
            <div
              key={item.id}
              onClick={() => onSelectOccurrence(item)}
              className={`group flex items-start sm:items-center justify-between p-3 rounded-2xl cursor-pointer border transition-all duration-150 ${
                isConfirmed
                  ? 'bg-slate-900/60 border-emerald-500/30 hover:border-emerald-500/60 shadow-sm shadow-emerald-500/5'
                  : 'hover:bg-slate-800/50 border-transparent hover:border-slate-700/60'
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                {/* Category Icon square */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${config.border} ${config.bg} transition-transform group-hover:scale-105 mt-0.5 sm:mt-0`}
                >
                  <Icon className={`w-5 h-5 ${config.iconColor}`} />
                </div>

                {/* Content text */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`px-2 py-0.5 rounded-md font-bold tracking-wider text-[10px] ${config.tagBg}`}>
                      {config.label}
                    </span>
                    <ConfidenceMeter occurrence={item} variant="compact" showSourceAndTime={false} />
                  </div>

                  <h4 className="text-xs sm:text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                    {item.title}
                  </h4>

                  {/* Location & Source footer */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                    <span className="truncate max-w-[130px] sm:max-w-none text-slate-300">{item.locationDetails}</span>
                    <span>·</span>
                    <span className="text-slate-400 truncate max-w-[140px]">{evaluation.sourcesSummary}</span>
                    <span>·</span>
                    <span className="text-slate-500">{evaluation.lastUpdatedText}</span>
                  </div>
                </div>
              </div>

              {/* Trailing Chevron */}
              <div className="pl-2 pt-1 sm:pt-0 shrink-0">
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          );
        }))}
      </div>
    </div>
  );
};

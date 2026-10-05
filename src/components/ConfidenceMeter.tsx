import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  Radio, 
  HelpCircle, 
  ExternalLink,
  ChevronDown,
  Info,
  Sparkles
} from 'lucide-react';
import { Occurrence } from '../types';
import { 
  calculateConfidence, 
  getVerificationStatusConfig, 
  getConfidenceLevelConfig 
} from '../utils/confidenceUtils';

interface ConfidenceMeterProps {
  occurrence: Partial<Occurrence>;
  variant?: 'compact' | 'inline' | 'detailed';
  showSourceAndTime?: boolean;
  showReasonsPopover?: boolean;
  className?: string;
}

export const ConfidenceMeter: React.FC<ConfidenceMeterProps> = ({
  occurrence,
  variant = 'inline',
  showSourceAndTime = true,
  showReasonsPopover = false,
  className = '',
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const evaluation = calculateConfidence(occurrence);
  const statusConfig = getVerificationStatusConfig(evaluation.status);
  const levelConfig = getConfidenceLevelConfig(evaluation.level);

  // Status Icon
  const renderStatusIcon = (sizeClass = 'w-3.5 h-3.5') => {
    switch (evaluation.status) {
      case 'Confirmado':
        return <ShieldCheck className={`${sizeClass} text-emerald-400`} />;
      case 'Em verificação':
        return <Clock className={`${sizeClass} text-amber-400`} />;
      case 'Resolvido':
        return <CheckCircle2 className={`${sizeClass} text-slate-400`} />;
      case 'Reportado':
      default:
        return <Radio className={`${sizeClass} text-blue-400`} />;
    }
  };

  // Compact Variant (Best for mobile cards and dense list rows)
  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-[11px] ${className}`}>
        {/* Verification Status Pill */}
        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold border ${statusConfig.badgeBg} ${statusConfig.badgeText}`}
          title={statusConfig.description}
        >
          {renderStatusIcon('w-3 h-3')}
          <span>{statusConfig.label}</span>
        </div>

        {/* Confidence Percentage Pill */}
        <div 
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-semibold border ${levelConfig.pill}`}
          title={`Confiança ${levelConfig.label}: ${evaluation.score}%`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${levelConfig.dot}`} />
          <span>{evaluation.score}%</span>
        </div>

        {/* Source & Last Updated timestamp */}
        {showSourceAndTime && (
          <span className="text-[10px] text-slate-400 truncate max-w-[170px] sm:max-w-none">
            {evaluation.sourcesSummary} · {evaluation.lastUpdatedText}
          </span>
        )}
      </div>
    );
  }

  // Inline Variant (Standard for feed cards, tablet, and desktop lists)
  if (variant === 'inline') {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Badge + Score */}
          <div className="flex items-center gap-1.5">
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                evaluation.status === 'Confirmado'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : statusConfig.bg + ' ' + statusConfig.text + ' ' + statusConfig.border
              }`}
            >
              {renderStatusIcon('w-3.5 h-3.5')}
              <span>{statusConfig.label}</span>
              {evaluation.confirmations > 0 && evaluation.status === 'Confirmado' && (
                <span className="text-[10px] opacity-80">({evaluation.confirmations})</span>
              )}
            </div>

            {/* Confidence Level Badge */}
            <div
              className={`relative inline-flex items-center gap-1.5 px-2 py-0.5 sm:py-1 rounded-lg text-[11px] font-semibold border ${levelConfig.pill} cursor-pointer select-none`}
              onClick={() => setShowTooltip(!showTooltip)}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${levelConfig.dot}`} />
              <span className="font-bold">{evaluation.score}%</span>
              <span className="hidden xs:inline text-slate-400 font-normal">Confiança {levelConfig.label}</span>
              <HelpCircle className="w-3 h-3 text-slate-400 hover:text-white transition-colors" />

              {/* Popover explaining score */}
              {showTooltip && (
                <div className="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl text-left text-xs text-slate-200">
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800">
                    <span className="font-bold text-white flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      Nível de Confiança: {evaluation.score}%
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${levelConfig.bg} ${levelConfig.text}`}>
                      {levelConfig.label}
                    </span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300">
                    {evaluation.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-blue-400 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400">
                    Atualizado automaticamente com novos testemunhos e fontes oficiais.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Source and Update Time */}
          {showSourceAndTime && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="font-medium text-slate-300 truncate max-w-[140px] sm:max-w-xs" title={evaluation.sourcesSummary}>
                {evaluation.sourcesSummary}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 whitespace-nowrap">{evaluation.lastUpdatedText}</span>
            </div>
          )}
        </div>

        {/* Visual Mini Progress Bar */}
        <div className="w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full ${levelConfig.bar} transition-all duration-500 rounded-full`}
            style={{ width: `${evaluation.score}%` }}
          />
        </div>
      </div>
    );
  }

  // Detailed Variant (For single report detail page and modals)
  return (
    <div className={`p-4 sm:p-5 rounded-2xl bg-slate-900/90 border ${statusConfig.border} shadow-xl backdrop-blur-md space-y-4 ${className}`}>
      {/* Top Header: Big Status & Confidence Score */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
            {renderStatusIcon('w-6 h-6')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold text-white">
                Estado: {statusConfig.label}
              </span>
              {evaluation.status === 'Confirmado' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Verificado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {statusConfig.description}
            </p>
          </div>
        </div>

        {/* Confidence Gauge */}
        <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1 bg-slate-800/40 sm:bg-transparent p-2.5 sm:p-0 rounded-xl">
          <span className="text-xs text-slate-400">Nível de Confiança:</span>
          <div className="flex items-center gap-2">
            <span className={`text-xl sm:text-2xl font-black ${levelConfig.text}`}>
              {evaluation.score}%
            </span>
            <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${levelConfig.pill}`}>
              {levelConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Fiabilidade do alerta</span>
          <span>{evaluation.score}% de 100%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full ${levelConfig.bar} rounded-full transition-all duration-700`}
            style={{ width: `${evaluation.score}%` }}
          />
        </div>
      </div>

      {/* Provenance & Reasons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Source & Update details */}
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Fonte Principal & Hora
          </span>
          <div className="text-xs font-medium text-white flex items-center justify-between">
            <span className="truncate">{evaluation.sourcesSummary}</span>
            {occurrence.sourceUrl && (
              <a
                href={occurrence.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5 ml-1"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {evaluation.lastUpdatedText}
          </div>
        </div>

        {/* Validation Breakdown */}
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Critérios de Validação
          </span>
          <ul className="space-y-1 text-xs text-slate-300">
            {evaluation.reasons.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

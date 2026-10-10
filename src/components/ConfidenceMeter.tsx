import React from 'react';
import { 
  ShieldCheck, 
  Clock, 
  CheckCircle2, 
  Radio
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
  className = '',
}) => {
  const evaluation = calculateConfidence(occurrence);
  const statusConfig = getVerificationStatusConfig(evaluation.status);
  const levelConfig = getConfidenceLevelConfig(evaluation.level);

  const renderStatusIcon = () => {
    switch (evaluation.status) {
      case 'Confirmado':
        return <ShieldCheck className="w-3.5 h-3.5 stroke-[2] text-[#111111]" />;
      case 'Em verificação':
        return <Clock className="w-3.5 h-3.5 stroke-[2] text-[#6B6B6B]" />;
      case 'Resolvido':
        return <CheckCircle2 className="w-3.5 h-3.5 stroke-[2] text-[#6B6B6B]" />;
      case 'Reportado':
      default:
        return <Radio className="w-3.5 h-3.5 stroke-[2] text-[#111111]" />;
    }
  };

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 text-xs ${className}`}>
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] font-semibold text-[#111111]">
          {renderStatusIcon()}
          <span>{statusConfig.label}</span>
        </div>

        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] font-condensada font-bold tabular-nums text-[#111111]">
          <span>{evaluation.score}%</span>
        </div>

        {showSourceAndTime && (
          <span className="text-xs text-[#6B6B6B] truncate">
            {evaluation.sourcesSummary} · {evaluation.lastUpdatedText}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={`flex flex-col gap-1.5 ${className}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#F4F4F2] border border-[#E6E6E3] font-semibold text-[#111111]">
              {renderStatusIcon()}
              <span>{statusConfig.label}</span>
              {evaluation.confirmations > 0 && evaluation.status === 'Confirmado' && (
                <span className="font-condensada font-bold tabular-nums">({evaluation.confirmations})</span>
              )}
            </div>

            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-[6px] bg-[#F4F4F2] border border-[#E6E6E3] font-condensada font-bold tabular-nums text-[#111111]">
              <span>{evaluation.score}%</span>
            </div>
          </div>

          {showSourceAndTime && (
            <div className="text-xs text-[#6B6B6B]">
              <span>{evaluation.sourcesSummary} · {evaluation.lastUpdatedText}</span>
            </div>
          )}
        </div>

        <div className="w-full h-1 bg-[#F4F4F2] border border-[#E6E6E3] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#111111] rounded-full"
            style={{ width: `${evaluation.score}%` }}
          />
        </div>
      </div>
    );
  }

  // Detailed
  return (
    <div className={`p-4 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E6E6E3]">
        <div className="flex items-center gap-2">
          {renderStatusIcon()}
          <span className="text-sm font-bold text-[#111111]">
            {statusConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-[#6B6B6B]">Confiança:</span>
          <span className="font-condensada font-bold text-sm tabular-nums text-[#111111]">
            {evaluation.score}%
          </span>
        </div>
      </div>

      <div className="w-full h-1.5 bg-[#F4F4F2] border border-[#E6E6E3] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#111111] rounded-full"
          style={{ width: `${evaluation.score}%` }}
        />
      </div>

      <div className="text-xs text-[#6B6B6B] space-y-1">
        <div>Fonte: <strong className="text-[#111111]">{evaluation.sourcesSummary}</strong></div>
        <div>Atualizado: <strong className="text-[#111111]">{evaluation.lastUpdatedText}</strong></div>
      </div>
    </div>
  );
};

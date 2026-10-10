import React from 'react';
import { Star, Radio, MapPin } from 'lucide-react';
import { ApiLineItem } from '../services/transitApi';
import { LineChip } from './LineChip';
import { formatTransitName, sortDepartures, parseDepartureTime } from '../utils/transitFormatter';
import { t } from '../i18n';

interface LineCardProps {
  line: ApiLineItem;
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent, lineId: string) => void;
  compact?: boolean;
  showExactTimeAsBig?: boolean;
  /** Mostra o operador por baixo (distingue linhas com o mesmo nome, ex.: Linha Azul de Lisboa e do Porto) */
  mostrarOperador?: boolean;
}

export const LineCard: React.FC<LineCardProps> = ({
  line,
  onClick,
  isFavorite,
  onToggleFavorite,
  showExactTimeAsBig = false,
  mostrarOperador = false,
}) => {
  // Título e paragem da partida que aparece à direita (o destino e a paragem dessa partida,
  // não os da linha em geral — senão "Cordoaria" aparecia com a hora do outro sentido)
  const proxima = line.departures && line.departures.length > 0 ? sortDepartures(line.departures)[0] : undefined;
  const destinoProxima = proxima && proxima.state !== 'Sem dados' ? (proxima as any).destination : undefined;
  const rawDest = destinoProxima
    ? formatTransitName(destinoProxima)
    : line.destinations && line.destinations.length > 0
      ? line.destinations.map(d => formatTransitName(d)).join(' ⇄ ')
      : formatTransitName(line.name || 'Destino');
  const paragemProxima: string | undefined = (proxima as any)?.stop_name || line.nearest_stop?.name;

  return (
    <div
      onClick={onClick}
      className="p-3.5 bg-[#FFFFFF] hover:bg-[#F4F4F2] border-b border-[#E6E6E3] transition-colors cursor-pointer flex items-center justify-between gap-3 min-h-[44px]"
    >
      {/* Left: Line Chip + Details */}
      <div className="flex items-center gap-3 min-w-0">
        <LineChip number={line.code} color={line.color} />
        
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold text-[#111111] leading-tight truncate">
              {rawDest}
            </h3>
          </div>
          {(paragemProxima || (mostrarOperador && line.operator)) && (
            <div className="text-xs text-[#6B6B6B] truncate mt-0.5">
              {[mostrarOperador ? line.operator : '', paragemProxima ? formatTransitName(paragemProxima) : ''].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* Right: Next departure or favorite button */}
      <div className="flex items-center gap-3 shrink-0">
        {line.departures && line.departures.length > 0 && (() => {
          const sorted = sortDepartures(line.departures);
          const nextDep = sorted[0];
          const parsed = parseDepartureTime(nextDep);
          const bigDisplay = showExactTimeAsBig ? (parsed.exactTime || parsed.bigText) : parsed.bigText;

          return (
            <div className="flex flex-col items-end text-right">
              <div className="flex items-center gap-1">
                {parsed.isRealtime && (
                  <Radio 
                    className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                    style={{ color: parsed.textColor }} 
                  />
                )}
                <span 
                  className={`font-condensada text-xl font-bold tabular-nums leading-none ${showExactTimeAsBig ? 'text-[#111111]' : parsed.textColorClass}`}
                  style={{ color: showExactTimeAsBig ? '#111111' : parsed.textColor }}
                >
                  {bigDisplay}
                </span>
              </div>
              {!showExactTimeAsBig && parsed.subText && (
                <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                  {parsed.subText}
                </span>
              )}
            </div>
          );
        })()}

        <button
          onClick={(e) => onToggleFavorite(e, line.id)}
          className="p-2 text-[#6B6B6B] hover:text-[#111111] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          title={isFavorite ? t('Remover dos favoritos') : t('Guardar nos favoritos')}
          aria-label={isFavorite ? t('Remover dos favoritos') : t('Guardar nos favoritos')}
          aria-pressed={isFavorite}
        >
          <Star className={`w-4 h-4 stroke-[2] ${isFavorite ? 'fill-[#111111] text-[#111111]' : ''}`} />
        </button>
      </div>
    </div>
  );
};

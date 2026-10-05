import React from 'react';
import {
  Clock,
  MapPin,
  Star,
  ChevronRight,
  Bus,
  Train,
  Zap,
  Ship,
  Navigation,
} from 'lucide-react';
import { ApiLineItem } from '../services/transitApi';

interface LineCardProps {
  line: ApiLineItem;
  onClick: () => void;
  isFavorite: boolean;
  onToggleFavorite: (e: React.MouseEvent, lineId: string) => void;
  compact?: boolean;
}

export const LineCard: React.FC<LineCardProps> = ({
  line,
  onClick,
  isFavorite,
  onToggleFavorite,
  compact = false,
}) => {
  const getModeIcon = (mode: string) => {
    switch (mode) {
      case 'Metro':
        return <Zap className="w-4 h-4 text-emerald-400" />;
      case 'Comboio':
        return <Train className="w-4 h-4 text-teal-400" />;
      case 'Barco':
        return <Ship className="w-4 h-4 text-cyan-400" />;
      case 'Elétrico':
        return <Zap className="w-4 h-4 text-amber-400" />;
      default:
        return <Bus className="w-4 h-4 text-blue-400" />;
    }
  };

  const destinationText =
    line.destinations && line.destinations.length > 0
      ? line.destinations.join(' ⇄ ')
      : line.name || 'Destino';

  return (
    <div
      onClick={onClick}
      className="p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-blue-500/50 hover:bg-slate-900 transition-all shadow-md hover:shadow-xl cursor-pointer group flex flex-col justify-between gap-3"
    >
      {/* Top row: Line Badge, Operator, Destination, and Favorite Star */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {/* Badge */}
          <div
            className="px-3 py-1.5 rounded-xl font-black text-sm sm:text-base flex items-center gap-1.5 shadow-md shrink-0 transition-transform group-hover:scale-105"
            style={{
              backgroundColor: line.color || '#2563EB',
              color: '#ffffff',
            }}
          >
            {getModeIcon(line.mode)}
            <span>{line.code}</span>
          </div>

          {/* Details */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-300">
                {line.operator}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60">
                {line.mode}
              </span>
            </div>

            <h3 className="text-sm font-bold text-white tracking-tight mt-0.5 line-clamp-1 group-hover:text-blue-300 transition-colors">
              {destinationText}
            </h3>
          </div>
        </div>

        {/* Favorite Star */}
        <button
          onClick={(e) => onToggleFavorite(e, line.id)}
          className={`p-2 rounded-xl border transition-all cursor-pointer shrink-0 ${
            isFavorite
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:text-white hover:bg-slate-800'
          }`}
          title={isFavorite ? 'Remover dos favoritos' : 'Guardar nos favoritos'}
        >
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
        </button>
      </div>

      {/* Nearest stop row if available */}
      {line.nearest_stop && (
        <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
          <div className="flex items-center gap-1.5 text-slate-300 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate font-medium">
              Paragem: <strong>{line.nearest_stop.name}</strong>
            </span>
          </div>
          <span className="text-blue-400 font-bold shrink-0 ml-2">
            a {line.nearest_stop.distance_meters} m
          </span>
        </div>
      )}

      {/* Departures row: next 2 departures per direction */}
      {line.departures && line.departures.length > 0 ? (
        <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-400" />
              Próximas Partidas na Paragem
            </span>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 group-hover:text-blue-400 transition-colors">
              Ver percurso
              <ChevronRight className="w-3 h-3" />
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {line.departures.map((dep, dIdx) => (
              <div
                key={dIdx}
                className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
              >
                <div className="min-w-0 pr-1 flex-1">
                  <span className="text-slate-300 font-medium block text-[11px] leading-tight break-words">
                    {dep.destination}
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        dep.state === 'Tempo Real'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/40'
                          : dep.state === 'Suprimido'
                          ? 'bg-red-950 text-red-300 border-red-700/50'
                          : 'bg-slate-800 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {dep.state}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-white text-xs block">
                    {dep.time}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/30 inline-block mt-0.5">
                    {dep.displayText}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <span>Toque para ver itinerário e paragens</span>
          <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
        </div>
      )}
    </div>
  );
};

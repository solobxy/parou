import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  MapPin,
  Clock,
  Navigation,
  Bus,
  Train,
  Zap,
  Ship,
  Compass,
  Radio,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import {
  ApiLineDetail,
  ApiStopDeparture,
  fetchLineDetail,
  fetchStopDepartures,
} from '../services/transitApi';

interface LineDetailModalProps {
  lineId: string;
  onClose: () => void;
  userCoords?: { lat: number; lon: number } | null;
  isFavorite: boolean;
  onToggleFavorite: (lineId: string) => void;
}

export const LineDetailModal: React.FC<LineDetailModalProps> = ({
  lineId,
  onClose,
  userCoords,
  isFavorite,
  onToggleFavorite,
}) => {
  const [line, setLine] = useState<ApiLineDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDirectionIdx, setActiveDirectionIdx] = useState<number>(0);
  
  // Selected stop for 5 departures
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedStopDepartures, setSelectedStopDepartures] = useState<ApiStopDeparture[] | null>(null);
  const [isLoadingDepartures, setIsLoadingDepartures] = useState<boolean>(false);

  const nearestStopRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    fetchLineDetail(lineId)
      .then((data) => {
        if (!isMounted) return;
        setLine(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || 'Erro ao carregar detalhe da linha');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [lineId]);

  // Auto-scroll nearest stop into view once line and direction are loaded
  useEffect(() => {
    if (!isLoading && line && nearestStopRef.current) {
      setTimeout(() => {
        nearestStopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    }
  }, [isLoading, line, activeDirectionIdx]);

  // Load next 5 departures when tapping a stop
  const handleSelectStop = async (stopId: string) => {
    if (selectedStopId === stopId) {
      setSelectedStopId(null);
      setSelectedStopDepartures(null);
      return;
    }
    setSelectedStopId(stopId);
    setIsLoadingDepartures(true);
    try {
      const res = await fetchStopDepartures(stopId, 5);
      setSelectedStopDepartures(res.departures);
    } catch (err) {
      console.warn('Erro ao carregar partidas:', err);
      setSelectedStopDepartures([]);
    } finally {
      setIsLoadingDepartures(false);
    }
  };

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

  const activeDirection = line?.directions[activeDirectionIdx] || line?.directions[0];

  // Identify user's nearest stop in this direction if coords available
  let nearestStopId: string | null = null;
  if (userCoords && activeDirection?.stops && activeDirection.stops.length > 0) {
    let minDist = Infinity;
    activeDirection.stops.forEach((s) => {
      const d = Math.hypot(s.lat - userCoords.lat, s.lon - userCoords.lon);
      if (d < minDist) {
        minDist = d;
        nearestStopId = s.id;
      }
    });
  } else if (line?.nearest_stop?.id) {
    nearestStopId = line.nearest_stop.id;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            {line && (
              <div
                className="px-3 py-1.5 rounded-xl font-black text-sm flex items-center gap-1.5 shadow-md shrink-0"
                style={{
                  backgroundColor: line.color || '#2563EB',
                  color: '#ffffff',
                }}
              >
                {getModeIcon(line.mode)}
                <span>{line.code}</span>
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight truncate">
                {line?.name || line?.code || 'Detalhe da Linha'}
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {line?.operator} • {line?.mode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onToggleFavorite(lineId)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                isFavorite
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title={isFavorite ? 'Remover dos favoritos' : 'Guardar nos favoritos'}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
              <p className="text-xs font-semibold">A carregar paragens e horários reais da linha...</p>
            </div>
          ) : error || !line ? (
            <div className="p-6 rounded-2xl bg-red-950/40 border border-red-800 text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
              <p className="text-sm font-bold text-white">Não foi possível carregar o detalhe</p>
              <p className="text-xs text-slate-400">{error}</p>
            </div>
          ) : (
            <>
              {/* Direction Tabs */}
              {line.directions.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Sentido de Circulação
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {line.directions.map((dir, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveDirectionIdx(idx);
                          setSelectedStopId(null);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeDirectionIdx === idx
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                        }`}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>{dir.headsign || `Sentido ${idx + 1}`}</span>
                        <span className="text-[10px] opacity-75 font-normal">
                          ({dir.stops.length} paragens)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Live vehicles indicator if present */}
              {line.vehicles && line.vehicles.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="font-bold">
                      {line.vehicles.length} veículo(s) em circulação em tempo real (GTFS-RT)
                    </span>
                  </div>
                </div>
              )}

              {/* Stops list in direction order */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>Sequência de Paragens (toque para ver próximas 5 partidas)</span>
                  <span>Hora prevista</span>
                </div>

                <div className="relative pl-6 space-y-2.5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                  {activeDirection?.stops.map((stop, sIdx) => {
                    const isNearest = stop.id === nearestStopId;
                    const isSelected = stop.id === selectedStopId;

                    return (
                      <div
                        key={stop.id}
                        ref={isNearest ? nearestStopRef : undefined}
                        className={`relative rounded-xl transition-all cursor-pointer ${
                          isNearest
                            ? 'bg-blue-950/50 border-2 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                            : isSelected
                            ? 'bg-slate-800 border border-slate-700'
                            : 'bg-slate-950/60 border border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        {/* Connecting dot */}
                        <div
                          className={`absolute -left-6 top-3.5 w-2.5 h-2.5 rounded-full border-2 ${
                            isNearest
                              ? 'bg-blue-500 border-white ring-2 ring-blue-500/50'
                              : 'bg-slate-900 border-slate-600'
                          }`}
                        />

                        {/* Stop Row */}
                        <div
                          onClick={() => handleSelectStop(stop.id)}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {stop.name}
                              </span>
                              {isNearest && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-black text-[9px] uppercase tracking-wider shadow-xs">
                                  A sua paragem mais próxima
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              Paragem #{stop.sequence}
                            </span>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-2">
                            {stop.next_arrival && stop.next_arrival !== 'sem horário' ? (
                              <span className="font-mono text-xs font-bold text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                                {stop.next_arrival}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-mono">sem horário</span>
                            )}
                            <ChevronRight
                              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                isSelected ? 'rotate-90 text-blue-400' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {/* Accordion: 5 Next Departures at this Stop */}
                        {isSelected && (
                          <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-blue-400" />
                                Próximas 5 partidas em {stop.name}
                              </span>
                              {isLoadingDepartures && (
                                <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                              )}
                            </div>

                            {isLoadingDepartures ? (
                              <p className="text-xs text-slate-400 italic">A calcular partidas...</p>
                            ) : !selectedStopDepartures || selectedStopDepartures.length === 0 ? (
                              <p className="text-xs text-slate-500">Sem partidas programadas para hoje.</p>
                            ) : (
                              <div className="grid grid-cols-1 gap-1.5">
                                {selectedStopDepartures.map((dep, dIdx) => (
                                  <div
                                    key={dIdx}
                                    className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 flex items-center justify-between text-xs"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span
                                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                                        style={{ backgroundColor: dep.color || '#2563EB' }}
                                      >
                                        {dep.line_code}
                                      </span>
                                      <span className="text-slate-300 truncate font-medium">
                                        {dep.destination}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="font-mono font-bold text-white">
                                        {dep.scheduled_time}
                                      </span>
                                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40">
                                        {dep.displayText}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

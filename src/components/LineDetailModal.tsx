import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Star,
  Clock,
  Radio,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  ApiLineDetail,
  ApiStopDeparture,
  fetchLineDetail,
  fetchStopDepartures,
} from '../services/transitApi';
import { LineChip } from './LineChip';
import { formatTransitName, sortDepartures, parseDepartureTime } from '../utils/transitFormatter';

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
  
  // Selected stop for departures
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

  useEffect(() => {
    if (!isLoading && line && nearestStopRef.current) {
      setTimeout(() => {
        nearestStopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    }
  }, [isLoading, line, activeDirectionIdx]);

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

  const activeDirection = line?.directions[activeDirectionIdx] || line?.directions[0];

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between gap-3 bg-[#FFFFFF]">
          <div className="flex items-center gap-3 min-w-0">
            {line && (
              <LineChip number={line.code} color={line.color} />
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#111111] truncate">
                {formatTransitName(line?.name || line?.code || 'Detalhe da linha')}
              </h2>
              <p className="text-xs text-[#6B6B6B] truncate">
                {line?.operator} · {line?.mode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onToggleFavorite(lineId)}
              className="p-2 text-[#6B6B6B] hover:text-[#111111] rounded-[8px] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              title={isFavorite ? 'Remover dos favoritos' : 'Guardar nos favoritos'}
            >
              <Star className={`w-5 h-5 stroke-[2] ${isFavorite ? 'fill-[#111111] text-[#111111]' : ''}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-[#6B6B6B] hover:text-[#111111] rounded-[8px] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-[#6B6B6B] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#111111]" />
              <p className="text-xs">A carregar paragens...</p>
            </div>
          ) : error || !line ? (
            <div className="p-6 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-[#D92D20] mx-auto stroke-[2]" />
              <p className="text-sm font-semibold text-[#111111]">Erro ao carregar linha.</p>
            </div>
          ) : (
            <>
              {/* Direction Tabs */}
              {line.directions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {line.directions.map((dir, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveDirectionIdx(idx);
                          setSelectedStopId(null);
                        }}
                        className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] cursor-pointer transition-colors ${
                          activeDirectionIdx === idx
                            ? 'bg-[#111111] text-[#FFFFFF]'
                            : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                        }`}
                      >
                        {dir.headsign ? `Destino: ${dir.headsign}` : `Sentido ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stops Timeline */}
              <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3]">
                {activeDirection?.stops && activeDirection.stops.length > 0 ? (
                  activeDirection.stops.map((stop, sIdx) => {
                    const isNearest = stop.id === nearestStopId;
                    const isSelected = stop.id === selectedStopId;

                    return (
                      <div
                        key={stop.id}
                        ref={isNearest ? nearestStopRef : undefined}
                        onClick={() => handleSelectStop(stop.id)}
                        className={`p-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#F4F4F2]' : 'hover:bg-[#F4F4F2]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] w-5 text-right tabular-nums">
                              {sIdx + 1}
                            </span>
                            <span className={`text-sm truncate ${isNearest ? 'font-bold text-[#111111]' : 'text-[#111111]'}`}>
                              {formatTransitName(stop.name)}
                            </span>
                            {isNearest && (
                              <span className="text-[10px] font-bold text-[#C2410C]">
                                Perto de ti
                              </span>
                            )}
                          </div>

                          <span className="text-xs text-[#6B6B6B]">
                            {isSelected ? 'Fechar' : 'Partidas'}
                          </span>
                        </div>

                        {/* Dropdown next departures */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-[#E6E6E3] pl-7">
                            {isLoadingDepartures ? (
                              <div className="py-2 text-xs text-[#6B6B6B] flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-[#111111]" />
                                <span>A carregar partidas...</span>
                              </div>
                            ) : selectedStopDepartures && selectedStopDepartures.length > 0 ? (
                              <div className="space-y-2">
                                {(() => {
                                  const deps = sortDepartures(selectedStopDepartures).slice(0, 6);
                                  const outdatedDeps = deps.filter((d: any) => parseDepartureTime(d).isOutdated);
                                  const opName = line?.operator || (line as any)?.operator_name || 'deste operador';
                                  return (
                                    <>
                                      {outdatedDeps.length > 0 && (
                                        <div className="py-1 px-1.5 bg-[#F4F4F2] text-[11px] text-[#6B6B6B] flex items-center gap-1.5 rounded-[4px] mb-1">
                                          <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                                          <span>Horários {opName} podem estar desatualizados</span>
                                        </div>
                                      )}
                                      {deps.map((dep, dIdx) => {
                                        const parsed = parseDepartureTime(dep);
                                        return (
                                          <div
                                            key={dIdx}
                                            className="flex items-center justify-between text-xs py-1 gap-2"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <LineChip number={dep.line_code} color={dep.color} />
                                              <div className="min-w-0">
                                                <div className="text-[#111111] font-medium truncate">
                                                  {formatTransitName(dep.destination || 'Destino')}
                                                </div>
                                                <div className="text-[11px] text-[#6B6B6B] truncate">
                                                  {formatTransitName(stop.name)}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex flex-col items-end text-right shrink-0">
                                              <div className="flex items-center gap-1">
                                                {parsed.isRealtime && (
                                                  <Radio 
                                                    className={`w-3 h-3 stroke-[2] ${parsed.textColorClass}`} 
                                                    style={{ color: parsed.textColor }} 
                                                  />
                                                )}
                                                <span 
                                                  className={`font-['Barlow_Condensed'] text-base font-bold tabular-nums leading-none ${parsed.textColorClass}`}
                                                  style={{ color: parsed.textColor }}
                                                >
                                                  {parsed.bigText}
                                                </span>
                                              </div>
                                              {parsed.subText && (
                                                <span className="font-['Barlow_Condensed'] text-[11px] text-[#6B6B6B] tabular-nums mt-0.5">
                                                  {parsed.subText}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </>
                                  );
                                })()}
                              </div>
                            ) : (
                              <div className="text-xs text-[#6B6B6B] py-1">
                                Sem partidas previstas.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-[#6B6B6B]">
                    Sem paragens nesta direção.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

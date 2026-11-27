import React, { useState, useEffect, useRef, useMemo } from 'react';
import FonteOperador from './FonteOperador';
import { useVoltarFecha } from '../utils/janelas';
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
  ApiLineItem,
  ApiStopDeparture,
  fetchLineDetail,
  fetchStopDepartures,
} from '../services/transitApi';
import { LineChip } from './LineChip';
import { HorarioDoDiaPainel, SeletorDias, proximosDias } from './HorarioDoDia';
import { textoGreveDaPartida } from './GreveNoHorario';
import { formatTransitName, sortDepartures, parseDepartureTime, destinoLegivel } from '../utils/transitFormatter';
import { t } from '../i18n';
import { registarProcura } from '../services/procuras';
import { momentoDeValor } from '../services/momentoDeValor';

interface LineDetailModalProps {
  lineId: string;
  onClose: () => void;
  userCoords?: { lat: number; lon: number } | null;
  /** Linha inteira (só quando a linha não tem sentidos conhecidos) */
  isFavorite: boolean;
  onToggleFavorite: (lineId: string) => void;
  /** Sentidos guardados desta linha: 'toda' ou os direction_id guardados */
  sentidosGuardados?: 'toda' | Set<number>;
  /** Sentido a mostrar primeiro (direction_id), ex.: ao abrir o favorito «→ Cordoaria» */
  sentidoInicial?: number;
  onToggleSentido?: (
    sentido: number,
    todos: Array<{ direction_id: number; headsign?: string }>,
    meta: Partial<ApiLineItem>,
  ) => void;
}

export const LineDetailModal: React.FC<LineDetailModalProps> = ({
  lineId,
  onClose,
  userCoords,
  isFavorite,
  onToggleFavorite,
  sentidosGuardados,
  sentidoInicial,
  onToggleSentido,
}) => {
  useVoltarFecha(true, onClose);
  const [line, setLine] = useState<ApiLineDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDirectionIdx, setActiveDirectionIdx] = useState<number>(0);
  
  // Selected stop for departures
  // Pela posição na lista: nas linhas circulares a mesma paragem aparece duas vezes
  const [selectedStopIdx, setSelectedStopIdx] = useState<number | null>(null);
  const pedidoPartidas = useRef(0);
  const [selectedStopDepartures, setSelectedStopDepartures] = useState<ApiStopDeparture[] | null>(null);
  const [isLoadingDepartures, setIsLoadingDepartures] = useState<boolean>(false);

  const nearestStopRef = useRef<HTMLDivElement | null>(null);
  // Dia escolhido nas partidas de uma paragem: 0 = hoje (próximas partidas, com tempo real), 1 = amanhã, …
  const dias = useMemo(() => proximosDias(7), []);
  const [diaIdx, setDiaIdx] = useState(0);
  // A UNIR não tem viagens na base (o horário vem da paragem): só há o dia de hoje
  const temOutrosDias = !lineId.startsWith('unir:');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    fetchLineDetail(lineId)
      .then((data) => {
        if (!isMounted) return;
        setLine(data);
        if (sentidoInicial != null) {
          const idx = (data?.directions || []).findIndex((d) => d.direction_id === sentidoInicial);
          if (idx >= 0) setActiveDirectionIdx(idx);
        }
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

  // Linhas mais procuradas: conta a abertura (anónima) quando a linha carregou
  useEffect(() => {
    if (line && line.id === lineId) { registarProcura('linha', lineId, [line.code, line.name].filter(Boolean).join(' ')); momentoDeValor('linha'); }
  }, [line, lineId]);

  useEffect(() => {
    if (!isLoading && line && nearestStopRef.current) {
      setTimeout(() => {
        nearestStopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    }
  }, [isLoading, line, activeDirectionIdx]);

  const handleSelectStop = async (stopId: string, idx: number) => {
    const pedido = ++pedidoPartidas.current;
    if (selectedStopIdx === idx) {
      setSelectedStopIdx(null);
      setSelectedStopDepartures(null);
      return;
    }
    setSelectedStopIdx(idx);
    setSelectedStopDepartures(null);
    setIsLoadingDepartures(true);
    try {
      const res = await fetchStopDepartures(stopId, 5);
      if (pedido === pedidoPartidas.current) setSelectedStopDepartures(res.departures);
    } catch (err) {
      console.warn('Erro ao carregar partidas:', err);
      if (pedido === pedidoPartidas.current) setSelectedStopDepartures([]);
    } finally {
      if (pedido === pedidoPartidas.current) setIsLoadingDepartures(false);
    }
  };

  const activeDirection = line?.directions[activeDirectionIdx] || line?.directions[0];

  // A estrela guarda o sentido que está à vista (cada sentido é um favorito à parte)
  const porSentido = !!(onToggleSentido && sentidosGuardados && line && line.directions.length > 0 && activeDirection);
  const sentidoGuardado = (dirId: number) =>
    sentidosGuardados === 'toda' || (sentidosGuardados instanceof Set && sentidosGuardados.has(dirId));
  const estrelaAcesa = porSentido ? sentidoGuardado(activeDirection!.direction_id) : isFavorite;
  const destinoAtivo = activeDirection?.headsign ? formatTransitName(activeDirection.headsign) : '';
  const rotuloEstrela = porSentido && destinoAtivo
    ? (estrelaAcesa ? t('Tirar «{d}» dos favoritos', { d: destinoAtivo }) : t('Guardar «{d}» nos favoritos', { d: destinoAtivo }))
    : (estrelaAcesa ? t('Remover dos favoritos') : t('Guardar nos favoritos'));
  const tocarEstrela = () => {
    if (porSentido && line && activeDirection) {
      onToggleSentido!(
        activeDirection.direction_id,
        line.directions.map((d) => ({ direction_id: d.direction_id, headsign: d.headsign })),
        { code: line.code, name: line.name, color: line.color, operator: line.operator, operator_id: line.operator_id },
      );
    } else {
      onToggleFavorite(lineId);
    }
  };

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
                {formatTransitName(line?.name || line?.code || t('Detalhe da linha'))}
              </h2>
              <p className="text-xs text-[#6B6B6B] truncate">
                {line?.operator} · {line?.mode ? t(line.mode) : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={tocarEstrela}
              data-teste="estrela-linha"
              className="p-2 text-[#6B6B6B] hover:text-[#111111] rounded-[8px] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              title={rotuloEstrela}
              aria-label={rotuloEstrela}
              aria-pressed={estrelaAcesa}
            >
              <Star className={`w-5 h-5 stroke-[2] ${estrelaAcesa ? 'fill-[#111111] text-[#111111]' : ''}`} />
            </button>

            <button
              onClick={onClose}
              aria-label={t('Fechar')}
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
              <p className="text-xs">{t('A carregar paragens…')}</p>
            </div>
          ) : error || !line ? (
            <div className="p-6 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-center space-y-2">
              <AlertTriangle className="w-6 h-6 text-[#D92D20] mx-auto stroke-[2]" />
              <p className="text-sm font-semibold text-[#111111]">{t('Erro ao carregar linha.')}</p>
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
                        data-sentido={dir.direction_id}
                        aria-pressed={activeDirectionIdx === idx}
                        onClick={() => {
                          setActiveDirectionIdx(idx);
                          setSelectedStopIdx(null);
                        }}
                        className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] cursor-pointer transition-colors ${
                          activeDirectionIdx === idx
                            ? 'bg-[#111111] text-[#FFFFFF]'
                            : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {porSentido && sentidoGuardado(dir.direction_id) && (
                            <Star className={`w-3 h-3 stroke-[2] ${activeDirectionIdx === idx ? 'fill-[#FFFFFF] text-[#FFFFFF]' : 'fill-[#111111] text-[#111111]'}`} aria-label={t('Nos favoritos')} />
                          )}
                          {dir.headsign ? t('Destino: {d}', { d: dir.headsign }) : t('Sentido {n}', { n: idx + 1 })}
                        </span>
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
                    const isSelected = sIdx === selectedStopIdx;

                    return (
                      <div
                        key={`${stop.id}-${sIdx}`}
                        ref={isNearest ? nearestStopRef : undefined}
                        onClick={() => handleSelectStop(stop.id, sIdx)}
                        data-teste="paragem-da-linha"
                        className={`p-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#F4F4F2]' : 'hover:bg-[#F4F4F2]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-condensada text-xs text-[#6B6B6B] w-5 text-right tabular-nums">
                              {sIdx + 1}
                            </span>
                            <span className={`text-sm truncate ${isNearest ? 'font-bold text-[#111111]' : 'text-[#111111]'}`}>
                              {formatTransitName(stop.name)}
                            </span>
                            {isNearest && (
                              <span className="text-[10px] font-bold text-[#C2410C]">
                                {t('Perto de ti')}
                              </span>
                            )}
                          </div>

                          <span className="text-xs text-[#6B6B6B]">
                            {isSelected ? t('Fechar') : t('Partidas')}
                          </span>
                        </div>

                        {/* Partidas da paragem: hoje (próximas) ou o horário de outro dia */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-[#E6E6E3] pl-7 space-y-3 cursor-default" onClick={(e) => e.stopPropagation()}>
                            {temOutrosDias && <SeletorDias dias={dias} escolhido={diaIdx} onEscolher={setDiaIdx} />}
                            {diaIdx > 0 && temOutrosDias ? (
                              <HorarioDoDiaPainel
                                lineId={lineId}
                                stopId={stop.id}
                                sentido={activeDirection?.direction_id ?? 0}
                                data={dias[diaIdx].data}
                                nomeLinha={line?.name}
                              />
                            ) : isLoadingDepartures ? (
                              <div className="py-2 text-xs text-[#6B6B6B] flex items-center gap-2">
                                <RefreshCw className="w-4 h-4 animate-spin text-[#111111]" />
                                <span>{t('A carregar partidas…')}</span>
                              </div>
                            ) : selectedStopDepartures && selectedStopDepartures.length > 0 ? (
                              <div className="space-y-2">
                                {(() => {
                                  const deps = sortDepartures(selectedStopDepartures).slice(0, 6);
                                  const outdatedDeps = deps.filter((d: any) => parseDepartureTime(d).isOutdated);
                                  const opName = line?.operator || (line as any)?.operator_name || t('deste operador');
                                  return (
                                    <>
                                      {outdatedDeps.length > 0 && (
                                        <div className="py-1 px-1.5 bg-[#F4F4F2] text-[11px] text-[#6B6B6B] flex items-center gap-1.5 rounded-[4px] mb-1">
                                          <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                                          <span>{t('Horários {op} podem estar desatualizados', { op: opName })}</span>
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
                                                  {destinoLegivel(dep.destination, line?.name) || t('Destino')}
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
                                                  />
                                                )}
                                                <span 
                                                  className={`font-condensada text-base font-bold tabular-nums leading-none ${dep.greve?.estado === 'sem-servico' ? 'text-[#6B6B6B] line-through decoration-2' : parsed.textColorClass}`}
                                                >
                                                  {parsed.bigText}
                                                </span>
                                              </div>
                                              {dep.greve ? (
                                                <span className={`text-[11px] mt-0.5 ${dep.greve.estado === 'reduzido' || dep.greve.estado === 'garantido' ? 'text-[#6B6B6B]' : 'text-[#111111] font-semibold'}`} data-teste="greve-partida">{textoGreveDaPartida(dep.greve.estado, dep.greve.ate)}</span>
                                              ) : parsed.subText && (
                                                <span className="font-condensada text-[11px] text-[#6B6B6B] tabular-nums mt-0.5">
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
                                {t('Sem partidas previstas.')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-[#6B6B6B]">
                    {t('Sem paragens nesta direção.')}
                  </div>
                )}
              </div>
              <FonteOperador ids={[line?.feed_id, line?.operator_id]} className="mt-3" />
              {/* Página pública da linha: horário completo de dias úteis, sábados e domingos */}
              <a
                href={`/linha/${encodeURIComponent(lineId)}`}
                className="mt-3 flex items-center justify-center h-11 rounded-[10px] bg-[#F4F4F2] text-[13px] font-semibold text-[#111111]"
              >
                {t('Horário completo (dias úteis, sábados e domingos)')}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

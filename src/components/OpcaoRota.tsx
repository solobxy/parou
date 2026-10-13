import React from 'react';
import { Footprints } from 'lucide-react';
import { textoMetros } from '../utils/distancia';
import { LineChip } from './LineChip';
import { AvisoPartida } from './AvisoPartida';
import { formatTransitName } from '../utils/transitFormatter';
import { t, tn, LOCALE } from '../i18n';
import { formatarDuracao } from '../services/rotaVarios';
import type { TransitRouteOption } from '../types/perto';

/** Etiquetas dos percursos que vêm do servidor ("Direto", "2 transbordos", "A pé") */
function traduzirBadge(label: string): string {
  const m = /^(\d+) transbordos?$/.exec(label);
  return m ? tn(+m[1], '{n} transbordo', '{n} transbordos') : t(label);
}

/** "450 metros", "1,3 km" */
function textoDistancia(metros: number): string {
  if (metros < 950) return textoMetros(Math.max(10, Math.round(metros / 10) * 10));
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(metros / 1000)} km`;
}

interface Props {
  route: TransitRouteOption;
  selecionada: boolean;
  /** Nome do sítio onde esta opção acaba (o último troço a pé vai até lá) */
  destinoNome: string;
  /** Mostra o passo a passo por baixo (por omissão, quando está selecionada) */
  detalhes?: boolean;
  /** Mostra o "Avisar-me" para sair a horas (só faz sentido na viagem que começa agora) */
  avisar?: boolean;
  onSelecionar: () => void;
}

/** Uma opção de viagem: duração, horas, linhas e (se escolhida) o passo a passo */
export function OpcaoRota({ route, selecionada, destinoNome, detalhes, avisar = true, onSelecionar }: Props) {
  const mostrarDetalhes = (detalhes ?? selecionada) && route.id !== 'a-pe';
  return (
    <div
      className={`rounded-[12px] border bg-[#FFFFFF] transition-all ${
        selecionada ? 'border-[#111111] shadow-xs' : 'border-[#E6E6E3] hover:border-[#6B6B6B]'
      }`}
    >
      <button
        type="button"
        onClick={onSelecionar}
        aria-pressed={selecionada}
        className={`block w-full text-left p-3 cursor-pointer rounded-[12px] ${mostrarDetalhes ? 'pb-1.5' : ''}`}
      >
        <div className="flex items-center justify-between mb-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-condensada text-xl font-bold text-[#111111] tabular-nums shrink-0">
              {route.totalDurationMinutes >= 120 ? formatarDuracao(route.totalDurationMinutes) : `${route.totalDurationMinutes} min`}
            </span>
            <span className="text-xs text-[#6B6B6B] truncate">· {route.arrivalDayOffset ? t('Chegada amanhã ~{h}', { h: route.arrivalTime }) : `${t('Chegada')} ~${route.arrivalTime}`}</span>
          </div>
          <span className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wide text-right shrink-0">
            {traduzirBadge(route.badgeLabel)}
          </span>
        </div>
        <div className="text-xs text-[#6B6B6B] mb-1.5">
          {route.id === 'a-pe'
            ? t('{m} m a pé', { m: route.walkingDistanceMeters })
            : `${route.departureDayOffset ? t('Sair amanhã às {h}', { h: route.departureTime }) : t('Sair às {h}', { h: route.departureTime })} · ${t('{n} min a pé', { n: route.walkingMinutes })}${route.transfersCount ? ` · ${tn(route.transfersCount, '{n} transbordo', '{n} transbordos')}` : ''}`}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {route.legs.map((leg, lIdx) => (
            <React.Fragment key={lIdx}>
              {lIdx > 0 && <span className="text-[#6B6B6B] text-xs">→</span>}
              {leg.mode === 'WALK' ? (
                <div className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                  <Footprints className="w-3.5 h-3.5 stroke-[2]" />
                  <span className="tabular-nums">
                    {lIdx === route.legs.length - 1 && route.legs.length > 1 && leg.durationMinutes >= 1
                      ? t('{n} min até ao destino', { n: leg.durationMinutes })
                      : t('{n} min', { n: leg.durationMinutes })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <LineChip number={leg.lineCode || '—'} color={leg.lineColor} />
                  <span className="text-xs text-[#111111] font-medium truncate max-w-[120px]">
                    {formatTransitName(leg.toStopName || leg.instruction || '')}
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </button>

      {mostrarDetalhes && (
        <div className="px-3 pb-3">
          {avisar && <AvisoPartida route={route} />}
          <ol className="mt-2.5 pt-2.5 border-t border-[#E6E6E3] space-y-1.5">
            {route.legs.map((leg, i) => {
              if (leg.mode === 'WALK' && leg.durationMinutes <= 0) return null;
              const seguinte = route.legs.slice(i + 1).find((l) => l.mode === 'TRANSIT');
              const paraOnde = seguinte ? formatTransitName(seguinte.fromStopName || '') : destinoNome;
              return (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-[#111111]">
                  {leg.mode === 'WALK'
                    ? <Footprints className="w-3.5 h-3.5 mt-0.5 stroke-[2] text-[#6B6B6B] shrink-0" />
                    : <span className="shrink-0 mt-px"><LineChip number={leg.lineCode || '—'} color={leg.lineColor} /></span>}
                  <span className={leg.mode === 'WALK' ? 'text-[#6B6B6B]' : ''}>
                    {leg.mode === 'WALK'
                      ? `${t('A pé até {p}', { p: paraOnde })} · ${leg.durationMinutes} min${(leg.distanceMeters ?? 0) >= 50 ? ` (${textoDistancia(leg.distanceMeters as number)})` : ''}`
                      : `${leg.departureTime} ${formatTransitName(leg.fromStopName || '')} → ${leg.arrivalTime} ${formatTransitName(leg.toStopName || '')} · ${leg.stopsCount ?? ''} ${leg.stopsCount === 1 ? t('paragem') : t('paragens')}${leg.operatorName ? ` · ${leg.operatorName}` : ''}`}
                  </span>
                </li>
              );
            })}
            <li className="text-[11px] text-[#6B6B6B]">{route.realtimeLabel === 'Horário da AMP' ? t('Horários programados da AMP; podem mudar com o trânsito.') : t('Horários programados; podem mudar com o trânsito.')}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

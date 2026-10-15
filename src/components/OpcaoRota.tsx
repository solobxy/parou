import React from 'react';
import { Footprints, ChevronDown, ChevronRight } from 'lucide-react';
import { textoMetros } from '../utils/distancia';
import { LineChip } from './LineChip';
import { AvisoPartida } from './AvisoPartida';
import { formatTransitName } from '../utils/transitFormatter';
import { t, tn, LOCALE } from '../i18n';
import type { TransitRouteOption } from '../types/perto';

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
  /** Mostra o passo a passo por baixo (por omissão, só se estiver selecionada e aberta por quem a usa) */
  detalhes?: boolean;
  /** Mostra o "Avisar-me" para sair a horas (só faz sentido na viagem que começa agora) */
  avisar?: boolean;
  onSelecionar: () => void;
}

/** Duração em duas partes, como no Google Maps: "1 h" grande e "5 min" por baixo; "27" grande e "min" por baixo */
function partesDuracao(minutos: number): { grande: string; pequena: string } {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return { grande: String(m), pequena: 'min' };
  const h = Math.floor(m / 60);
  const r = m % 60;
  return { grande: `${h} h`, pequena: r ? `${r} min` : '' };
}

/**
 * Uma opção de viagem, no modo calmo: duração, horas de saída e chegada, a cadeia de linhas e uma única linha de apoio.
 * O passo a passo e o "Avisar-me" só aparecem quando se toca na opção (detalhes).
 */
export function OpcaoRota({ route, selecionada, destinoNome, detalhes = false, avisar = true, onSelecionar }: Props) {
  const aPe = route.id === 'a-pe';
  const podeAbrir = !aPe;
  const mostrarDetalhes = detalhes && podeAbrir;
  const { grande, pequena } = partesDuracao(route.totalDurationMinutes);

  // Cadeia: a pé > linha > linha > a pé. Os troços a pé de 1-2 min entre duas linhas ficam só nos detalhes (ruído)
  const cadeia = route.legs.filter((leg, i, todas) => {
    if (leg.mode !== 'WALK') return true;
    if (leg.durationMinutes <= 0) return false;
    return i === 0 || i === todas.length - 1 || leg.durationMinutes >= 3;
  });

  const primeira = route.legs.find((l) => l.mode === 'TRANSIT');
  const apoio = aPe
    ? t('{m} m a pé', { m: route.walkingDistanceMeters })
    : primeira
      ? t('Apanha {l} às {h} em {p}', {
          l: `${t('linha')} ${primeira.lineCode || ''}`.trim(),
          h: primeira.departureTime || route.departureTime,
          p: formatTransitName(primeira.fromStopName || ''),
        })
      : '';

  const salto = (route.arrivalDayOffset || 0) - (route.departureDayOffset || 0);
  const maisRapida = /^Mais rápido/.test(route.badgeLabel || '');

  return (
    <div
      className={`rounded-[12px] border bg-[#FFFFFF] transition-colors ${
        selecionada ? 'border-[#111111]' : 'border-[#E6E6E3] hover:border-[#6B6B6B]'
      }`}
    >
      <button
        type="button"
        onClick={onSelecionar}
        aria-expanded={podeAbrir ? mostrarDetalhes : undefined}
        aria-pressed={podeAbrir ? undefined : selecionada}
        className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 text-left p-3 cursor-pointer rounded-[12px]"
        data-teste="opcao-rota"
      >
        <div className="font-condensada text-[#111111] leading-none tabular-nums pt-0.5">
          <div className="text-[30px] font-bold">{grande}</div>
          {pequena && <div className="mt-1 text-[14px] font-semibold text-[#6B6B6B]">{pequena}</div>}
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[15px] font-semibold text-[#111111] tabular-nums leading-snug">
              {route.departureDayOffset ? `${t('amanhã')} ` : ''}{route.departureTime} – {route.arrivalTime}{salto > 0 ? ` +${salto}` : ''}
            </span>
            <span className="shrink-0 flex items-center gap-1.5 h-[22px]">
              {maisRapida && (
                <span className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wide">{t('Mais rápido')}</span>
              )}
              {podeAbrir && (
                <ChevronDown className={`w-4 h-4 text-[#6B6B6B] stroke-[2.25] transition-transform ${mostrarDetalhes ? 'rotate-180' : ''}`} aria-hidden="true" />
              )}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
            {cadeia.map((leg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#6B6B6B] stroke-[2]" aria-hidden="true" />}
                {leg.mode === 'WALK' ? (
                  <span className="inline-flex items-center gap-0.5 text-[13px] text-[#6B6B6B] tabular-nums">
                    <Footprints className="w-4 h-4 stroke-[2]" aria-hidden="true" />
                    {leg.durationMinutes}
                    <span className="sr-only"> min</span>
                  </span>
                ) : (
                  <LineChip number={leg.lineCode || '—'} color={leg.lineColor} />
                )}
              </React.Fragment>
            ))}
          </div>

          {apoio && <p className="mt-1.5 text-[12.5px] text-[#6B6B6B] leading-snug">{apoio}</p>}
        </div>
      </button>

      {mostrarDetalhes && (
        <div className="px-3 pb-3">
          <p className="text-[12.5px] text-[#6B6B6B] leading-snug">
            {`${route.departureDayOffset ? t('Sair amanhã às {h}', { h: route.departureTime }) : t('Sair às {h}', { h: route.departureTime })} · ${t('{n} min a pé', { n: route.walkingMinutes })}${route.transfersCount ? ` · ${tn(route.transfersCount, '{n} transbordo', '{n} transbordos')}` : ''}`}
          </p>
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

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

/** Cor da barra de uma linha na linha do tempo: a cor oficial, ou preto quando a linha não tem cor (ou é branca) */
function corDaLinha(cor?: string): string {
  if (!cor) return '#111111';
  const c = cor.startsWith('#') ? cor : `#${cor}`;
  return /^#f{3}(f{3})?$/i.test(c) ? '#111111' : c;
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
  // A que chega primeiro e a que se recomenda (tempo e esforço); "Mais rápido" vinha só pelo texto, que muda com a língua
  const destaque = route.highlight || (/^Mais rápido/.test(route.badgeLabel || '') ? 'mais_rapido' : undefined);

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
              {destaque && (
                <span className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wide" data-teste="destaque-rota">
                  {destaque === 'melhor' ? t('Melhor opção') : t('Mais rápido')}
                </span>
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
          {/* Linha do tempo (como no Google Maps e no Citymapper): horas à esquerda, a cor da linha ao meio, as paragens à
              direita; os troços a pé a tracejado. O que importa (onde entrar, onde sair, a que horas) lê-se de relance. */}
          <ol className="mt-3 pt-3 border-t border-[#E6E6E3]" data-teste="passo-a-passo">
            {route.legs.map((leg, i) => {
              if (leg.mode === 'WALK' && leg.durationMinutes <= 0) return null;
              const seguinte = route.legs.slice(i + 1).find((l) => l.mode === 'TRANSIT');
              const paraOnde = seguinte ? formatTransitName(seguinte.fromStopName || '') : destinoNome;
              if (leg.mode === 'WALK') {
                return (
                  <li key={i} className="grid grid-cols-[44px_20px_1fr] gap-x-2">
                    <span />
                    <span className="flex justify-center" aria-hidden="true"><span className="w-0 border-l-[3px] border-dotted border-[#B5B5B0] h-full min-h-[34px]" /></span>
                    <span className="py-2 flex items-center gap-1.5 text-[13px] text-[#6B6B6B] leading-snug">
                      <Footprints className="w-4 h-4 shrink-0 stroke-[2]" aria-hidden="true" />
                      <span>{`${t('A pé até {p}', { p: paraOnde })} · ${leg.durationMinutes} min${(leg.distanceMeters ?? 0) >= 50 ? ` (${textoDistancia(leg.distanceMeters as number)})` : ''}`}</span>
                    </span>
                  </li>
                );
              }
              const cor = corDaLinha(leg.lineColor);
              return (
                <React.Fragment key={i}>
                  <li className="grid grid-cols-[44px_20px_1fr] gap-x-2 items-center">
                    <span className="font-condensada text-[16px] font-bold text-[#111111] tabular-nums text-right">{leg.departureTime}</span>
                    <span className="flex justify-center" aria-hidden="true"><span className="w-3.5 h-3.5 rounded-full border-[3px] bg-[#FFFFFF]" style={{ borderColor: cor }} /></span>
                    <span className="text-[15px] font-semibold text-[#111111] leading-tight">{formatTransitName(leg.fromStopName || '')}</span>
                  </li>
                  <li className="grid grid-cols-[44px_20px_1fr] gap-x-2">
                    <span />
                    <span className="flex justify-center" aria-hidden="true"><span className="w-[5px] rounded-full h-full min-h-[44px]" style={{ background: cor }} /></span>
                    <span className="py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6B6B6B] leading-snug">
                      <LineChip number={leg.lineCode || '—'} color={leg.lineColor} />
                      <span>
                        {[
                          leg.stopsCount ? tn(leg.stopsCount, '{n} paragem', '{n} paragens') : '',
                          leg.durationMinutes ? `${leg.durationMinutes} min` : '',
                          leg.operatorName || '',
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </li>
                  <li className="grid grid-cols-[44px_20px_1fr] gap-x-2 items-center">
                    <span className="font-condensada text-[16px] font-bold text-[#111111] tabular-nums text-right">{leg.arrivalTime}</span>
                    <span className="flex justify-center" aria-hidden="true"><span className="w-3.5 h-3.5 rounded-full border-[3px] bg-[#FFFFFF]" style={{ borderColor: cor }} /></span>
                    <span className="text-[15px] font-semibold text-[#111111] leading-tight">{formatTransitName(leg.toStopName || '')}</span>
                  </li>
                </React.Fragment>
              );
            })}
            <li className="grid grid-cols-[44px_20px_1fr] gap-x-2 items-center">
              <span className="font-condensada text-[16px] font-bold text-[#111111] tabular-nums text-right">{route.arrivalTime}</span>
              <span className="flex justify-center" aria-hidden="true"><span className="w-3.5 h-3.5 rounded-[3px] bg-[#111111]" /></span>
              <span className="text-[15px] font-bold text-[#111111] leading-tight">{destinoNome}</span>
            </li>
            <li className="mt-3 text-[12px] text-[#6B6B6B]">{route.realtimeLabel === 'Horário da AMP' ? t('Horários programados da AMP; podem mudar com o trânsito.') : t('Horários programados; podem mudar com o trânsito.')}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

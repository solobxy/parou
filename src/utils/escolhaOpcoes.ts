// Escolha das opções de viagem que a app mostra (no máximo `max`), da melhor para a pior (ver custoDaOpcao).
//
// Regra: cada meio de transporte que serve a viagem (metro, elétrico, comboio, barco) aparece pelo menos uma vez, desde que não
// chegue muito mais tarde do que a melhor opção. Sem isto, o corte "as 5 mais rápidas" escondia o metro sempre que havia
// vários autocarros um pouco mais rápidos (o metro quase sempre pede transbordo).
import type { RouteLeg, TransitRouteOption } from '../types/perto';

type ModoTransporte = NonNullable<RouteLeg['transportMode']>;

/** Meios de transporte que têm de poder aparecer na lista */
export const MODOS_A_GARANTIR: ModoTransporte[] = ['Metro', 'Elétrico', 'Comboio', 'Barco'];

export const usaModo = (o: Pick<TransitRouteOption, 'legs'>, modo: ModoTransporte): boolean =>
  o.legs.some((l) => l.mode === 'TRANSIT' && l.transportMode === modo);

/** Autocarros (e troleicarros) de uma opção: apanham trânsito e atrasam-se mais do que o metro, o elétrico, o comboio ou o barco */
export const autocarrosDe = (o: Pick<TransitRouteOption, 'legs'>): number =>
  o.legs.filter((l) => l.mode === 'TRANSIT' && (!l.transportMode || l.transportMode === 'Autocarro')).length;

type ParaCusto = Pick<TransitRouteOption, 'id' | 'legs' | 'totalDurationMinutes' | 'walkingMinutes' | 'transfersCount'>;

/**
 * "Minutos sentidos" de uma opção, para pôr a melhor em primeiro: o tempo até chegar mais o esforço. Cada minuto a pé conta
 * mais meio, cada transbordo 5 min e cada autocarro 2 min. Ir a pé conta só o tempo.
 * Ex.: Parque Nascente → Parque Maia, "metro F + C, 6 min a pé" (61 min) vem antes de "autocarro + comboio + autocarro,
 * 21 min a pé" (55 min). Um autocarro direto 8 min mais rápido continua à frente de um metro com transbordo.
 */
export function custoDaOpcao(o: ParaCusto): number {
  if (o.id === 'a-pe') return o.totalDurationMinutes;
  return o.totalDurationMinutes + 0.5 * o.walkingMinutes + 5 * o.transfersCount + 2 * autocarrosDe(o);
}

/** Ordem da lista: a melhor primeiro; com o mesmo custo, a que chega antes, depois menos transbordos e menos a pé */
export const ordemDasOpcoes = (a: ParaCusto, b: ParaCusto): number =>
  custoDaOpcao(a) - custoDaOpcao(b) || a.totalDurationMinutes - b.totalDurationMinutes
  || a.transfersCount - b.transfersCount || a.walkingMinutes - b.walkingMinutes;

/** A que chega primeiro (sem contar ir a pé); com a mesma chegada, a com menos transbordos e menos a pé */
export function maisRapidaDe<T extends ParaCusto>(lista: T[]): T | undefined {
  let m: T | undefined;
  for (const o of lista) {
    if (o.id === 'a-pe') continue;
    if (!m || o.totalDurationMinutes < m.totalDurationMinutes
      || (o.totalDurationMinutes === m.totalDurationMinutes && (o.transfersCount < m.transfersCount
        || (o.transfersCount === m.transfersCount && o.walkingMinutes < m.walkingMinutes)))) m = o;
  }
  return m;
}

/** Uma opção que chega mais tarde do que a melhor por mais do que isto (20 min ou metade da viagem) não se força na lista */
const toleranciaMin = (melhorMin: number) => Math.max(20, 0.5 * melhorMin);

/**
 * `lista` já vem ordenada (a melhor primeiro). Devolve até `max` opções, na mesma ordem, com pelo menos uma de cada meio de
 * transporte que exista na lista e não seja muito pior do que a melhor.
 */
export function limitarComModos(lista: TransitRouteOption[], max: number): TransitRouteOption[] {
  if (lista.length <= max) return [...lista];
  const dentro = lista.slice(0, max);
  const fora = lista.slice(max);
  const melhor = lista.find((o) => o.id !== 'a-pe');
  const limite = melhor ? melhor.totalDurationMinutes + toleranciaMin(melhor.totalDurationMinutes) : Infinity;

  for (const modo of MODOS_A_GARANTIR) {
    if (dentro.some((o) => usaModo(o, modo))) continue;
    const candidata = fora.find((o) => usaModo(o, modo) && o.totalDurationMinutes <= limite);
    if (!candidata) continue;
    // sai a pior das que ficam que não é a única do seu meio de transporte, nem a pé, nem a melhor
    for (let i = dentro.length - 1; i >= 0; i--) {
      const o = dentro[i];
      if (o.id === 'a-pe' || o === melhor) continue;
      const unicaDoMeio = MODOS_A_GARANTIR.some((m) => usaModo(o, m) && dentro.filter((x) => usaModo(x, m)).length === 1);
      if (unicaDoMeio) continue;
      dentro.splice(i, 1);
      dentro.push(candidata);
      break;
    }
  }
  return dentro.sort((a, b) => lista.indexOf(a) - lista.indexOf(b));
}

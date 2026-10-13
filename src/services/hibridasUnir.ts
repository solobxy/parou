// Viagens que juntam a rede normal (STCP, Metro, CP…) com a UNIR (autocarros da Área Metropolitana do
// Porto). O servidor encontra as combinações (não tem os horários da UNIR); o telemóvel pede a hora
// real à AMP e junta as duas partes numa só opção, com o tempo a pé entre as duas.

import { viagemUnir } from './unirAmp';
import type { CadeiaUnir, CandidatoUnir, DuplaUnir, HibridaUnir, PonteUnir, PontoRota, RouteLeg, TransitRouteOption } from '../types/perto';

/** Resposta do planeador com o que interessa aqui */
export interface PlanoComUnir {
  hibridas?: HibridaUnir[];
  pontes?: PonteUnir[];
  duplas?: DuplaUnir[];
  cadeias?: CadeiaUnir[];
  originCoords: { lat: number; lon: number };
  destCoords: { lat: number; lon: number };
}

/** Calcula o resto da viagem a partir de um ponto, à hora indicada (ms): opções já ordenadas, a melhor primeiro */
export type ContinuarViagem = (ponto: PontoRota, quandoMs: number) => Promise<TransitRouteOption[]>;

/** Tira os troços a pé de 0 min e junta os que ficam seguidos (a pé + a pé = uma só caminhada) */
export function limparPernas(legs: RouteLeg[]): RouteLeg[] {
  const saida: RouteLeg[] = [];
  for (const l of legs) {
    if (l.mode === 'WALK' && l.durationMinutes <= 0 && (l.distanceMeters ?? 0) < 40) continue;
    const ult = saida[saida.length - 1];
    if (l.mode === 'WALK' && ult?.mode === 'WALK') {
      saida[saida.length - 1] = {
        ...ult,
        instruction: l.instruction,
        durationMinutes: ult.durationMinutes + l.durationMinutes,
        distanceMeters: (ult.distanceMeters ?? 0) + (l.distanceMeters ?? 0),
        ...(ult.pontos && l.pontos ? { pontos: [...ult.pontos, ...l.pontos] } : {}),
      };
      continue;
    }
    saida.push(l);
  }
  return saida;
}

/** Junta duas partes consecutivas de uma viagem (a segunda mede o tempo desde que a primeira acaba) */
export function juntarOpcoes(a: TransitRouteOption, b: TransitRouteOption): TransitRouteOption {
  const legs = limparPernas([...a.legs, ...b.legs]);
  return {
    id: `h-${a.id}-${b.id}`,
    type: 'fewest_transfers',
    title: 'Com transbordo',
    badgeLabel: 'Com transbordo',
    totalDurationMinutes: Math.max(1, a.totalDurationMinutes + b.totalDurationMinutes),
    departureTime: a.departureTime,
    arrivalTime: b.arrivalTime,
    walkingDistanceMeters: a.walkingDistanceMeters + b.walkingDistanceMeters,
    walkingMinutes: legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + l.durationMinutes, 0),
    transfersCount: a.transfersCount + b.transfersCount + 1,
    legs,
    realtimeStatus: 'PROGRAMADO',
    realtimeLabel: /AMP/.test(`${a.realtimeLabel} ${b.realtimeLabel}`) ? 'Horário da AMP' : b.realtimeLabel,
    relevantAlerts: [...a.relevantAlerts, ...b.relevantAlerts],
    chegadaEpoch: b.chegadaEpoch,
  };
}

/**
 * Completa as combinações que o servidor encontrou:
 * - "híbridas": a viagem normal já vem calculada; a linha da UNIR a seguir é completada com a AMP;
 * - "pontes": começa-se numa linha da UNIR e continua-se com o planeador a partir de onde se sai.
 */
export async function opcoesComUnir(
  res: PlanoComUnir, destNome: string, partidaMs: number,
  continuar: ContinuarViagem | null, aindaValido: () => boolean = () => true,
): Promise<TransitRouteOption[]> {
  const tarefas: Array<Promise<TransitRouteOption | null>> = [];
  const desde = Math.floor(partidaMs / 1000);

  for (const h of (res.hibridas || []).slice(0, 4)) {
    tarefas.push((async () => {
      const uni = await viagemUnir(h.candidato as CandidatoUnir, destNome, h.transbordo, res.destCoords, h.chegadaEpoch).catch(() => null);
      return uni ? juntarOpcoes(h.prefixo, uni) : null;
    })());
  }

  // Duas linhas da UNIR: a segunda conta a partir da chegada da primeira
  for (const d of (res.duplas || []).slice(0, 4)) {
    tarefas.push((async () => {
      const ua = await viagemUnir(d.a, d.transbordo.nome || d.b.origem.nome, res.originCoords, d.transbordo, desde).catch(() => null);
      if (!ua?.chegadaEpoch || !aindaValido()) return null;
      const ub = await viagemUnir(d.b, destNome, d.transbordo, res.destCoords, ua.chegadaEpoch).catch(() => null);
      return ub ? juntarOpcoes(ua, ub) : null;
    })());
  }

  // Três linhas da UNIR: cada uma conta a partir da chegada da anterior
  for (const c of (res.cadeias || []).slice(0, 3)) {
    tarefas.push((async () => {
      let atual: TransitRouteOption | null = null;
      let desdeEpoch = desde;
      for (let i = 0; i < c.pernas.length; i++) {
        const ultimo = i === c.pernas.length - 1;
        const de = i === 0 ? res.originCoords : c.transbordos[i - 1];
        const para = ultimo ? res.destCoords : c.transbordos[i];
        const nome = ultimo ? destNome : (c.transbordos[i].nome || c.pernas[i + 1].origem.nome);
        const v = await viagemUnir(c.pernas[i], nome, de, para, desdeEpoch).catch(() => null);
        if (!v || !aindaValido()) return null;
        atual = atual ? juntarOpcoes(atual, v) : v;
        if (!ultimo) { if (!v.chegadaEpoch) return null; desdeEpoch = v.chegadaEpoch; }
      }
      return atual;
    })());
  }

  if (continuar) {
    for (const p of (res.pontes || []).slice(0, 3)) {
      tarefas.push((async () => {
        const nomePonto = p.ponto.nome || p.candidato.destino.nome;
        const uni = await viagemUnir(p.candidato, nomePonto, res.originCoords, p.ponto, desde).catch(() => null);
        if (!uni?.chegadaEpoch || !aindaValido()) return null;
        const resto = await continuar(p.ponto, uni.chegadaEpoch * 1000).catch(() => [] as TransitRouteOption[]);
        const melhor = resto[0];
        return melhor ? juntarOpcoes(uni, melhor) : null;
      })());
    }
  }

  if (!tarefas.length) return [];
  return (await Promise.all(tarefas)).filter(Boolean) as TransitRouteOption[];
}

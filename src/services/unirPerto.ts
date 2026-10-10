// Horários "Perto de ti": as linhas da UNIR não têm horários na base da PAROU (vêm da AMP, que só
// responde a telemóveis em Portugal). O servidor diz que linhas passam perto e em que paragens;
// aqui o telemóvel pergunta à AMP as próximas passagens e completa os cartões.
import type { ApiLineItem } from './transitApi';
import { passagensUnir, type PassagemUnir } from './unirAmp';

const MAX_PARAGENS = 12;
const POR_SENTIDO = 2;

const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const semPrefixo = (id: string) => id.replace(/^unir:/, '').trim();

function hhmm(segundos: number): string {
  const s = ((segundos % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

function partidaDe(x: PassagemUnir, sentido: number, agora: number, nomeLinha: string): NonNullable<ApiLineItem['departures']>[number] {
  const min = Math.max(0, Math.round((x.epoch - agora) / 60));
  const hoje = new Date(agora * 1000).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
  const dia = new Date(x.epoch * 1000).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
  const hora = hhmm(x.segundos);
  return {
    direction_id: sentido,
    destination: x.destino || nomeLinha || 'UNIR',
    ...(x.nomeParagem ? { stop_name: x.nomeParagem } : {}),
    time: hora,
    state: 'Programado',
    countdown_minutes: min,
    displayText: dia !== hoje && min >= 60 ? `amanhã às ${hora}` : min < 1 ? 'a chegar' : `daqui a ${min} min`,
  };
}

/**
 * Devolve a lista de linhas com as da UNIR completas: com as próximas passagens da AMP, ou
 * retiradas se já não passam mais (a AMP respondeu e a linha não tem mais passagens).
 * Se a AMP não responder, as linhas ficam como o servidor as enviou ("Horário indisponível").
 */
export async function completarLinhasUnir(linhas: ApiLineItem[]): Promise<ApiLineItem[]> {
  const externas = linhas.filter((l) => l.horario_externo);
  if (!externas.length) return linhas;

  // Paragens a consultar: as mais perto primeiro, no máximo MAX_PARAGENS
  const ordenadas = [...externas].sort((a, b) => (a.nearest_stop?.distance_meters ?? 99999) - (b.nearest_stop?.distance_meters ?? 99999));
  const codigos: string[] = [];
  for (const l of ordenadas) {
    const ids = l.paragens_unir?.length ? l.paragens_unir : l.nearest_stop?.id ? [l.nearest_stop.id] : [];
    for (const id of ids) {
      const c = semPrefixo(id);
      if (c && !codigos.includes(c) && codigos.length < MAX_PARAGENS) codigos.push(c);
    }
  }
  if (!codigos.length) return linhas;

  const grupos: string[][] = [];
  for (let i = 0; i < codigos.length; i += 3) grupos.push(codigos.slice(i, i + 3));
  const respostas = await Promise.all(grupos.map((g) => passagensUnir(g, 3000).catch(() => ({ ok: false, passagens: [] as PassagemUnir[] }))));
  if (!respostas.some((r) => r.ok)) return linhas; // AMP sem resposta: fica como veio do servidor
  const todas = respostas.flatMap((r) => r.passagens);
  const agora = Math.floor(Date.now() / 1000);

  const resultado: ApiLineItem[] = [];
  for (const l of linhas) {
    if (!l.horario_externo) { resultado.push(l); continue; }
    const deste = new Set((l.paragens_unir?.length ? l.paragens_unir : l.nearest_stop?.id ? [l.nearest_stop.id] : []).map(semPrefixo));
    const consultadas = Array.from(deste).filter((c) => codigos.includes(c));
    if (!consultadas.length) { resultado.push(l); continue; } // paragem fora do limite: mantém o que veio
    const passagens = todas.filter((x) => x.linha === l.code && deste.has(x.paragem)).sort((a, b) => a.epoch - b.epoch);
    if (!passagens.length) continue; // a linha já não passa mais (hoje) perto de ti
    const porDestino = new Map<string, PassagemUnir[]>();
    for (const x of passagens) {
      const k = norm(x.destino) || 'x';
      porDestino.set(k, [...(porDestino.get(k) || []), x]);
    }
    const departures: NonNullable<ApiLineItem['departures']> = [];
    let sentido = 0;
    for (const lista of porDestino.values()) {
      for (const x of lista.slice(0, POR_SENTIDO)) departures.push(partidaDe(x, sentido, agora, l.name));
      sentido++;
    }
    resultado.push({
      ...l,
      destinations: Array.from(new Set(passagens.map((x) => x.destino).filter(Boolean))),
      departures: departures.sort((a, b) => a.countdown_minutes - b.countdown_minutes),
    });
  }
  return resultado;
}

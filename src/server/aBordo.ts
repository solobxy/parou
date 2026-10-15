// "A bordo": onde vai um autocarro, que paragens já passou e quais são as seguintes.
// Tudo vem da posição que o operador envia e do percurso do horário. Não se inventa nenhuma hora de chegada:
// a hora de cada paragem é a do horário (e só quando a viagem é a deste autocarro); o tempo real é a posição.
// Exceção: a TUB envia a hora prevista de cada paragem que falta; essa mostra-se (com a indicação de que é prevista) e só se for da mesma viagem.

import { RealtimeEngine } from './realtimeEngine';
import { paraVeiculoLeve } from './veiculos';
import { percursoPorVeiculo } from './percursoLinha';
import type { RespostaABordo } from '../types/aBordo';
import { metros, progressoNoPercurso } from '../utils/geoPercurso';
import { DateTime } from 'luxon';
import { previsoesDoPercurso, viagensTub } from './tubTempoReal';

export type ResultadoABordo = { ok: true; dados: RespostaABordo } | { ok: false; motivo: 'sem-sinal' };

export async function calcularABordo(id: string, opcoes: { desde?: number; completo?: boolean } = {}): Promise<ResultadoABordo> {
  const todos = await RealtimeEngine.getLiveVehicles();
  const bruto = todos.find((v) => v.id === id);
  const veiculo = bruto ? paraVeiculoLeve(bruto) : null;
  if (!bruto || !veiculo) return { ok: false, motivo: 'sem-sinal' };

  const achado = percursoPorVeiculo({
    op: veiculo.op,
    linha: veiculo.linha,
    lat: veiculo.lat,
    lon: veiculo.lon,
    rumo: veiculo.rumo,
    vel: veiculo.vel,
    viagem: bruto.trip_id,
    rota: bruto.route_id,
  });
  if (!achado) return { ok: true, dados: { veiculo, linha: veiculo.linha, semPercurso: true } };

  const { percurso, origem } = achado;
  const pos = { lat: veiculo.lat, lon: veiculo.lon };
  const prog = progressoNoPercurso(percurso.paragens, pos, { desde: opcoes.desde });
  const dados: RespostaABordo = {
    veiculo,
    origem,
    linha: percurso.linha || veiculo.linha,
    ...(percurso.cor ? { cor: percurso.cor } : {}),
    destino: percurso.destino,
    total: percurso.paragens.length,
    ...(opcoes.completo ? { paragens: percurso.paragens } : {}),
  };
  if (prog) {
    dados.indice = prog.indice;
    dados.naParagem = prog.naParagem;
    dados.distanciaProximaM = Math.round(metros(pos, percurso.paragens[prog.indice]));
    dados.desvioM = Math.round(prog.distanciaAoPercursoM);
    // TUB: hora prevista de cada paragem que falta (só quando o percurso é o da viagem deste autocarro e a previsão tem menos de 2 minutos)
    if (veiculo.op === 'tub' && origem === 'viagem' && bruto.trip_id) {
      const previsoes = await viagensTub(1500).catch(() => null);
      const viagem = previsoes?.dados.get(bruto.trip_id);
      if (viagem && !viagem.cancelada) {
        const mapa = previsoesDoPercurso(viagem, percurso.paragens, prog.indice);
        if (mapa.size > 0) {
          const hh = (t: number) => DateTime.fromSeconds(t, { zone: 'Europe/Lisbon' }).toFormat('HH:mm');
          dados.previstas = Object.fromEntries([...mapa].map(([i, t]) => [i, hh(t)]));
        }
      }
    }
  }
  return { ok: true, dados };
}

// Memória das duas últimas posições (distintas) de cada veículo.
// Serve para o mapa, quando abre, já poder mostrar cada autocarro em movimento: com só a última posição o autocarro ficava parado
// até chegar a seguinte (15 a 30 s). A posição anterior é a que o operador mediu antes da última; não se inventa nada.
// Fica só em memória (não se guarda em disco) e esquece o veículo cinco minutos depois de o deixar de ver.

import type { LiveVehicle } from './realtimeEngine';

interface Marca { lat: number; lon: number; t: number }
interface Historico { atual: Marca; anterior?: Marca; visto: number }

const historico = new Map<string, Historico>();
const ESQUECER_DEPOIS_MS = 5 * 60 * 1000;
/** Se a posição anterior for mais antiga do que isto (s) em relação à última, não serve (o autocarro esteve fora do alcance) */
const MAX_INTERVALO_S = 120;

/** Acrescenta `prev` aos veículos que já tinham outra posição medida antes da atual. Chamar sempre que a lista é refeita. */
export function anotarAnteriores(lista: LiveVehicle[], agoraMs: number): void {
  for (const v of lista) {
    if (!v.id || !Number.isFinite(v.timestamp)) continue;
    const h = historico.get(v.id);
    if (!h) { historico.set(v.id, { atual: { lat: v.lat, lon: v.lon, t: v.timestamp }, visto: agoraMs }); continue; }
    h.visto = agoraMs;
    if (v.timestamp > h.atual.t) {
      h.anterior = h.atual;
      h.atual = { lat: v.lat, lon: v.lon, t: v.timestamp };
    }
    if (h.atual.t === v.timestamp && h.anterior && v.timestamp - h.anterior.t <= MAX_INTERVALO_S) {
      v.prev = { lat: h.anterior.lat, lon: h.anterior.lon, timestamp: h.anterior.t };
    }
  }
  for (const [id, h] of historico) if (agoraMs - h.visto > ESQUECER_DEPOIS_MS) historico.delete(id);
}

export function limparHistoricoPosicoes(): void { historico.clear(); }
export function tamanhoHistoricoPosicoes(): number { return historico.size; }

// Deteta se a pessoa vai dentro de um autocarro: compara o caminho do telemóvel (GPS) com o caminho dos autocarros em direto.
// Tudo acontece no telemóvel; ao servidor só se pede a lista de autocarros da zona. Nunca se decide sozinho: o resultado serve para
// perguntar «Está a bordo do 801?». Só funciona com a app aberta (um site não tem acesso à posição em segundo plano).
//
// Como se decide:
//  1. A pessoa tem de se estar a mexer como um veículo (≥ 2,5 m/s, ≈ 9 km/h, durante uns 20 s): a pé não conta.
//  2. Cada posição de um autocarro tem a hora a que o operador a mediu (chega com 10 a 30 s de atraso). Compara-se com onde a pessoa
//     estava NESSA hora (interpolando as leituras do GPS), não com onde está agora. O relógio do telemóvel é acertado pelo do servidor.
//  3. Se nas últimas 3 ou mais posições o autocarro esteve sempre ao lado da pessoa, e foi para o mesmo lado, e à mesma velocidade, é candidato.
//  4. Se há dois candidatos quase empatados (dois autocarros lado a lado), pergunta-se com os dois.

import { diferencaRumo, metros, rumoEntre } from './geoPercurso';
import type { VeiculoLeve } from '../types/aBordo';

export interface Leitura {
  /** Milissegundos desde 1970 (relógio do telemóvel) */
  t: number;
  lat: number;
  lon: number;
  /** Metros */
  precisao: number;
}

export interface Candidato {
  veiculo: VeiculoLeve;
  distanciaMediaM: number;
  amostras: number;
  confianca: 'alta' | 'media';
}

export interface Escolha {
  principal: Candidato;
  /** Outros candidatos quase tão bons (para perguntar «801 ou 803?») */
  alternativas: Candidato[];
}

const JANELA_LEITURAS_MS = 150_000;
const JANELA_MOVIMENTO_MS = 45_000;
const MOVIMENTO_MINIMO_MS = 20_000;
const VELOCIDADE_MINIMA_MS = 2.5;
const DESLOCAMENTO_MINIMO_M = 60;
const PAUSA_MAXIMA_MS = 30_000;
const MIN_AMOSTRAS = 3;
const MAX_AMOSTRAS = 5;
const DESVIOS_RELOGIO_S = [0, -2, 2, -4, 4];
const FOLGA_FIM_MS = 6_000;

interface Ponto { lat: number; lon: number }

export class DetetorABordo {
  private leituras: Leitura[] = [];
  private rastos = new Map<string, VeiculoLeve[]>();
  private recusados = new Map<string, number>();
  /** Relógio do servidor menos relógio do telemóvel, em ms */
  private desvioRelogioMs = 0;
  private temDesvio = false;

  reiniciar(): void {
    this.leituras = [];
    this.rastos.clear();
    this.recusados.clear();
    this.temDesvio = false;
    this.desvioRelogioMs = 0;
  }

  /** Esquece o que viu dos autocarros mas mantém as leituras (ex.: depois de uma resposta «Não») */
  esquecerVeiculos(): void {
    this.rastos.clear();
  }

  adicionarLeitura(l: Leitura): void {
    if (![l.t, l.lat, l.lon, l.precisao].every(Number.isFinite)) return;
    const ultima = this.leituras[this.leituras.length - 1];
    if (ultima && l.t <= ultima.t) return;
    if (ultima && l.t - ultima.t > PAUSA_MAXIMA_MS) {
      // Houve uma pausa grande nas leituras: o que havia já não serve para comparar caminhos
      this.leituras = [];
      this.rastos.clear();
    }
    this.leituras.push(l);
    const corte = l.t - JANELA_LEITURAS_MS;
    while (this.leituras.length > 2 && this.leituras[0].t < corte) this.leituras.shift();
  }

  /** Acerta o relógio do telemóvel pelo do servidor. `agoraServidorS`: hora do servidor na resposta; `recebidoEmMs`: hora do telemóvel quando chegou. */
  acertarRelogio(agoraServidorS: number, recebidoEmMs: number): void {
    if (!Number.isFinite(agoraServidorS) || !Number.isFinite(recebidoEmMs)) return;
    const medido = agoraServidorS * 1000 - recebidoEmMs;
    this.desvioRelogioMs = this.temDesvio ? this.desvioRelogioMs * 0.5 + medido * 0.5 : medido;
    this.temDesvio = true;
  }

  /** Quantos metros separavam a pessoa do autocarro na hora a que o operador mediu a posição dele (null se não há leituras dessa hora) */
  distanciaA(v: VeiculoLeve): number | null {
    const u = this.posicaoEm(v.t * 1000 - this.desvioRelogioMs);
    return u ? metros(u, v) : null;
  }

  /** Autocarros que o servidor enviou */
  adicionarVeiculos(lista: VeiculoLeve[], relogio?: { agoraServidorS: number; recebidoEmMs: number }): void {
    if (relogio) this.acertarRelogio(relogio.agoraServidorS, relogio.recebidoEmMs);
    for (const v of lista) {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || !Number.isFinite(v.t)) continue;
      const rasto = this.rastos.get(v.id) ?? [];
      const ultimo = rasto[rasto.length - 1];
      if (ultimo && v.t <= ultimo.t) continue; // a mesma posição, ainda sem novidade do operador
      rasto.push(v);
      while (rasto.length > 12) rasto.shift();
      this.rastos.set(v.id, rasto);
    }
    // Veículos que já não aparecem nem têm posição recente saem da memória
    const limite = (this.leituras.length ? this.leituras[this.leituras.length - 1].t : Date.now()) + this.desvioRelogioMs - JANELA_LEITURAS_MS;
    for (const [id, rasto] of this.rastos) {
      if (rasto[rasto.length - 1].t * 1000 < limite) this.rastos.delete(id);
    }
    if (this.rastos.size > 200) {
      const ordenados = [...this.rastos.entries()].sort((a, b) => a[1][a[1].length - 1].t - b[1][b[1].length - 1].t);
      for (const [id] of ordenados.slice(0, this.rastos.size - 200)) this.rastos.delete(id);
    }
  }

  /** A pessoa mexe-se como um veículo? (só então vale a pena ir buscar os autocarros) */
  emMovimento(): boolean {
    const n = this.leituras.length;
    if (n < 3) return false;
    const fim = this.leituras[n - 1];
    const ini = this.leituras.find((l) => l.t >= fim.t - JANELA_MOVIMENTO_MS);
    if (!ini || fim.t - ini.t < MOVIMENTO_MINIMO_MS) return false;
    const d = metros(ini, fim);
    const segundos = (fim.t - ini.t) / 1000;
    return d >= DESLOCAMENTO_MINIMO_M && d > 2 * Math.max(ini.precisao, fim.precisao) && d / segundos >= VELOCIDADE_MINIMA_MS;
  }

  /** Não voltar a perguntar por este autocarro durante uns minutos */
  recusar(id: string, minutos = 10): void {
    const base = this.leituras.length ? this.leituras[this.leituras.length - 1].t : Date.now();
    this.recusados.set(id, base + minutos * 60_000);
  }

  /** Onde a pessoa estava a esta hora (relógio do telemóvel) */
  private posicaoEm(t: number): (Ponto & { precisao: number }) | null {
    const L = this.leituras;
    if (!L.length || t < L[0].t) return null;
    const ult = L[L.length - 1];
    if (t >= ult.t) return t - ult.t <= FOLGA_FIM_MS ? ult : null;
    for (let i = 1; i < L.length; i++) {
      if (L[i].t < t) continue;
      const a = L[i - 1];
      const b = L[i];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, precisao: Math.max(a.precisao, b.precisao) };
    }
    return null;
  }

  /** Autocarros que foram ao lado da pessoa, do mais provável para o menos */
  candidatos(): Candidato[] {
    if (this.leituras.length < 3 || !this.emMovimento()) return [];
    const fimT = this.leituras[this.leituras.length - 1].t;
    const iniT = this.leituras[0].t;
    const saida: Candidato[] = [];
    for (const [id, rasto] of this.rastos) {
      if ((this.recusados.get(id) ?? 0) > fimT) continue;
      let melhor: { n: number; media: number; du: number; dv: number; rumoU: number; rumoV: number; segundos: number } | null = null;
      for (const desvioS of DESVIOS_RELOGIO_S) {
        const emTelemovel = (p: VeiculoLeve) => (p.t + desvioS) * 1000 - this.desvioRelogioMs;
        const amostras = rasto.filter((p) => emTelemovel(p) >= iniT && emTelemovel(p) <= fimT + FOLGA_FIM_MS);
        // Conta, a partir da mais recente, as posições seguidas em que o autocarro esteve ao lado da pessoa
        const pares: Array<{ u: Ponto; v: VeiculoLeve; d: number; tT: number }> = [];
        let soma = 0;
        for (let i = amostras.length - 1; i >= 0 && pares.length < MAX_AMOSTRAS; i--) {
          const p = amostras[i];
          const u = this.posicaoEm(emTelemovel(p));
          if (!u) break;
          const d = metros(u, p);
          const limite = Math.min(90, Math.max(30, 1.5 * u.precisao + 18));
          if (d > limite) break;
          soma += d;
          pares.push({ u, v: p, d, tT: p.t });
        }
        if (pares.length < MIN_AMOSTRAS) continue;
        const primeiro = pares[pares.length - 1];
        const ultimo = pares[0];
        const du = metros(primeiro.u, ultimo.u);
        const dv = metros(primeiro.v, ultimo.v);
        const media = soma / pares.length;
        if (!melhor || pares.length > melhor.n || (pares.length === melhor.n && media < melhor.media)) {
          melhor = { n: pares.length, media, du, dv, rumoU: rumoEntre(primeiro.u, ultimo.u), rumoV: rumoEntre(primeiro.v, ultimo.v), segundos: ultimo.tT - primeiro.tT };
        }
      }
      if (!melhor) continue;
      // Os dois foram para o mesmo lado, a uma velocidade parecida, e não estavam parados
      if (melhor.segundos < 15 || melhor.du < 50 || melhor.dv < 50) continue;
      const razao = melhor.du / melhor.dv;
      if (razao < 0.5 || razao > 2) continue;
      if (diferencaRumo(melhor.rumoU, melhor.rumoV) > 60) continue;
      saida.push({
        veiculo: rasto[rasto.length - 1],
        distanciaMediaM: Math.round(melhor.media),
        amostras: melhor.n,
        confianca: melhor.n >= 4 && melhor.media <= 25 ? 'alta' : 'media',
      });
    }
    return saida.sort((a, b) => a.distanciaMediaM - b.distanciaMediaM);
  }

  /** O que perguntar à pessoa: o melhor candidato e os que estão quase tão perto (de outra linha) */
  escolher(): Escolha | null {
    const todos = this.candidatos();
    if (!todos.length) return null;
    const principal = todos[0];
    const alternativas = todos
      .slice(1)
      .filter((c) => c.veiculo.linha !== principal.veiculo.linha && c.distanciaMediaM <= principal.distanciaMediaM + 12)
      // Uma linha só aparece uma vez
      .filter((c, i, arr) => arr.findIndex((x) => x.veiculo.linha === c.veiculo.linha) === i)
      .slice(0, 2);
    return { principal, alternativas };
  }
}

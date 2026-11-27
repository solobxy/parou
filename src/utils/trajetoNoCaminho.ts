// Autocarros no mapa pela estrada (pedido do Dinis, 27/11/2026: «demasiado lentos, demasiado atrasados, a ir por fora das ruas
// e a atravessar paredes»).
//
// O movimento antigo (trajetoVeiculo.ts) unia as posições do operador em linha reta: entre duas posições com 15 a 30 s de
// distância o autocarro cortava as esquinas por dentro dos prédios. E, para não errar, mostrava-o onde estava há ~20 a 30 s.
// Aqui, quando se conhece o desenho da linha (o percurso oficial pela estrada), o autocarro anda SOBRE esse desenho:
//   1. cada posição do operador é encaixada no desenho (o ponto da estrada mais perto, perto de onde ia antes, nunca a mais de 45 m);
//   2. o alvo é a distância percorrida no desenho: entre posições interpola-se, depois da última continua-se pela estrada à
//      velocidade medida (as esquinas fazem-se pela estrada, não por cima dos prédios), e por isso pode ir mais perto do presente;
//   3. o marcador segue o alvo com uma mola (sem saltos), nunca para trás, e a seta aponta para onde a estrada vai.
// Sem desenho (ou se o autocarro sair dele: desvio, garagem) fica o movimento antigo, como antes.
// Matemática pura (sem mapa nem relógio), para se poder testar.
import { MovimentoVeiculo, type Fix, type OperadorTrajeto, type PosicaoModelo, distanciaM, INTERVALO_INICIAL, VEL_MAX_MS } from './trajetoVeiculo';

export interface Caminho {
  pts: Array<{ lat: number; lon: number }>;
  /** Distância acumulada (m) até cada ponto */
  cum: number[];
  total: number;
}

/** Mais longe do que isto (m) do desenho, a posição não é desta estrada */
export const DIST_MAX_ENCAIXE_M = 45;
/** Fração da idade da posição que fica de atraso (o resto anda-se pela estrada, à velocidade medida) */
export const FATOR_IDADE = 0.5;
/** Fração do intervalo entre posições que fica de atraso */
export const FATOR_INTERVALO = 0.25;
/** Depois da última posição, continua pela estrada no máximo isto (s) e depois abranda */
export const HORIZONTE_S = 22;
export const TRAVAGEM_S = 8;
/** Mola que leva o marcador ao alvo (rad/s): mais rápida do que a antiga (0,6), por isso não fica para trás */
export const OMEGA_CAMINHO = 1.1;
/** Nunca mais depressa do que isto vezes a velocidade medida (nem do que 6 m/s) */
export const TETO_FATOR = 1.7;
export const TETO_MIN_MS = 6;
/** Alvo a mais do que isto (m) do marcador: reapareceu noutro sítio, vai direto */
export const SALTO_M = 450;

const M_POR_GRAU = 111_320;
const rad = Math.PI / 180;

export function prepararCaminho(pontos: Array<{ lat: number; lon: number }>): Caminho | null {
  const pts = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanciaM(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  return total > 50 ? { pts, cum, total } : null;
}

/** Ponto do desenho mais perto de `p`, procurado só entre as distâncias `de` e `ate` (m) do desenho */
export function projetar(c: Caminho, p: { lat: number; lon: number }, de = 0, ate = Infinity): { s: number; dist: number } {
  let melhor = { s: 0, dist: Infinity };
  const cos = Math.cos(p.lat * rad);
  for (let i = 1; i < c.pts.length; i++) {
    if (c.cum[i] < de || c.cum[i - 1] > ate) continue;
    const a = c.pts[i - 1], b = c.pts[i];
    const ax = (a.lon - p.lon) * M_POR_GRAU * cos, ay = (a.lat - p.lat) * M_POR_GRAU;
    const bx = (b.lon - p.lon) * M_POR_GRAU * cos, by = (b.lat - p.lat) * M_POR_GRAU;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let k = l2 > 0 ? -(ax * dx + ay * dy) / l2 : 0;
    k = Math.max(0, Math.min(1, k));
    const s = c.cum[i - 1] + k * (c.cum[i] - c.cum[i - 1]);
    if (s < de || s > ate) continue;
    const d = Math.hypot(ax + k * dx, ay + k * dy);
    if (d < melhor.dist) melhor = { s, dist: d };
  }
  return melhor;
}

/** Ponto do desenho à distância `s` (m) e o rumo da estrada aí */
export function pontoEm(c: Caminho, s: number): { lat: number; lon: number; rumo: number } {
  const x = Math.max(0, Math.min(c.total, s));
  let lo = 1, hi = c.cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (c.cum[m] < x) lo = m + 1; else hi = m; }
  const i = Math.max(1, lo);
  const a = c.pts[i - 1], b = c.pts[i];
  const seg = c.cum[i] - c.cum[i - 1];
  const k = seg > 0 ? (x - c.cum[i - 1]) / seg : 0;
  const dy = (b.lat - a.lat) * M_POR_GRAU, dx = (b.lon - a.lon) * M_POR_GRAU * Math.cos(((a.lat + b.lat) / 2) * rad);
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k, rumo: (Math.atan2(dx, dy) / rad + 360) % 360 };
}

interface FixS { t: number; s: number }

/**
 * Um autocarro no mapa, pela estrada quando se sabe o desenho da linha. Mesma forma de usar que MovimentoVeiculo
 * (receber / alinhar / mostrar / tem), que continua a andar por baixo e é o que se mostra sem desenho.
 */
export class MovimentoNoCaminho {
  private readonly base: MovimentoVeiculo;
  private caminhos: Caminho[] = [];
  private c: Caminho | null = null;
  private fixes: Fix[] = [];
  private fs: FixS[] = [];
  private fora = 0;
  private intervalo: number;
  private idade = 15;
  /** Posição do marcador no desenho (m) e velocidade (m/s) */
  private s = 0; private v = 0;
  private W = 0;
  private iniciado = false;

  constructor(private readonly op: OperadorTrajeto) {
    this.base = new MovimentoVeiculo(op);
    this.intervalo = INTERVALO_INICIAL[op];
  }

  /** Desenhos da linha deste autocarro (um por sentido/variante); escolhe-se o que encaixa nas posições */
  definirCaminhos(lista: Caminho[]): void {
    this.caminhos = lista.slice(0, 8);
    if (!this.c) this.escolher();
  }

  /** O desenho em que o autocarro anda (null: anda em linha reta, como antes) */
  get caminho(): Caminho | null { return this.c; }

  private escolher(): void {
    if (!this.caminhos.length || !this.fixes.length) return;
    const ult = this.fixes.slice(-3);
    let melhor: { c: Caminho; erro: number; s: number[] } | null = null;
    for (const c of this.caminhos) {
      const ss: number[] = [];
      let erro = 0;
      let ok = true;
      let de = 0;
      for (const f of ult) {
        // cada posição perto (no desenho) de onde estava a anterior, para as linhas que passam duas vezes na mesma rua
        const p = projetar(c, f, de);
        if (p.dist > DIST_MAX_ENCAIXE_M) { ok = false; break; }
        erro += p.dist;
        ss.push(p.s);
        de = Math.max(0, p.s - 60);
      }
      if (!ok) continue;
      // tem de andar no sentido do desenho (o desenho do outro sentido passa nas mesmas ruas ao contrário)
      if (ss.length >= 2 && ss[ss.length - 1] - ss[0] < -25) continue;
      if (!melhor || erro < melhor.erro) melhor = { c, erro, s: ss };
    }
    if (!melhor) return;
    this.c = melhor.c;
    this.fora = 0;
    this.fs = ult.map((f, i) => ({ t: f.t, s: melhor!.s[i] }));
    this.iniciado = false;
  }

  receber(fix: Fix, agora: number, idadeConhecida?: number): void {
    this.base.receber(fix, agora, idadeConhecida);
    const ultF = this.fixes[this.fixes.length - 1];
    if (ultF && fix.t <= ultF.t) return;
    const idade = Math.max(0, idadeConhecida ?? agora - fix.t);
    if (ultF) {
      const dt = fix.t - ultF.t;
      if (dt > 120) { this.fixes = []; this.fs = []; this.c = null; this.iniciado = false; }
      else {
        this.intervalo = Math.min(60, Math.max(8, 0.7 * this.intervalo + 0.3 * dt));
        // erro de GPS evidente: não entra (o movimento antigo também o ignora)
        if (distanciaM(ultF, fix) / dt > VEL_MAX_MS) return;
      }
    }
    this.idade = this.fixes.length ? Math.min(60, 0.7 * this.idade + 0.3 * idade) : Math.min(60, idade);
    this.fixes.push(fix);
    if (this.fixes.length > 4) this.fixes.shift();
    if (!this.c) { this.escolher(); return; }
    const ultS = this.fs[this.fs.length - 1];
    const dt = ultS ? Math.max(1, fix.t - ultS.t) : 30;
    const de = ultS ? Math.max(0, ultS.s - 80) : 0;
    const ate = ultS ? ultS.s + VEL_MAX_MS * dt + 120 : Infinity;
    const p = projetar(this.c, fix, de, ate);
    if (p.dist > DIST_MAX_ENCAIXE_M) {
      // saiu do desenho (desvio, garagem): ao fim de duas posições seguidas fora, volta à linha reta e procura outro desenho
      if (++this.fora >= 2) { this.c = null; this.fs = []; this.iniciado = false; this.escolher(); }
      return;
    }
    this.fora = 0;
    // o GPS treme uns metros para trás quando o autocarro está parado: não recua
    const s = ultS && p.s < ultS.s ? ultS.s : p.s;
    this.fs.push({ t: fix.t, s });
    if (this.fs.length > 4) this.fs.shift();
  }

  /** Velocidade recente pela estrada (m/s), das últimas posições */
  private velocidade(): number {
    const f = this.fs;
    if (f.length < 2) return 0;
    const a = f[Math.max(0, f.length - 3)], b = f[f.length - 1];
    return b.t > a.t ? Math.max(0, (b.s - a.s) / (b.t - a.t)) : 0;
  }

  /** Onde o autocarro devia estar no desenho no relógio `agora` */
  private alvo(agora: number): { s: number; v: number } {
    const f = this.fs;
    const P = agora - (FATOR_IDADE * this.idade + FATOR_INTERVALO * this.intervalo);
    if (f.length === 1 || P <= f[0].t) return { s: f[0].s, v: 0 };
    for (let i = 1; i < f.length; i++) {
      if (P <= f[i].t) {
        const k = (P - f[i - 1].t) / (f[i].t - f[i - 1].t);
        return { s: f[i - 1].s + (f[i].s - f[i - 1].s) * k, v: (f[i].s - f[i - 1].s) / (f[i].t - f[i - 1].t) };
      }
    }
    const ult = f[f.length - 1];
    const v = this.velocidade();
    const excesso = P - ult.t;
    const alem = Math.max(0, excesso - HORIZONTE_S);
    const andou = v * (Math.min(excesso, HORIZONTE_S) + TRAVAGEM_S * (1 - Math.exp(-alem / TRAVAGEM_S)));
    return { s: ult.s + andou, v: v * Math.exp(-alem / TRAVAGEM_S) };
  }

  private avancar(agora: number): void {
    if (!this.c || !this.fs.length) return;
    if (!this.iniciado) {
      const a = this.alvo(agora);
      this.s = a.s; this.v = a.v; this.W = agora; this.iniciado = true;
      return;
    }
    const dt = agora - this.W;
    if (!(dt > 0)) return;
    const n = Math.max(1, Math.ceil(dt / 0.05));
    const h = dt / n;
    let W = this.W;
    for (let i = 0; i < n; i++) {
      W += h;
      const a = this.alvo(W);
      const erro = a.s - this.s;
      if (Math.abs(erro) > SALTO_M) { this.s = a.s; this.v = a.v; continue; }
      // mola amortecida criticamente, a seguir também a velocidade do alvo (não fica para trás em velocidade constante)
      this.v += (OMEGA_CAMINHO * OMEGA_CAMINHO * erro + 2 * OMEGA_CAMINHO * (a.v - this.v)) * h;
      if (this.v < 0) this.v = 0; // nunca para trás
      const teto = TETO_FATOR * Math.max(TETO_MIN_MS, a.v, this.velocidade());
      if (this.v > teto) this.v = teto;
      this.s = Math.min(this.c.total, this.s + this.v * h);
    }
    this.W = agora;
  }

  alinhar(agora: number): void {
    this.base.alinhar(agora);
    if (this.c && this.fs.length) { const a = this.alvo(agora); this.s = a.s; this.v = a.v; this.W = agora; this.iniciado = true; }
  }

  tem(): boolean { return this.base.tem(); }

  mostrar(agora: number): PosicaoModelo {
    const b = this.base.mostrar(agora); // anda sempre por baixo, para estar certo se o autocarro sair do desenho
    if (!this.c || !this.fs.length) return b;
    this.avancar(agora);
    const p = pontoEm(this.c, this.s);
    return { lat: p.lat, lon: p.lon, rumo: this.v >= 1 || this.fs.length >= 2 ? p.rumo : b.rumo, vel: this.v };
  }
}

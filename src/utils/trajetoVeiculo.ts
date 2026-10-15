// Movimento suave dos autocarros no mapa.
//
// Os operadores só enviam uma posição de 15 em 15 segundos (Carris Metropolitana e TUB) ou de 30 em 30 (STCP), e a posição chega
// à app com 10 a 30 segundos de idade. Se o marcador fosse sempre para a última posição, ficava parado e dava um salto de 50 a
// 600 metros de cada vez («teleporta»). Em vez disso:
//   1. guarda-se o histórico das últimas posições medidas (com a hora a que foram medidas);
//   2. calcula-se um ALVO: onde o autocarro devia estar agora, no caminho reto entre as posições medidas e, depois da última,
//      a continuar pelo mesmo caminho à mesma velocidade (no máximo `HORIZONTE_EXTRAPOLAR_S` segundos de avanço);
//   3. o marcador não vai para o alvo: segue-o como numa mola amortecida (velocidade contínua, limitada a 1,35× a do troço),
//      por isso uma posição nova que mude o alvo nunca se vê como um salto, só como uma ligeira aceleração ou travagem;
//   4. o marcador não recua: se o alvo ficou atrás (o autocarro parou), espera;
//   5. posições com um erro de GPS evidente (velocidade impossível) são ignoradas.
// Tudo o que aqui está é matemática pura (sem mapa nem relógio), para se poder testar com séries reais.

export interface Fix { t: number; lat: number; lon: number }

export interface Trajeto {
  /** Últimas posições medidas, por ordem de `t` (no máximo `MAX_FIXES`) */
  fixes: Fix[];
  /** Intervalo típico entre posições deste autocarro (s) */
  intervalo: number;
  /** Idade típica de uma posição quando chega à app (s) */
  idade: number;
  /** Posições seguidas que pareceram erro de GPS (para não ficar preso a um erro) */
  rejeitadas: number;
}

export type OperadorTrajeto = 'stcp' | 'cm' | 'tub';

const MAX_FIXES = 4;
/** Intervalo habitual de cada operador, até haver medidas deste autocarro (s) */
export const INTERVALO_INICIAL: Record<OperadorTrajeto, number> = { stcp: 32, cm: 15, tub: 15 };
/** Mais depressa do que isto (m/s, ≈ 108 km/h) um autocarro urbano não anda: é erro de GPS */
export const VEL_MAX_MS = 30;
/** Passado este tempo sem posições (s), o autocarro volta de outro sítio: recomeça sem deslizar por cima do intervalo */
export const LACUNA_MAX_S = 120;
/** Fração do intervalo que se acrescenta à idade para saber quanto atrás do relógio fica o alvo */
export const FATOR_ATRASO = 0.3;
/** O alvo continua além da última posição conhecida, pelo mesmo caminho e à mesma velocidade, no máximo durante isto (s) e depois pára */
export const HORIZONTE_EXTRAPOLAR_S = 12;
/** … e depois abranda com esta constante de tempo (s), avançando no máximo velocidade × isto mais */
export const TRAVAGEM_S = 8;
/** Rapidez da mola que leva o marcador ao alvo (rad/s): maior = segue mais de perto, menor = mais suave */
export const OMEGA = 0.6;
/** O marcador nunca vai mais depressa do que isto vezes a velocidade do troço (nem do que `VEL_MINIMA_TETO_MS`) */
export const TETO_VEL_FATOR = 1.35;
export const VEL_MINIMA_TETO_MS = 5;
/** Se o alvo ficar a mais de 150 m + isto de segundos de viagem à velocidade do troço, o autocarro reapareceu noutro sítio: vai direto para lá */
export const SALTO_MAX_S = 60;
/** Uma posição nova só conta como movimento se o deslocamento passar disto (m): abaixo é ruído do GPS */
const MIN_MOVIMENTO_M = 6;
/** Para o rumo é preciso um troço maior, porque o GPS «treme» uns metros (m) */
const MIN_RUMO_M = 15;
/** Abaixo desta velocidade (m/s) o rumo não se atualiza */
const VEL_RUMO_MS = 2;

const M_POR_GRAU = 111_320;
const rad = Math.PI / 180;

/** Distância aproximada (m) entre dois pontos próximos */
export function distanciaM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (b.lat - a.lat) * M_POR_GRAU;
  const dx = (b.lon - a.lon) * M_POR_GRAU * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.hypot(dx, dy);
}

/** Rumo (graus, 0 = norte) de a para b */
export function rumoEntre(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (b.lat - a.lat) * M_POR_GRAU;
  const dx = (b.lon - a.lon) * M_POR_GRAU * Math.cos(((a.lat + b.lat) / 2) * rad);
  return (Math.atan2(dx, dy) / rad + 360) % 360;
}

export function novoTrajeto(op: OperadorTrajeto, fix: Fix, idade: number): Trajeto {
  return { fixes: [fix], intervalo: INTERVALO_INICIAL[op], idade: Math.min(60, Math.max(0, idade)), rejeitadas: 0 };
}

/**
 * Junta uma posição medida ao histórico. Devolve `true` se entrou (a posição é nova e plausível), `false` se foi ignorada
 * (repetida, mais antiga ou erro de GPS).
 */
export function juntarFix(tr: Trajeto, fix: Fix, idade: number, op: OperadorTrajeto): boolean {
  const ult = tr.fixes[tr.fixes.length - 1];
  if (fix.t <= ult.t) return false;
  const dt = fix.t - ult.t;
  if (dt > LACUNA_MAX_S) {
    tr.fixes = [fix];
    tr.rejeitadas = 0;
    tr.intervalo = INTERVALO_INICIAL[op];
    tr.idade = Math.min(60, Math.max(0, idade));
    return true;
  }
  const v = distanciaM(ult, fix) / dt;
  // Erro de GPS evidente: espera-se pela posição seguinte (duas seguidas já contam, porque o autocarro pode ter mesmo ido para lá)
  if (v > VEL_MAX_MS && tr.rejeitadas < 2) { tr.rejeitadas++; return false; }
  tr.rejeitadas = 0;
  tr.fixes.push(fix);
  if (tr.fixes.length > MAX_FIXES) tr.fixes.shift();
  tr.intervalo = Math.min(60, Math.max(8, 0.7 * tr.intervalo + 0.3 * dt));
  tr.idade = Math.min(60, Math.max(0, 0.7 * tr.idade + 0.3 * idade));
  return true;
}

/** Quanto tempo atrás do relógio do servidor fica o alvo (s) */
export function atrasoIdeal(tr: Trajeto): number {
  return tr.idade + FATOR_ATRASO * tr.intervalo;
}

export interface PosicaoModelo { lat: number; lon: number; /** graus; ausente enquanto não há movimento que o diga */ rumo?: number; /** velocidade em m/s */ vel: number }

/** Rumo do último troço com movimento verdadeiro até à posição `ate` (para continuar a apontar para o mesmo lado quando pára) */
function rumoAte(f: Fix[], ate: number): number | undefined {
  for (let i = ate; i >= 1; i--) {
    if (distanciaM(f[i - 1], f[i]) >= MIN_RUMO_M) return rumoEntre(f[i - 1], f[i]);
  }
  return undefined;
}

/** Onde o autocarro esteve na hora de medição `P`: no caminho reto entre duas posições medidas (antes da primeira ou depois da última fica nelas) */
export function posicaoNoTempo(tr: Trajeto, P: number): PosicaoModelo {
  const f = tr.fixes;
  if (f.length === 1) return { lat: f[0].lat, lon: f[0].lon, vel: 0 };
  if (P <= f[0].t) return { lat: f[0].lat, lon: f[0].lon, rumo: rumoAte(f, 1), vel: 0 };
  for (let i = 1; i < f.length; i++) {
    if (P <= f[i].t) {
      const a = f[i - 1], b = f[i];
      const k = (P - a.t) / (b.t - a.t);
      const d = distanciaM(a, b);
      return {
        lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k,
        rumo: d >= MIN_RUMO_M ? rumoEntre(a, b) : rumoAte(f, i),
        vel: d >= MIN_MOVIMENTO_M ? d / (b.t - a.t) : 0,
      };
    }
  }
  const ult = f[f.length - 1];
  return { lat: ult.lat, lon: ult.lon, rumo: rumoAte(f, f.length - 1), vel: 0 };
}

/** A maior velocidade (m/s) entre as posições guardadas */
export function velocidadeMaxima(tr: Trajeto): number {
  let m = 0;
  for (let i = 1; i < tr.fixes.length; i++) m = Math.max(m, distanciaM(tr.fixes[i - 1], tr.fixes[i]) / (tr.fixes[i].t - tr.fixes[i - 1].t));
  return m;
}

/** O alvo no relógio do servidor `agora`: o caminho medido até à última posição e, depois dela, a continuação pelo mesmo caminho */
export function alvoNoRelogio(tr: Trajeto, agora: number): PosicaoModelo {
  const f = tr.fixes;
  const P = agora - atrasoIdeal(tr);
  const ult = f[f.length - 1];
  if (f.length === 1 || P <= ult.t) return posicaoNoTempo(tr, P);
  const pen = f[f.length - 2];
  const d = distanciaM(pen, ult);
  if (d < MIN_MOVIMENTO_M) return { lat: ult.lat, lon: ult.lon, rumo: rumoAte(f, f.length - 1), vel: 0 };
  const v = d / (ult.t - pen.t);
  const excesso = P - ult.t;
  // Durante `HORIZONTE_EXTRAPOLAR_S` segundos continua à mesma velocidade; depois abranda (não pára de repente) e fica
  const alem = Math.max(0, excesso - HORIZONTE_EXTRAPOLAR_S);
  const andou = v * (Math.min(excesso, HORIZONTE_EXTRAPOLAR_S) + TRAVAGEM_S * (1 - Math.exp(-alem / TRAVAGEM_S)));
  const k = andou / d;
  return {
    lat: ult.lat + (ult.lat - pen.lat) * k, lon: ult.lon + (ult.lon - pen.lon) * k,
    rumo: d >= MIN_RUMO_M ? rumoEntre(pen, ult) : rumoAte(f, f.length - 1), vel: v * Math.exp(-alem / TRAVAGEM_S),
  };
}

/** Rumo mais curto entre dois ângulos, para o marcador rodar pelo lado certo (devolve o novo ângulo acumulado) */
export function rodarPeloCaminhoMaisCurto(atual: number, novo: number): number {
  let d = ((novo - atual) % 360 + 540) % 360 - 180;
  if (d === -180) d = 180;
  return atual + d;
}

/** Relógio do servidor estimado: `agora` do servidor (inteiro) e o `performance.now()` em que a resposta chegou */
export interface Relogio { servidorS: number; localMs: number }
export function agoraDoServidor(r: Relogio, localMs: number): number {
  return r.servidorS + (localMs - r.localMs) / 1000;
}
/** Junta uma resposta nova ao relógio: o `agora` do servidor vem em segundos inteiros (±0,5 s), por isso suaviza-se */
export function atualizarRelogio(r: Relogio | null, servidorS: number, localMs: number): Relogio {
  const medido = servidorS + 0.5;
  if (!r) return { servidorS: medido, localMs };
  const previsto = agoraDoServidor(r, localMs);
  // Se a diferença for grande (o telemóvel esteve adormecido) adota-se o novo; senão, média suave
  const erro = medido - previsto;
  if (Math.abs(erro) > 5) return { servidorS: medido, localMs };
  return { servidorS: previsto + erro * 0.25, localMs };
}

/** Passo máximo (s) com que se integra o movimento do marcador */
const PASSO_MAX_S = 0.05;

/**
 * Um autocarro no mapa: recebe as posições medidas e diz onde mostrá-lo em cada instante (relógio do servidor, em segundos).
 * É isto que o mapa e os testes usam, para o teste ser sobre o comportamento verdadeiro.
 */
export class MovimentoVeiculo {
  private tr: Trajeto | null = null;
  // Posição (x, y em metros a partir da primeira posição) e velocidade do marcador
  private lat0 = 0; private lon0 = 0; private cos0 = 1;
  private x = 0; private y = 0; private vx = 0; private vy = 0;
  /** Relógio do servidor até ao qual o marcador já foi avançado */
  private W = 0;
  /** Direção (vetor unitário) do último troço com movimento: o marcador não recua contra ela */
  private dirX = 0; private dirY = 0; private temDir = false;
  private rumoAtual: number | undefined;

  constructor(private readonly op: OperadorTrajeto) {}

  private paraMetros(p: { lat: number; lon: number }): { x: number; y: number } {
    return { x: (p.lon - this.lon0) * M_POR_GRAU * this.cos0, y: (p.lat - this.lat0) * M_POR_GRAU };
  }

  private paraGraus(x: number, y: number): { lat: number; lon: number } {
    return { lat: this.lat0 + y / M_POR_GRAU, lon: this.lon0 + x / (M_POR_GRAU * this.cos0) };
  }

  private irPara(p: { lat: number; lon: number }): void {
    const m = this.paraMetros(p);
    this.x = m.x; this.y = m.y; this.vx = 0; this.vy = 0;
  }

  private atualizarDirecao(): void {
    const f = this.tr!.fixes;
    for (let i = f.length - 1; i >= 1; i--) {
      const d = distanciaM(f[i - 1], f[i]);
      if (d >= MIN_RUMO_M) {
        const a = this.paraMetros(f[i - 1]), b = this.paraMetros(f[i]);
        this.dirX = (b.x - a.x) / d; this.dirY = (b.y - a.y) / d; this.temDir = true;
        return;
      }
    }
  }

  /** Avança o marcador até ao relógio `agora` */
  private avancar(agora: number): void {
    const tr = this.tr;
    if (!tr) return;
    const dt = agora - this.W;
    if (!(dt > 0)) return; // o relógio nunca anda para trás
    const n = Math.max(1, Math.ceil(dt / PASSO_MAX_S));
    const h = dt / n;
    let W = this.W;
    const vMaxTroco = velocidadeMaxima(tr);
    for (let i = 0; i < n; i++) {
      const alvo = alvoNoRelogio(tr, W);
      const T = this.paraMetros(alvo);
      if (Math.hypot(T.x - this.x, T.y - this.y) > 150 + SALTO_MAX_S * Math.max(VEL_MINIMA_TETO_MS, vMaxTroco)) { this.x = T.x; this.y = T.y; this.vx = 0; this.vy = 0; W += h; continue; }
      // mola amortecida criticamente: a = ω²(alvo − pos) − 2ω·v
      this.vx += (OMEGA * OMEGA * (T.x - this.x) - 2 * OMEGA * this.vx) * h;
      this.vy += (OMEGA * OMEGA * (T.y - this.y) - 2 * OMEGA * this.vy) * h;
      // nunca recua contra o sentido em que o autocarro vai
      if (this.temDir) {
        const along = this.vx * this.dirX + this.vy * this.dirY;
        if (along < 0) { this.vx -= along * this.dirX; this.vy -= along * this.dirY; }
      }
      // nunca mais depressa do que 1,35× a velocidade do troço
      const teto = TETO_VEL_FATOR * Math.max(VEL_MINIMA_TETO_MS, alvo.vel);
      const vm = Math.hypot(this.vx, this.vy);
      if (vm > teto) { this.vx *= teto / vm; this.vy *= teto / vm; }
      this.x += this.vx * h; this.y += this.vy * h;
      W += h;
    }
    this.W = agora;
    if (Math.hypot(this.vx, this.vy) >= VEL_RUMO_MS) this.rumoAtual = (Math.atan2(this.vx, this.vy) / rad + 360) % 360;
  }

  /**
   * `agora`: relógio do servidor quando a resposta chegou; a idade da posição é `agora - fix.t`.
   * `idadeConhecida`: para uma posição anterior que chega junto com a última, a idade com que chegou é a da última (não a de há 15 s).
   */
  receber(fix: Fix, agora: number, idadeConhecida?: number): void {
    const idade = Math.max(0, idadeConhecida ?? agora - fix.t);
    if (!this.tr) {
      this.tr = novoTrajeto(this.op, fix, idade);
      this.lat0 = fix.lat; this.lon0 = fix.lon; this.cos0 = Math.cos(fix.lat * rad);
      this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
      this.W = agora;
      return;
    }
    this.avancar(agora);
    if (!juntarFix(this.tr, fix, idade, this.op)) return;
    if (this.tr.fixes.length === 1) { this.irPara(fix); this.temDir = false; this.rumoAtual = undefined; return; } // recomeço depois de uma lacuna
    this.atualizarDirecao();
  }

  /** Para um autocarro que chega já com duas ou mais posições: começa a mostrá-lo no alvo, em vez de parado na primeira */
  alinhar(agora: number): void {
    const tr = this.tr;
    if (!tr) return;
    const alvo = alvoNoRelogio(tr, agora);
    this.irPara(alvo);
    this.W = agora;
    if (this.temDir) { this.vx = this.dirX * alvo.vel; this.vy = this.dirY * alvo.vel; }
    this.rumoAtual = alvo.rumo;
  }

  tem(): boolean { return this.tr !== null; }

  mostrar(agora: number): PosicaoModelo {
    if (!this.tr) return { lat: NaN, lon: NaN, vel: 0 };
    this.avancar(agora);
    const g = this.paraGraus(this.x, this.y);
    return { lat: g.lat, lon: g.lon, rumo: this.rumoAtual, vel: Math.hypot(this.vx, this.vy) };
  }

  /** Para os testes */
  get trajeto(): Trajeto | null { return this.tr; }
}

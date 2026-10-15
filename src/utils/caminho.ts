// O desenho de um percurso pela estrada (ou pelo carril): lê o que vem dos horários oficiais (shapes), encaixa as paragens
// nele e corta o troço entre duas paragens. Não depende de nada (serve no servidor e na app).
//
// O desenho viaja em polilinha codificada (a mesma do Google, com 6 casas decimais ≈ 0,1 m): é o que a base de dados
// guarda (ver construir_dados.py, no repositório dos dados) e o que o servidor envia à app.
// Uma "posição" no desenho é um número: a parte inteira é o troço (entre pontos[i] e pontos[i + 1]) e a decimal, o ponto
// dentro desse troço (0 = no primeiro, 1 = no seguinte).

import type { Ponto } from './geoPercurso';

export const PRECISAO_DESENHO = 6;

/** Descodifica uma polilinha codificada. Texto inválido ou cortado devolve só os pontos que se conseguiram ler. */
export function descodificarPolilinha(texto: string, precisao = PRECISAO_DESENHO): Ponto[] {
  const fator = 10 ** precisao;
  const pontos: Ponto[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  while (i < texto.length) {
    const delta: number[] = [0, 0];
    for (let eixo = 0; eixo < 2; eixo++) {
      let resultado = 0;
      let deslocamento = 0;
      let b: number;
      do {
        if (i >= texto.length) return pontos;
        b = texto.charCodeAt(i++) - 63;
        resultado += (b & 0x1f) * 2 ** deslocamento; // sem "<<": os números com 6 casas passam dos 31 bits
        deslocamento += 5;
      } while (b >= 0x20);
      delta[eixo] = resultado % 2 === 1 ? -Math.floor((resultado + 1) / 2) : resultado / 2;
    }
    lat += delta[0];
    lon += delta[1];
    pontos.push({ lat: lat / fator, lon: lon / fator });
  }
  return pontos;
}

/** Codifica pontos numa polilinha (o inverso de descodificarPolilinha) */
export function codificarPolilinha(pontos: Ponto[], precisao = PRECISAO_DESENHO): string {
  const fator = 10 ** precisao;
  let saida = '';
  let plat = 0;
  let plon = 0;
  const escrever = (valor: number) => {
    let v = valor < 0 ? -2 * valor - 1 : 2 * valor;
    while (v >= 0x20) {
      saida += String.fromCharCode(((v % 32) | 0x20) + 63);
      v = Math.floor(v / 32);
    }
    saida += String.fromCharCode(v + 63);
  };
  for (const p of pontos) {
    const la = Math.round(p.lat * fator);
    const lo = Math.round(p.lon * fator);
    escrever(la - plat);
    escrever(lo - plon);
    plat = la;
    plon = lo;
  }
  return saida;
}

// ---------------------------------------------------------------- encaixar as paragens no desenho ----------------------------------------------------------------

export interface EncaixeParagens {
  /** Posição de cada paragem no desenho (não decresce: as paragens vêm pela ordem da viagem) */
  posicoes: number[];
  /** Distância, em metros, de cada paragem ao desenho */
  desviosM: number[];
  /** Metros que foi preciso andar para trás no desenho para manter a ordem das paragens (0 = encaixou na ordem certa) */
  retrocessoM: number;
}

interface Candidato { pos: number; m: number; d: number }

const MAX_CANDIDATOS = 6;
/** Além disto, uma paragem não é candidata a um sítio do desenho (só se não houver nada mais perto) */
const FOLGA_CANDIDATOS_M = 60;
/** Andar para trás no desenho custa isto por metro (as paragens vêm pela ordem da viagem) */
const CUSTO_RETROCESSO = 4;

/**
 * Encaixa as paragens (por ordem) no desenho, de modo a que a ordem se mantenha e a soma dos desvios seja a menor.
 * Escolher só o ponto mais próximo de cada paragem falha nas linhas que passam duas vezes no mesmo sítio (circulares,
 * terminais): o fim da linha ficava encaixado no princípio.
 * Devolve null se o desenho tem menos de 2 pontos ou não há paragens.
 */
export function encaixarParagens(desenho: Ponto[], paragens: Ponto[]): EncaixeParagens | null {
  const n = desenho.length;
  if (n < 2 || !paragens.length) return null;
  const lat0 = desenho[0].lat;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  const ky = 110540;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) { xs[i] = (desenho[i].lon - desenho[0].lon) * kx; ys[i] = (desenho[i].lat - lat0) * ky; }
  // Metros desde o princípio do desenho até cada ponto
  const acum = new Float64Array(n);
  for (let i = 1; i < n; i++) acum[i] = acum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);

  const candidatos: Candidato[][] = [];
  const d2 = new Float64Array(n - 1);
  const us = new Float64Array(n - 1);
  for (const p of paragens) {
    const px = (p.lon - desenho[0].lon) * kx;
    const py = (p.lat - lat0) * ky;
    let melhor = Infinity;
    for (let i = 0; i < n - 1; i++) {
      const dx = xs[i + 1] - xs[i];
      const dy = ys[i + 1] - ys[i];
      const c2 = dx * dx + dy * dy;
      const u = c2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - xs[i]) * dx + (py - ys[i]) * dy) / c2));
      const ex = px - (xs[i] + u * dx);
      const ey = py - (ys[i] + u * dy);
      d2[i] = ex * ex + ey * ey;
      us[i] = u;
      if (d2[i] < melhor) melhor = d2[i];
    }
    const corte = (Math.sqrt(melhor) + FOLGA_CANDIDATOS_M) ** 2;
    const locais: Candidato[] = [];
    for (let i = 0; i < n - 1; i++) {
      if (d2[i] > corte) continue;
      // Mínimo local: os troços vizinhos não estão mais perto (cada passagem pelo sítio dá um só candidato)
      if ((i > 0 && d2[i - 1] < d2[i]) || (i < n - 2 && d2[i + 1] < d2[i])) continue;
      locais.push({ pos: i + us[i], m: acum[i] + us[i] * (acum[i + 1] - acum[i]), d: Math.sqrt(d2[i]) });
    }
    locais.sort((a, b) => a.d - b.d);
    const escolhidos = locais.slice(0, MAX_CANDIDATOS);
    // O melhor global é sempre candidato (mesmo que o mínimo local acima o tenha empatado fora)
    if (!escolhidos.length) {
      let iMelhor = 0;
      for (let i = 1; i < n - 1; i++) if (d2[i] < d2[iMelhor]) iMelhor = i;
      escolhidos.push({ pos: iMelhor + us[iMelhor], m: acum[iMelhor] + us[iMelhor] * (acum[iMelhor + 1] - acum[iMelhor]), d: Math.sqrt(d2[iMelhor]) });
    }
    candidatos.push(escolhidos);
  }

  // Viterbi: custo = soma dos desvios, mais um castigo por cada metro que se recua no desenho
  const custo: number[][] = [];
  const anterior: number[][] = [];
  custo.push(candidatos[0].map((c) => c.d));
  anterior.push(candidatos[0].map(() => -1));
  for (let s = 1; s < candidatos.length; s++) {
    const cs: number[] = [];
    const as: number[] = [];
    for (const c of candidatos[s]) {
      let melhorCusto = Infinity;
      let melhorK = -1;
      candidatos[s - 1].forEach((a, k) => {
        const total = custo[s - 1][k] + c.d + (c.m >= a.m ? 0 : CUSTO_RETROCESSO * (a.m - c.m));
        if (total < melhorCusto) { melhorCusto = total; melhorK = k; }
      });
      cs.push(melhorCusto);
      as.push(melhorK);
    }
    custo.push(cs);
    anterior.push(as);
  }
  const ultimo = custo[custo.length - 1];
  let k = ultimo.indexOf(Math.min(...ultimo));
  const posicoes = new Array<number>(paragens.length);
  const metrosNoDesenho = new Array<number>(paragens.length);
  const desviosM = new Array<number>(paragens.length);
  for (let s = candidatos.length - 1; s >= 0; s--) {
    posicoes[s] = candidatos[s][k].pos;
    metrosNoDesenho[s] = candidatos[s][k].m;
    desviosM[s] = candidatos[s][k].d;
    k = anterior[s][k];
  }
  // Quem ficou ligeiramente atrás da paragem anterior (paragens dos dois lados da estrada) passa a ficar no mesmo sítio
  let retrocessoM = 0;
  for (let s = 1; s < posicoes.length; s++) {
    if (metrosNoDesenho[s] < metrosNoDesenho[s - 1]) {
      retrocessoM += metrosNoDesenho[s - 1] - metrosNoDesenho[s];
      metrosNoDesenho[s] = metrosNoDesenho[s - 1];
      posicoes[s] = posicoes[s - 1];
    }
  }
  return { posicoes, desviosM, retrocessoM };
}

/** O ponto do desenho numa posição (parte inteira = troço, decimal = ponto dentro do troço) */
export function pontoNaPosicao(desenho: Ponto[], pos: number): Ponto {
  const n = desenho.length;
  if (pos <= 0) return desenho[0];
  if (pos >= n - 1) return desenho[n - 1];
  const i = Math.floor(pos);
  const u = pos - i;
  const a = desenho[i];
  const b = desenho[i + 1];
  return { lat: a.lat + (b.lat - a.lat) * u, lon: a.lon + (b.lon - a.lon) * u };
}

/** O troço do desenho entre duas posições (a ≤ b), com os pontos do desenho que ficam pelo meio */
export function fatiarDesenho(desenho: Ponto[], de: number, ate: number): Ponto[] {
  if (desenho.length < 2) return [...desenho];
  const a = Math.max(0, Math.min(de, ate));
  const b = Math.min(desenho.length - 1, Math.max(de, ate));
  const saida: Ponto[] = [pontoNaPosicao(desenho, a)];
  for (let i = Math.floor(a) + 1; i <= Math.floor(b); i++) {
    // Pontos inteiros estritamente entre as duas posições (a posição b inteira entra no fim, uma só vez)
    if (i > a && i < b) saida.push(desenho[i]);
  }
  saida.push(pontoNaPosicao(desenho, b));
  return saida;
}

// ---------------------------------------------------------------- o que a app desenha ----------------------------------------------------------------

/** O desenho só serve para uma paragem se ela estiver encostada a ele (senão o desenho não passa por lá) */
export const DESVIO_MAX_PARAGEM_M = 120;
/** E só serve para uma viagem se quase todas as paragens estiverem encostadas: senão é de outra linha ou está mal feito */
const FRACAO_MINIMA_ENCOSTADA = 0.8;
/** E tem de ir no mesmo sentido das paragens: um desenho ao contrário obrigava a recuar muito */
const RETROCESSO_MAX_M = 250;

/** Encaixe das paragens no desenho, se o desenho serve para estas paragens (null se não serve) */
export function encaixeValido(desenho: Ponto[], paragens: Ponto[]): EncaixeParagens | null {
  const enc = encaixarParagens(desenho, paragens);
  if (!enc) return null;
  const encostadas = enc.desviosM.filter((d) => d <= DESVIO_MAX_PARAGEM_M).length;
  if (encostadas / paragens.length < FRACAO_MINIMA_ENCOSTADA) return null;
  if (enc.retrocessoM > RETROCESSO_MAX_M) return null;
  return enc;
}

/**
 * Encaixe das paragens no desenho, com o desenho ao contrário se for o caso: alguns operadores desenham a viagem no sentido
 * oposto ao das paragens (o desenho vai de Corroios a Cacilhas e a viagem de Cacilhas a Corroios). Devolve o desenho a usar
 * (já invertido, se foi preciso) e o encaixe; null se não serve de nenhuma maneira.
 */
export function encaixarNoDesenho(desenho: Ponto[], paragens: Ponto[]): { desenho: Ponto[]; invertido: boolean; encaixe: EncaixeParagens } | null {
  const direto = encaixeValido(desenho, paragens);
  if (direto) return { desenho, invertido: false, encaixe: direto };
  const ao_contrario = [...desenho].reverse();
  const inverso = encaixeValido(ao_contrario, paragens);
  return inverso ? { desenho: ao_contrario, invertido: true, encaixe: inverso } : null;
}

/**
 * Posição de cada paragem no desenho, para enviar à app: null nas paragens por onde o desenho não passa
 * (nesses troços a app une as paragens em linha reta, em vez de inventar um caminho).
 */
export function cortesDoEncaixe(enc: EncaixeParagens): Array<number | null> {
  return enc.posicoes.map((p, k) => (enc.desviosM[k] <= DESVIO_MAX_PARAGEM_M ? Math.round(p * 1000) / 1000 : null));
}

/**
 * Linha a desenhar entre as paragens `de` e `ate` (posições na lista): em cada par de paragens seguidas, o troço do desenho
 * (a estrada); se alguma das duas não está no desenho, a linha reta entre elas.
 */
export function desenharPorPares(paragens: Ponto[], desenho: Ponto[], cortes: Array<number | null>, de = 0, ate = paragens.length - 1): Ponto[] {
  const saida: Ponto[] = [];
  for (let k = Math.max(0, de); k < Math.min(ate, paragens.length - 1); k++) {
    const a = cortes[k];
    const b = cortes[k + 1];
    const troco = typeof a === 'number' && typeof b === 'number' && b >= a ? fatiarDesenho(desenho, a, b) : [paragens[k], paragens[k + 1]];
    saida.push(...troco);
  }
  return saida;
}

export interface TrocosDoPercurso {
  /** O que já se percorreu (do princípio até à paragem `indice`) */
  passado: Ponto[];
  /** O que falta (da paragem `indice` até ao fim) */
  restante: Ponto[];
  /** Verdadeiro se vem do desenho da estrada; falso se são só as paragens unidas em linha reta */
  pelaEstrada: boolean;
}

/**
 * O que a app desenha para um percurso de linha: com `caminho` e `cortes` (o que o servidor envia), o desenho pela estrada
 * entre as paragens; sem eles (ou se não batem certo com as paragens), as paragens unidas em linha reta, como antes.
 */
export function trocosDoPercurso(paragens: Ponto[], indice: number, caminho?: string, cortes?: Array<number | null>): TrocosDoPercurso {
  const i = indice >= 0 && indice < paragens.length ? indice : 0;
  if (caminho && cortes && cortes.length === paragens.length && cortes.every((c) => c === null || Number.isFinite(c))) {
    const desenho = descodificarPolilinha(caminho);
    if (desenho.length >= 2) {
      return {
        passado: i > 0 ? desenharPorPares(paragens, desenho, cortes, 0, i) : [],
        restante: desenharPorPares(paragens, desenho, cortes, i, paragens.length - 1),
        pelaEstrada: true,
      };
    }
  }
  return { passado: i > 0 ? paragens.slice(0, i + 1) : [], restante: paragens.slice(i), pelaEstrada: false };
}

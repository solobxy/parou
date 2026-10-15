// Posição do utilizador a "deslizar": a cada fotograma do ecrã pede ao filtro onde estamos agora
// (avançada pela velocidade desde a última leitura do GPS) e aproxima o ponto desse sítio com uma curva suave.
// O GPS só dá uma leitura por segundo; assim o ponto no mapa anda de forma contínua, sem saltos nem tremer.
// Quem desenha (o mapa) só tem de se registar com observarPosicaoSuave().

import { filtroGps, Deslizador } from './filtroGps';

export interface QuadroPosicao {
  lat: number;
  lon: number;
  /** incerteza em metros (para o círculo à volta do ponto) */
  precisao: number;
  /** rumo da viagem em graus, só quando se anda a mais de ~7 km/h */
  rumo: number | null;
  /** m/s */
  velocidade: number;
  parado: boolean;
  /** segundos desde a última leitura do GPS que entrou no filtro */
  semLeituras: number;
}

type Ouvinte = (q: QuadroPosicao) => void;

const ouvintes = new Set<Ouvinte>();
const deslizador = new Deslizador();
let raf = 0;
let anterior = 0;
let ultimo: QuadroPosicao | null = null;

const M_POR_GRAU = 111_320;

function mudou(a: QuadroPosicao, b: QuadroPosicao): boolean {
  const dy = (b.lat - a.lat) * M_POR_GRAU;
  const dx = (b.lon - a.lon) * M_POR_GRAU * Math.cos((a.lat * Math.PI) / 180);
  if (dx * dx + dy * dy > 0.03 * 0.03) return true; // 3 cm
  if (Math.abs(a.precisao - b.precisao) > 0.5) return true;
  if (Math.floor(a.semLeituras) !== Math.floor(b.semLeituras)) return true;
  if ((a.rumo === null) !== (b.rumo === null)) return true;
  if (a.rumo !== null && b.rumo !== null && Math.abs(a.rumo - b.rumo) > 0.5) return true;
  return false;
}

function quadro(ts: number) {
  raf = requestAnimationFrame(quadro);
  if (ouvintes.size === 0) { parar(); return; }
  if (typeof document !== 'undefined' && document.hidden) { anterior = 0; return; }
  const est = filtroGps.estimarEm(Date.now());
  if (!est) {
    if (deslizador.iniciado) { deslizador.reiniciar(); ultimo = null; }
    anterior = ts;
    return;
  }
  const dt = anterior ? (ts - anterior) / 1000 : 1 / 60;
  anterior = ts;
  deslizador.passo(dt, est);
  const q: QuadroPosicao = { lat: deslizador.lat, lon: deslizador.lon, precisao: est.precisao, rumo: deslizador.rumo, velocidade: est.velocidade, parado: est.parado, semLeituras: est.semLeituras };
  if (ultimo && !mudou(ultimo, q)) return;
  ultimo = q;
  ouvintes.forEach((f) => { try { f(q); } catch {} });
}

function arrancar() {
  if (raf || typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') return;
  anterior = 0;
  raf = requestAnimationFrame(quadro);
}

function parar() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/** Recebe a posição suavizada a cada fotograma em que ela muda. Devolve a função para deixar de ouvir. */
export function observarPosicaoSuave(f: Ouvinte): () => void {
  ouvintes.add(f);
  if (ultimo) { try { f(ultimo); } catch {} }
  arrancar();
  return () => {
    ouvintes.delete(f);
    if (ouvintes.size === 0) parar();
  };
}

/** Há uma posição do GPS a ser seguida (a que desenha o ponto no mapa) */
export function posicaoSuaveAtiva(): boolean {
  return filtroGps.iniciado;
}

/** Posição suavizada mais recente, ou null */
export function posicaoSuaveAtual(): QuadroPosicao | null {
  return ultimo;
}

/** Recomeça do zero (posição escolhida à mão, localização desligada) */
export function reiniciarPosicaoSuave() {
  filtroGps.reiniciar();
  deslizador.reiniciar();
  ultimo = null;
}

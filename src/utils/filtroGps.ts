// Filtro de posição do GPS (sem dependências, para se poder testar sozinho).
//
// O que faz, por esta ordem, a cada leitura que o telemóvel dá:
//  1. Acerta o relógio: a leitura chega com atraso (e o relógio do GPS pode não bater com o da página).
//     O atraso mínimo visto serve de referência, e o excesso é tirado à confiança da leitura.
//  2. Ignora o que não presta: leituras repetidas, muito antigas ou "por rede" (centenas de metros)
//     quando já se tem uma posição boa.
//  3. Filtro de Kalman de velocidade constante (posição + velocidade em cada eixo, em metros):
//     a posição prevista pelo movimento é corrigida por cada leitura, pesada pela precisão que o telemóvel diz ter.
//     Como a velocidade faz parte do estado, o ruído é alisado sem atraso (o ponto não fica para trás no autocarro).
//  4. Usa também a velocidade e o rumo medidos pelo GPS (efeito Doppler), que são muito mais certos do que
//     a diferença entre duas posições.
//  5. Leituras muito fora do esperado pesam menos (inflação do ruído); se várias seguidas dizem o mesmo
//     sítio novo, é porque a posição mudou mesmo e recomeça-se aí.
//  6. Parado (paragem, semáforo): a velocidade fica a zero e o ponto praticamente não se mexe,
//     em vez de andar às voltas à medida que o erro do GPS varia.
//  7. estimarEm(): onde estamos *agora* (avança a posição pela velocidade desde a última leitura),
//     para o ponto deslizar sem saltos e sem o atraso do GPS.

const M_POR_GRAU = 111_320;
const RAD = Math.PI / 180;

export interface LeituraGps {
  lat: number;
  lon: number;
  /** raio de confiança que o telemóvel diz ter, em metros */
  precisao: number;
  /** instante da leitura (ms, relógio do GPS) */
  t: number;
  /** instante em que a página recebeu a leitura (ms); por omissão, agora */
  chegada?: number;
  /** velocidade em m/s medida pelo GPS (efeito Doppler), se o telemóvel a der */
  velocidade?: number | null;
  /** rumo em graus a partir do norte medido pelo GPS, se o telemóvel o der */
  rumo?: number | null;
}

export interface EstimativaGps {
  lat: number;
  lon: number;
  /** incerteza estimada em metros (o círculo à volta do ponto) */
  precisao: number;
  /** m/s */
  velocidade: number;
  /** componentes da velocidade (m/s): leste e norte */
  ve: number;
  vn: number;
  /** graus a partir do norte; só quando há movimento claro */
  rumo: number | null;
  parado: boolean;
  /** instante a que a estimativa se refere (ms, relógio do GPS) */
  t: number;
}

/** Um eixo: posição e velocidade (metros, m/s) e a sua covariância. */
class Eixo {
  p = 0;
  v = 0;
  Ppp = 0;
  Ppv = 0;
  Pvv = 0;

  prever(dt: number, sa: number) {
    const dt2 = dt * dt;
    const q = sa * sa;
    const Ppp = this.Ppp + 2 * dt * this.Ppv + dt2 * this.Pvv + q * dt2 * dt2 / 4;
    const Ppv = this.Ppv + dt * this.Pvv + q * dt2 * dt / 2;
    const Pvv = this.Pvv + q * dt2;
    this.p += this.v * dt;
    this.Ppp = Ppp;
    this.Ppv = Ppv;
    this.Pvv = Pvv;
  }

  corrigirPosicao(z: number, R: number) {
    const S = this.Ppp + R;
    const k0 = this.Ppp / S;
    const k1 = this.Ppv / S;
    const y = z - this.p;
    this.p += k0 * y;
    this.v += k1 * y;
    const Ppp = (1 - k0) * this.Ppp;
    const Ppv = (1 - k0) * this.Ppv;
    const Pvv = this.Pvv - k1 * this.Ppv;
    this.Ppp = Ppp;
    this.Ppv = Ppv;
    this.Pvv = Math.max(Pvv, 1e-4);
  }

  corrigirVelocidade(zv: number, R: number) {
    const S = this.Pvv + R;
    const k0 = this.Ppv / S;
    const k1 = this.Pvv / S;
    const y = zv - this.v;
    this.p += k0 * y;
    this.v += k1 * y;
    const Ppp = this.Ppp - k0 * this.Ppv;
    const Ppv = this.Ppv - k0 * this.Pvv;
    const Pvv = (1 - k1) * this.Pvv;
    this.Ppp = Math.max(Ppp, 1e-4);
    this.Ppv = Ppv;
    this.Pvv = Math.max(Pvv, 1e-4);
  }
}

const norm360 = (g: number) => ((g % 360) + 360) % 360;

export class FiltroGps {
  /** Afinações (a simulação em auditoria/gps-sim.mjs serve para as ajustar) */
  ajustes = { saMin: 1.3, saMax: 6, fatorR: 1.25, minAcc: 5, nisAlfa: 0.6, nisBase: 1.2, saindoD2: 3, saindoN: 2, capR: 3000, nisTeto: 9.21, expR: 4, fimRejeitar: 3 };
  private ini = false;
  private lat0 = 0;
  private lon0 = 0;
  private cosLat = 1;
  private x = new Eixo();
  private y = new Eixo();
  /** instante do estado (ms, relógio do GPS) */
  private t = 0;
  private parado = false;
  private contParado = 0;
  private contMov = 0;
  private surpresas = 0;
  private ignoradas = 0;
  private nis = 2;
  private accMedia = 15;
  private desfases: number[] = [];
  private desfaseAtual = 0;
  private ultimaBruta: { x: number; y: number } | null = null;
  private ultimaInov: { x: number; y: number } | null = null;
  private ultimoRumo: number | null = null;

  get iniciado(): boolean {
    return this.ini;
  }

  reiniciar() {
    this.ini = false;
    this.parado = false;
    this.contParado = 0;
    this.contMov = 0;
    this.surpresas = 0;
    this.ignoradas = 0;
    this.nis = 2;
    this.desfases = [];
    this.ultimaBruta = null;
    this.ultimaInov = null;
    this.ultimoRumo = null;
  }

  private paraMetros(lat: number, lon: number): { x: number; y: number } {
    return { x: (lon - this.lon0) * M_POR_GRAU * this.cosLat, y: (lat - this.lat0) * M_POR_GRAU };
  }

  private daqui(x: number, y: number): { lat: number; lon: number } {
    return { lat: this.lat0 + y / M_POR_GRAU, lon: this.lon0 + x / (M_POR_GRAU * this.cosLat) };
  }

  private velocidadeDoppler(l: LeituraGps): { ve: number; vn: number; R: number; v: number } | null {
    const v = l.velocidade;
    if (v === null || v === undefined || !Number.isFinite(v) || v < 0) return null;
    if (v < 0.5) return { ve: 0, vn: 0, R: 0.4 * 0.4, v };
    const h = l.rumo;
    if (h === null || h === undefined || !Number.isFinite(h)) return null;
    const r = 0.7 + 0.12 * v;
    return { ve: v * Math.sin(h * RAD), vn: v * Math.cos(h * RAD), R: r * r, v };
  }

  private iniciarEm(l: LeituraGps, acc: number) {
    this.lat0 = l.lat;
    this.lon0 = l.lon;
    this.cosLat = Math.max(0.2, Math.cos(l.lat * RAD));
    const R = Math.pow(Math.max(acc, 5) * 1.25, 2);
    for (const e of [this.x, this.y]) {
      e.p = 0; e.v = 0; e.Ppp = R; e.Ppv = 0; e.Pvv = 25;
    }
    const d = this.velocidadeDoppler(l);
    if (d) {
      this.x.v = d.ve; this.y.v = d.vn;
      this.x.Pvv = this.y.Pvv = d.R;
    }
    this.t = l.t;
    this.ini = true;
    this.parado = false;
    this.contParado = 0;
    this.contMov = 0;
    this.surpresas = 0;
    this.ignoradas = 0;
    this.ultimaBruta = { x: 0, y: 0 };
    this.accMedia = acc;
  }

  /**
   * Junta uma leitura. Devolve a estimativa à hora da leitura, ou null se a leitura foi posta de parte
   * (repetida, antiga ou má).
   */
  atualizar(l: LeituraGps, agora: number = Date.now()): EstimativaGps | null {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon) || !Number.isFinite(l.t)) return null;
    const acc = Number.isFinite(l.precisao) && l.precisao > 0 ? l.precisao : 30;
    const chegada = l.chegada ?? agora;

    // 1. Relógio e atraso
    const desf = chegada - l.t;
    this.desfases.push(desf);
    if (this.desfases.length > 20) this.desfases.shift();
    const minDesf = Math.min(...this.desfases);
    this.desfaseAtual = this.desfases.length >= 3 ? minDesf : desf;
    const excesso = this.desfases.length >= 3 ? Math.max(0, desf - minDesf) : Math.max(0, desf);
    let accEf = acc;
    if (excesso > 3000) accEf = Math.hypot(acc, (excesso / 1000 - 1) * 8); // leitura velha: pode já ter andado

    if (!this.ini) {
      this.iniciarEm(l, accEf);
      return this.estimativa(this.t, 0);
    }

    // 2. O que se põe de parte
    if (l.t <= this.t) return null; // repetida ou fora de ordem
    if (excesso > 20_000) return null;
    const dtSeg = (l.t - this.t) / 1000;
    const sigmaAtual = Math.sqrt(this.x.Ppp + this.x.Pvv * dtSeg * dtSeg);
    // Leitura "por rede" (Wi-Fi/antenas) com o GPS bom: ignora, mas não para sempre (túnel longo)
    if (accEf > 120 && sigmaAtual < 50 && dtSeg < 60 && this.ignoradas < 10) {
      this.ignoradas++;
      return null;
    }
    this.ignoradas = 0;
    if (dtSeg > 60) {
      this.iniciarEm(l, accEf);
      return this.estimativa(this.t, 0);
    }

    // 3. Previsão e correção
    const z = this.paraMetros(l.lat, l.lon);
    const sa = this.parado ? 0.08 : Math.min(this.ajustes.saMax, Math.max(this.ajustes.saMin, this.ajustes.saMin * Math.sqrt(Math.max(1, this.nis / this.ajustes.nisBase))));
    this.x.prever(dtSeg, sa);
    this.y.prever(dtSeg, sa);

    let R = Math.pow(Math.max(accEf, this.ajustes.minAcc) * this.ajustes.fatorR, 2);
    const yx = z.x - this.x.p;
    const yy = z.y - this.y.p;
    const d2 = (yx * yx + yy * yy) / (this.x.Ppp + R);
    this.nis = this.ajustes.nisAlfa * this.nis + (1 - this.ajustes.nisAlfa) * Math.min(d2, this.ajustes.nisTeto);

    // 5. Leitura fora do esperado: pesa menos. Se várias seguidas se afastam do previsto sempre do mesmo modo
    //    (um desvio estável), a posição mudou mesmo (ou o filtro perdeu-se) e recomeça-se na leitura.
    if (d2 > 9.21) {
      const inov = { x: yx, y: yy };
      const igual = this.ultimaInov ? Math.hypot(inov.x - this.ultimaInov.x, inov.y - this.ultimaInov.y) <= Math.max(25, 2 * accEf) : false;
      this.surpresas = igual ? this.surpresas + 1 : 1;
      this.ultimaInov = inov;
      if (this.surpresas >= 5) {
        this.reposicionar(z, accEf, this.velocidadeDoppler(l));
        this.ultimaBruta = z;
        return this.estimativa(l.t, 0);
      }
      // Em andamento, uma leitura muito fora (reflexo do sinal) quase não conta; parado conta mais, porque
      // o desvio pode ser o arranque do autocarro
      R *= this.parado || this.surpresas >= this.ajustes.fimRejeitar ? Math.min(6, d2 / 9.21) : Math.min(this.ajustes.capR, Math.pow(d2 / 9.21, this.ajustes.expR));
    } else {
      this.surpresas = 0;
      this.ultimaInov = null;
    }
    this.ultimaBruta = z;

    this.x.corrigirPosicao(z.x, R);
    this.y.corrigirPosicao(z.y, R);

    // 4. Velocidade medida pelo GPS
    const dop = accEf < 100 ? this.velocidadeDoppler(l) : null;
    if (dop) {
      this.x.corrigirVelocidade(dop.ve, dop.R);
      this.y.corrigirVelocidade(dop.vn, dop.R);
    }

    // 6. Parado / em movimento
    const velEst = Math.hypot(this.x.v, this.y.v);
    const candidatoParado = dop ? dop.v < 0.45 : (velEst < 0.5 && d2 < 4);
    // Sem velocidade do GPS, parado a velocidade fica a zero e não serve de pista: sai-se quando as leituras
    // se afastam do ponto parado 3 vezes seguidas
    const emMovimento = dop ? dop.v > 1.0 : (this.parado ? d2 > this.ajustes.saindoD2 : velEst > 1.2);
    this.contParado = candidatoParado ? this.contParado + 1 : 0;
    this.contMov = emMovimento ? this.contMov + 1 : 0;
    if (!this.parado && this.contParado >= 3) {
      this.parado = true;
    } else if (this.parado && this.contMov >= (dop ? 2 : this.ajustes.saindoN)) {
      this.parado = false;
      this.x.Pvv = this.y.Pvv = 4;
    }
    if (this.parado) {
      this.x.v = this.y.v = 0;
      this.x.Pvv = this.y.Pvv = 0.0025;
      this.x.Ppv = this.y.Ppv = 0;
    }

    this.accMedia = 0.7 * this.accMedia + 0.3 * accEf;
    this.t = l.t;
    return this.estimativa(this.t, 0);
  }

  private reposicionar(z: { x: number; y: number }, acc: number, d: { ve: number; vn: number; R: number } | null) {
    const R = Math.pow(Math.max(acc, 5) * 1.25, 2);
    this.x.p = z.x; this.y.p = z.y;
    this.x.Ppp = this.y.Ppp = R;
    this.x.Ppv = this.y.Ppv = 0;
    this.x.v = d ? d.ve : 0; this.y.v = d ? d.vn : 0;
    this.x.Pvv = this.y.Pvv = d ? d.R : 25;
    this.parado = false;
    this.contParado = 0;
    this.contMov = 0;
    this.surpresas = 0;
  }

  private estimativa(t: number, dt: number, semLeituras: number = dt): EstimativaGps {
    const mover = this.parado ? 0 : dt;
    const x = this.x.p + this.x.v * mover;
    const y = this.y.p + this.y.v * mover;
    const { lat, lon } = this.daqui(x, y);
    const vel = Math.hypot(this.x.v, this.y.v);
    // A incerteza cresce enquanto não chegam leituras novas
    const sigma = Math.sqrt(this.x.Ppp + this.x.Pvv * semLeituras * semLeituras + 0.25 * semLeituras * semLeituras);
    const precisao = Math.max(3, sigma * 1.5, 0.6 * this.accMedia);
    let rumo: number | null = null;
    if (!this.parado && vel >= 2.0) {
      rumo = norm360(Math.atan2(this.x.v, this.y.v) / RAD);
      this.ultimoRumo = rumo;
    }
    return { lat, lon, precisao, velocidade: this.parado ? 0 : vel, ve: this.parado ? 0 : this.x.v, vn: this.parado ? 0 : this.y.v, rumo, parado: this.parado, t: t + dt * 1000 };
  }

  /**
   * Onde estamos neste instante (relógio local, ms): avança a posição pela velocidade desde a última leitura,
   * com limites (sem leituras novas, depois de uns segundos o ponto abranda e pára em vez de inventar).
   */
  estimarEm(agoraLocal: number): EstimativaGps | null {
    if (!this.ini) return null;
    const tGps = agoraLocal - this.desfaseAtual;
    const bruto = Math.max(0, (tGps - this.t) / 1000);
    // Até 4 s avança à velocidade da última leitura; daí a 12 s avança a metade (travar/curvar sem sinal); depois pára
    const dt = bruto <= 4 ? bruto : 4 + 0.5 * (Math.min(bruto, 12) - 4);
    return this.estimativa(this.t, dt, bruto);
  }

  /** Estimativa à hora da última leitura (sem avançar) */
  atual(): EstimativaGps | null {
    return this.ini ? this.estimativa(this.t, 0) : null;
  }
}

/** Um só filtro para a app inteira (as várias páginas que pedem a posição partilham-no) */
export const filtroGps = new FiltroGps();

/**
 * Faz o ponto deslizar no ecrã: avança à velocidade estimada e aproxima-se do alvo com uma curva suave,
 * por isso uma correção do filtro nunca se vê como um salto (só como um acerto gradual).
 */
export class Deslizador {
  lat = 0;
  lon = 0;
  rumo: number | null = null;
  private ini = false;

  reiniciar() {
    this.ini = false;
    this.rumo = null;
  }

  get iniciado(): boolean {
    return this.ini;
  }

  /** dtSeg: tempo desde o fotograma anterior; alvo: estimativa para agora */
  passo(dtSeg: number, alvo: EstimativaGps) {
    const dt = Math.min(0.1, Math.max(0, dtSeg));
    const cosLat = Math.max(0.2, Math.cos(alvo.lat * RAD));
    if (!this.ini || Math.hypot((alvo.lat - this.lat) * M_POR_GRAU, (alvo.lon - this.lon) * M_POR_GRAU * cosLat) > 120) {
      this.lat = alvo.lat;
      this.lon = alvo.lon;
      this.rumo = alvo.rumo;
      this.ini = true;
      return;
    }
    // O avanço à velocidade do alvo evita o atraso; o resto corrige o erro devagar (constante de tempo ~0,45 s)
    this.lat += (alvo.vn * dt) / M_POR_GRAU;
    this.lon += (alvo.ve * dt) / (M_POR_GRAU * cosLat);
    const a = 1 - Math.exp(-dt / 0.45);
    // O alvo já avançou pela velocidade desde a última leitura: compara com o alvo menos esse avanço deste fotograma
    this.lat += (alvo.lat - this.lat) * a;
    this.lon += (alvo.lon - this.lon) * a;
    // Rumo: suavização circular
    if (alvo.rumo === null) {
      this.rumo = null;
    } else if (this.rumo === null) {
      this.rumo = alvo.rumo;
    } else {
      let d = alvo.rumo - this.rumo;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      this.rumo = norm360(this.rumo + d * (1 - Math.exp(-dt / 0.35)));
    }
  }
}

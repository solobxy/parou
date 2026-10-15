// Qualidade da posição, para o aviso no mapa: "boa", "fraca" (posição aproximada) ou "sem sinal".
// Decide com histerese e tempos de espera, para o aviso não piscar:
//  - fraca: precisão pior que 100 m durante 4 s seguidos (os primeiros segundos de um GPS a arrancar não contam);
//    volta a boa com menos de 70 m durante 3 s;
//  - sem sinal: nenhuma leitura há 20 s ou mais (túnel, interior); passa assim que chega outra.
// Os limiares são decisão de desenho (a distância entre paragens numa cidade ronda 100–300 m: com ±100 m já se pode
// escolher a paragem errada), não vêm de uma norma.

import { useEffect, useState } from 'react';
import { posicaoSuaveAtual } from './posicaoSuave';

export type NivelGps = 'boa' | 'fraca' | 'sem-sinal';

export const LIMITES_GPS = {
  entraFraca: 100, // m
  saiFraca: 70, // m
  esperaFraca: 4000, // ms
  esperaBoa: 3000, // ms
  semSinal: 20, // s sem leituras
  voltaSinal: 5, // s
} as const;

export class AvaliadorQualidade {
  nivel: NivelGps = 'boa';
  private desde = 0;

  /** precisao em metros, semLeituras em segundos, agora em ms */
  atualizar(precisao: number, semLeituras: number, agora: number): NivelGps {
    const L = LIMITES_GPS;
    let alvo: NivelGps;
    if (semLeituras >= L.semSinal || (this.nivel === 'sem-sinal' && semLeituras >= L.voltaSinal)) {
      alvo = 'sem-sinal';
    } else if (precisao >= L.entraFraca) {
      alvo = 'fraca';
    } else if (precisao < L.saiFraca) {
      alvo = 'boa';
    } else {
      // Entre 70 e 100 m: mantém o que estava (ao regressar de "sem sinal" decide pelo meio do intervalo)
      alvo = this.nivel === 'sem-sinal' ? (precisao >= 85 ? 'fraca' : 'boa') : this.nivel;
    }
    if (alvo === this.nivel) {
      this.desde = 0;
      return this.nivel;
    }
    if (!this.desde) this.desde = agora;
    const espera = alvo === 'sem-sinal' ? 0 : alvo === 'fraca' ? L.esperaFraca : L.esperaBoa;
    if (agora - this.desde >= espera) {
      this.nivel = alvo;
      this.desde = 0;
    }
    return this.nivel;
  }
}

/** Precisão para mostrar: de 50 em 50 m até 1 km, depois de 100 em 100 m (não treme a cada leitura) */
export function precisaoParaMostrar(m: number): number {
  if (!Number.isFinite(m) || m <= 0) return 0;
  return m < 1000 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 100) * 100;
}

export interface EstadoQualidadeGps {
  nivel: NivelGps;
  precisao: number;
}

/** Lê a posição suave de segundo a segundo; só atualiza o ecrã quando o aviso muda. `ativo` = há GPS a ser seguido. */
export function useQualidadeGps(ativo: boolean): EstadoQualidadeGps {
  const [estado, setEstado] = useState<EstadoQualidadeGps>({ nivel: 'boa', precisao: 0 });
  useEffect(() => {
    if (!ativo) {
      setEstado((e) => (e.nivel === 'boa' && e.precisao === 0 ? e : { nivel: 'boa', precisao: 0 }));
      return;
    }
    const av = new AvaliadorQualidade();
    // Ao voltar à app (depois de estar em segundo plano) o GPS demora um instante a falar: não mostra "sem sinal" nesse intervalo
    let visivelDesde = Date.now();
    const aoVer = () => { if (!document.hidden) visivelDesde = Date.now(); };
    document.addEventListener('visibilitychange', aoVer);
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - visivelDesde < 4000) return;
      const q = posicaoSuaveAtual();
      if (!q) return;
      const nivel = av.atualizar(q.precisao, q.semLeituras, Date.now());
      const precisao = precisaoParaMostrar(q.precisao);
      setEstado((e) => (e.nivel === nivel && e.precisao === precisao ? e : { nivel, precisao }));
    }, 1000);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', aoVer); };
  }, [ativo]);
  return estado;
}

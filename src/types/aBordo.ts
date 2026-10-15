// Tipos partilhados entre o servidor (autocarros em direto e "A bordo") e a app.
import type { OperadorVeiculos } from '../utils/chaveLinha';

/** Um autocarro em direto, como o servidor o envia (só o que a app precisa) */
export interface VeiculoLeve {
  /** Identificador do veículo (para pedir o "A bordo") */
  id: string;
  op: OperadorVeiculos;
  /** Código da linha, como se mostra (ex.: 801) */
  linha: string;
  lat: number;
  lon: number;
  /** Graus, 0 = norte */
  rumo?: number;
  /** km/h */
  vel?: number;
  /** Segundos desde 1970 a que o operador mediu esta posição */
  t: number;
  /** Viagem do tempo real, se o operador a indica */
  viagem?: string;
}

export interface ParagemABordo {
  id: string;
  nome: string;
  lat: number;
  lon: number;
  /** HH:MM do horário (só quando o percurso é o da viagem deste autocarro) */
  hora?: string;
}

export interface RespostaABordo {
  veiculo: VeiculoLeve;
  /** viagem: o operador indicou a viagem e ela existe no horário (há horas); posicao: percurso escolhido pela linha e pela posição (sem horas) */
  origem?: 'viagem' | 'posicao';
  linha?: string;
  cor?: string;
  destino?: string;
  /** Total de paragens do percurso */
  total?: number;
  /** Só com `completo`: as paragens por ordem */
  paragens?: ParagemABordo[];
  /** Posição da paragem seguinte (ou da paragem onde está, se `naParagem`) */
  indice?: number;
  naParagem?: boolean;
  /** Metros do autocarro à paragem seguinte (em linha reta) */
  distanciaProximaM?: number;
  /**
   * Hora prevista em direto (HH:MM) de cada paragem que falta, pela posição da paragem na lista (só quando o operador a envia:
   * hoje a TUB). Muda a cada pedido; as horas de `paragens` são as do horário.
   */
  previstas?: Record<number, string>;
  /** Metros do autocarro ao percurso: se for grande, saiu do percurso (desvio) */
  desvioM?: number;
  semPercurso?: boolean;
  agora?: number;
}

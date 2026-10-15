// Leitura mínima de protobuf (sem dependências), só o que a PAROU precisa para ler ficheiros GTFS-Realtime
// (posições e atualizações de viagens). Usada pela STCP e pela TUB.

export interface CampoProto {
  /** Número do campo */
  n: number;
  /** Tipo: 0 = número inteiro, 1 = 64 bits, 2 = texto ou mensagem, 5 = 32 bits (decimal) */
  t: number;
  num: number;
  bytes?: Uint8Array;
}

/**
 * Leitura de um número inteiro de tamanho variável (com sinal nos números que ocupam 10 bytes, como os negativos de 32 e 64 bits).
 * Acima de 2^53 perde precisão, o que não afeta horas nem atrasos.
 */
export function lerVarint(buf: Uint8Array, pos: number): [number, number] {
  let p = pos;
  let valor = 0;
  let mult = 1;
  for (let i = 0; i < 10 && p < buf.length; i++) {
    const b = buf[p++];
    if (i < 7) {
      valor += (b & 0x7f) * mult;
      mult *= 128;
      if ((b & 0x80) === 0) return [valor, p];
    } else {
      // 8 bytes ou mais: continua com inteiros grandes para não perder os bits de cima
      let grande = BigInt(valor) + (BigInt(b & 0x7f) << BigInt(7 * i));
      if ((b & 0x80) === 0) return [Number(BigInt.asIntN(64, grande)), p];
      for (let j = i + 1; j < 10 && p < buf.length; j++) {
        const c = buf[p++];
        grande += BigInt(c & 0x7f) << BigInt(7 * j);
        if ((c & 0x80) === 0) return [Number(BigInt.asIntN(64, grande)), p];
      }
      break;
    }
  }
  throw new Error('protobuf: número inválido');
}

export function lerCampos(buf: Uint8Array): CampoProto[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const campos: CampoProto[] = [];
  let p = 0;
  while (p < buf.length) {
    const [chave, depoisChave] = lerVarint(buf, p);
    p = depoisChave;
    const n = Math.floor(chave / 8);
    const t = chave % 8;
    if (t === 0) {
      const [v, q] = lerVarint(buf, p);
      p = q;
      campos.push({ n, t, num: v });
    } else if (t === 1) {
      if (p + 8 > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: dv.getFloat64(p, true) });
      p += 8;
    } else if (t === 2) {
      const [len, q] = lerVarint(buf, p);
      p = q;
      if (p + len > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: 0, bytes: buf.subarray(p, p + len) });
      p += len;
    } else if (t === 5) {
      if (p + 4 > buf.length) throw new Error('protobuf: truncado');
      campos.push({ n, t, num: dv.getFloat32(p, true) });
      p += 4;
    } else {
      throw new Error('protobuf: tipo de campo desconhecido');
    }
  }
  return campos;
}

export const texto = (c?: CampoProto): string => (c?.bytes ? new TextDecoder().decode(c.bytes) : '');

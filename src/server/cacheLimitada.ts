// Cache de texto com limite de memória (páginas HTML feitas no servidor).
//
// A cache antiga das páginas era um Map sem limite real: as páginas de paragens e de linhas entravam sem nunca sair
// (o Google visita dezenas de milhares por dia), o que enchia a memória da app até ela cair de 1 em 1 ou 2 em 2 dias.
// Aqui cada entrada fica em UTF-8 fora da memória do JavaScript (Buffer), há um limite de bytes e de entradas, sai
// primeiro a que foi usada há mais tempo e as que passaram do prazo são apagadas de 2 em 2 minutos.

interface Entrada { t: number; ttl: number; b: Buffer }

export class CacheLimitada {
  private readonly m = new Map<string, Entrada>();
  private bytes = 0;

  constructor(private readonly maxBytes: number, private readonly maxEntradas = 4000, limpezaMs = 120_000) {
    if (limpezaMs > 0) {
      const t = setInterval(() => this.limparExpiradas(), limpezaMs);
      t.unref?.();
    }
  }

  /** O texto guardado (ou undefined se não existe ou já passou do prazo) */
  get(k: string, agora = Date.now()): string | undefined {
    const b = this.getBuffer(k, agora);
    return b ? b.toString('utf8') : undefined;
  }

  /** O mesmo, em bytes (para enviar sem converter) */
  getBuffer(k: string, agora = Date.now()): Buffer | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (agora - e.t >= e.ttl) { this.apagar(k); return undefined; }
    // Usada agora: passa para o fim da fila (a última a sair)
    this.m.delete(k);
    this.m.set(k, e);
    return e.b;
  }

  set(k: string, v: string, ttlMs: number, agora = Date.now()): void {
    const b = Buffer.from(v, 'utf8');
    if (b.length > this.maxBytes / 4) return; // uma página gigante não ocupa a cache toda
    this.apagar(k);
    this.m.set(k, { t: agora, ttl: ttlMs, b });
    this.bytes += b.length;
    while ((this.bytes > this.maxBytes || this.m.size > this.maxEntradas) && this.m.size) {
      const maisAntiga = this.m.keys().next().value as string;
      this.apagar(maisAntiga);
    }
  }

  apagar(k: string): void {
    const e = this.m.get(k);
    if (!e) return;
    this.bytes -= e.b.length;
    this.m.delete(k);
  }

  limparExpiradas(agora = Date.now()): void {
    for (const [k, e] of this.m) if (agora - e.t >= e.ttl) this.apagar(k);
  }

  limpar(): void { this.m.clear(); this.bytes = 0; }

  get tamanho(): number { return this.m.size; }
  get ocupado(): number { return this.bytes; }
}

/**
 * Corta um Map usado como cache para no máximo `max` entradas (saem as mais antigas, pela ordem de entrada).
 * Para as caches por paragem: sem isto guardavam uma entrada por cada paragem visitada (o Google visita todas) e nunca a largavam.
 */
export function podarMapa<K, V>(m: Map<K, V>, max: number): void {
  if (m.size <= max) return;
  let excesso = m.size - max;
  for (const k of m.keys()) {
    m.delete(k);
    if (--excesso <= 0) break;
  }
}

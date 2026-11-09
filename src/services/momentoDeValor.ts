// Avisa a app de que a pessoa acabou de ter valor da PAROU (abriu uma opção de viagem, viu as partidas de uma paragem,
// abriu o horário de uma linha). O convite para instalar (ConviteInstalar) só aparece depois de um destes momentos.
export type MomentoDeValor = 'rota' | 'paragem' | 'linha';

export const EVENTO_VALOR = 'parou_valor';

export function momentoDeValor(tipo: MomentoDeValor): void {
  try { window.dispatchEvent(new CustomEvent(EVENTO_VALOR, { detail: tipo })); } catch { /* sem importância */ }
}

/** Evento próprio para as estatísticas do painel (estat('nome', 'valor')), mesmo que o script ainda não tenha carregado */
export function marcarEvento(nome: string, valor: string): void {
  try {
    const w = window as any;
    if (typeof w.estat === 'function') { w.estat(nome, valor); return; }
    const fila = (w.estat = w.estat || {});
    (fila.q = fila.q || []).push([nome, valor]);
  } catch { /* sem importância */ }
}

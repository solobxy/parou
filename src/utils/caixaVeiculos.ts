// Caixa de mapa (sul, oeste, norte, leste, em graus) para pedir os autocarros em direto.
// O servidor e a app usam as mesmas regras: um raio largo (até 0,6° de lado, ≈ 66 km) chega para ver uma cidade ou uma região
// inteira de autocarros; mais do que isso é um pedido «do país inteiro» e não se faz.

export interface Caixa { sul: number; oeste: number; norte: number; leste: number }

/** Lado máximo de uma caixa, em graus (≈ 66 km): ver Lisboa, a Península de Setúbal ou o Grande Porto de uma vez */
export const LADO_MAX_GRAUS = 0.6;
/** Pequena tolerância para erros de arredondamento (0,6 pode chegar como 0,6000000000000014) */
export const TOLERANCIA_GRAUS = 1e-6;
/** Portugal, Açores e Madeira incluídos */
export const LIMITES_PORTUGAL: Caixa = { sul: 30, oeste: -35, norte: 45, leste: -5 };
/** Folga à volta do ecrã (fração do tamanho do ecrã, de cada lado): os autocarros que estão a entrar no ecrã já lá estão */
export const FOLGA_ECRA = 0.15;
/** A caixa pedida arredonda-se para fora a múltiplos disto: mexer um pouco no mapa não muda o pedido */
export const PASSO_CAIXA_GRAUS = 0.005;

export type CaixaDoEcra = { caixa: Caixa; longe?: false } | { caixa?: undefined; longe: true } | { caixa?: undefined; longe?: false };

/**
 * Transforma o que o mapa mostra na caixa a pedir ao servidor.
 *  - `{ caixa }`: pede-se esta caixa (o ecrã com folga, arredondado para fora);
 *  - `{ longe: true }`: o mapa está tão afastado que seria um pedido enorme; não se pede e a app diz para aproximar;
 *  - `{}`: ecrã inválido ou fora de Portugal: não há nada para pedir.
 */
export function caixaDoEcra(ecra: Caixa): CaixaDoEcra {
  const { sul, oeste, norte, leste } = ecra;
  if (![sul, oeste, norte, leste].every(Number.isFinite) || sul >= norte || oeste >= leste) return {};
  const h = norte - sul, w = leste - oeste;
  const arredondarBaixo = (x: number) => Math.floor(x / PASSO_CAIXA_GRAUS + 1e-9) * PASSO_CAIXA_GRAUS;
  const arredondarCima = (x: number) => Math.ceil(x / PASSO_CAIXA_GRAUS - 1e-9) * PASSO_CAIXA_GRAUS;
  const grande = {
    sul: arredondarBaixo(sul - h * FOLGA_ECRA),
    norte: arredondarCima(norte + h * FOLGA_ECRA),
    oeste: arredondarBaixo(oeste - w * FOLGA_ECRA),
    leste: arredondarCima(leste + w * FOLGA_ECRA),
  };
  // Só conta o que cai dentro de Portugal (o resto não tem autocarros nossos)
  const lim = LIMITES_PORTUGAL;
  const caixa = { sul: Math.max(grande.sul, lim.sul), norte: Math.min(grande.norte, lim.norte), oeste: Math.max(grande.oeste, lim.oeste), leste: Math.min(grande.leste, lim.leste) };
  if (caixa.sul >= caixa.norte || caixa.oeste >= caixa.leste) return {};
  // Muito afastado: o ecrã (sem folga) já passa do limite, ou a caixa pedida passaria
  if (h > LADO_MAX_GRAUS + TOLERANCIA_GRAUS || w > LADO_MAX_GRAUS + TOLERANCIA_GRAUS) return { longe: true };
  if (caixa.norte - caixa.sul > LADO_MAX_GRAUS + TOLERANCIA_GRAUS || caixa.leste - caixa.oeste > LADO_MAX_GRAUS + TOLERANCIA_GRAUS) {
    // O ecrã cabe, mas com a folga passa do limite: aperta-se a caixa à volta do ecrã, centrada nele
    const ajustar = (a: number, b: number, ea: number, eb: number): [number, number] => {
      if (b - a <= LADO_MAX_GRAUS + TOLERANCIA_GRAUS) return [a, b];
      const centro = (ea + eb) / 2;
      return [centro - LADO_MAX_GRAUS / 2, centro + LADO_MAX_GRAUS / 2];
    };
    const [s, n] = ajustar(caixa.sul, caixa.norte, sul, norte);
    const [o, l] = ajustar(caixa.oeste, caixa.leste, oeste, leste);
    return { caixa: { sul: s, norte: n, oeste: o, leste: l } };
  }
  return { caixa };
}

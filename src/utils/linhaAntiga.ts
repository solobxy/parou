// Endereço antigo de uma linha: o endereço de cada linha vem do nome do percurso, e quando a base de horários muda
// esse nome pode mudar (ex.: /linhas/carris/729-belem-r-bica-marques deixa de existir). Quem chega por esse endereço
// vai para a variante atual da mesma linha (mesmo número), a que tiver mais palavras em comum com o endereço antigo.

/** Palavras com mais de duas letras (as preposições e abreviaturas como «r» ou «av» não contam) */
function palavras(texto: string): string[] {
  return texto.split('-').filter((p) => p.length > 2);
}

/**
 * Escolhe a linha atual para um endereço que já não existe.
 * Devolve o endereço (slug) da linha atual, ou null se a linha com aquele número já não existe ou não tem número.
 */
export function escolherLinhaAtual(linhas: Array<{ slug: string }>, pedido: string): string | null {
  const [codigo, ...resto] = pedido.toLowerCase().split('-');
  if (!codigo || !/\d/.test(codigo)) return null;
  const candidatas = linhas.filter((l) => l.slug === codigo || l.slug.startsWith(`${codigo}-`));
  if (candidatas.length === 0) return null;
  const pedidas = new Set(palavras(resto.join('-')));
  let melhor = candidatas[0];
  let melhorPontos = -1;
  for (const l of candidatas) {
    const pontos = palavras(l.slug.slice(codigo.length)).filter((p) => pedidas.has(p)).length;
    if (pontos > melhorPontos) { melhor = l; melhorPontos = pontos; }
  }
  return melhor.slug;
}

// Atribuições que os operadores pedem: o texto que a app mostra quando usa os dados deles (ex.: «Fonte: …»).
// Os textos são os que o próprio operador indicou.

const ATRIBUICOES: Readonly<Record<string, string>> = {
  smtuc_coimbra: 'Fonte: Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC)',
  // Horários (NeTEx) e rede do metrobus publicados pela AGIT em dados.gov.pt, licença CC BY 4.0
  metro_mondego: 'Fonte: Metro Mondego e AGIT – Agência para a Gestão do Sistema Intermodal da Região de Coimbra (dados abertos, CC BY 4.0)',
};

/** Texto de atribuição de uma fonte (id do feed), ou null se não houver um pedido específico. */
export function atribuicaoDaFonte(id: string): string | null {
  return ATRIBUICOES[id] ?? null;
}

/** Todas as atribuições, para a secção de créditos. */
export function todasAsAtribuicoes(): string[] {
  return Object.values(ATRIBUICOES);
}

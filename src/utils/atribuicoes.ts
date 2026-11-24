// Atribuições que os operadores pedem: o texto que a app mostra quando usa os dados deles (ex.: «Fonte: …»).
// Os textos são os que o próprio operador indicou.

const ATRIBUICOES: Readonly<Record<string, string>> = {
  smtuc_coimbra: 'Fonte: Serviços Municipalizados de Transportes Urbanos de Coimbra (SMTUC)',
  // Horários (NeTEx) e rede do metrobus publicados pela AGIT em dados.gov.pt, licença CC BY 4.0
  // Rede SIGA (Madeira): horários publicados pelo IMT Madeira (SIGA Rodoeste e CAM)
  siga_rodoeste: 'Fonte: Instituto de Mobilidade e Transportes, IP-RAM (Rede SIGA)',
  cam_madeira: 'Fonte: Instituto de Mobilidade e Transportes, IP-RAM (Rede SIGA)',
  metro_mondego: 'Fonte: Metro Mondego e AGIT – Agência para a Gestão do Sistema Intermodal da Região de Coimbra (dados abertos, CC BY 4.0)',
  // Horários e tempo real oficiais da TTSL (api.ttsl.pt); texto pedido pela TTSL por email (novembro de 2026)
  transtejo_soflusa: 'Fonte — Transtejo Soflusa (TTSL)',
};

/** A palavra «Fonte» nas outras línguas; o resto do texto fica como o operador o pediu */
const FONTE_LINGUA: Readonly<Record<string, string>> = { pt: 'Fonte', en: 'Source', de: 'Quelle', fr: 'Source', es: 'Fuente' };

/** Texto de atribuição de uma fonte (id do feed), ou null se não houver um pedido específico. */
export function atribuicaoDaFonte(id: string): string | null {
  return ATRIBUICOES[id] ?? null;
}

/** Atribuição na língua pedida (pt, en, de, fr, es): só muda a palavra «Fonte» do início */
export function atribuicaoNaLingua(id: string, lingua: string): string | null {
  const t = ATRIBUICOES[id];
  if (!t) return null;
  const fonte = FONTE_LINGUA[String(lingua || 'pt').slice(0, 2).toLowerCase()] || FONTE_LINGUA.pt;
  return t.replace(/^Fonte(?=\s*[:—])/, fonte);
}

/** Todas as atribuições, para a secção de créditos. */
export function todasAsAtribuicoes(): string[] {
  return Object.values(ATRIBUICOES);
}

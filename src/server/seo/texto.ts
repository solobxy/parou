// Utilitários de texto para as páginas públicas (SEO): endereços legíveis, nomes bonitos e HTML seguro.

export function semAcentos(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "Hospital S. João — Coimbrões" -> "hospital-s-joao-coimbroes" */
export function slug(s: string, max = 80): string {
  const base = semAcentos(s)
    .toLowerCase()
    .replace(/&/g, ' e ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (base.length <= max) return base || 'sem-nome';
  return base.slice(0, max).replace(/-[^-]*$/, '') || base.slice(0, max);
}

export function html(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Palavras que alguns operadores publicam sem acentos (ex.: CP "Porto Campanha")
const ACENTOS: Record<string, string> = {
  sao: 'São', joao: 'João', estacao: 'Estação', apolonia: 'Apolónia', campanha: 'Campanhã', evora: 'Évora',
  santarem: 'Santarém', guimaraes: 'Guimarães', famalicao: 'Famalicão', regua: 'Régua', algueirao: 'Algueirão',
  cacem: 'Cacém', belem: 'Belém', alcantara: 'Alcântara', paco: 'Paço', povoa: 'Póvoa', sacavem: 'Sacavém',
  braco: 'Braço', sodre: 'Sodré', setubal: 'Setúbal', covilha: 'Covilhã', valenca: 'Valença', aguas: 'Águas',
  loule: 'Loulé', portimao: 'Portimão', olhao: 'Olhão', antonio: 'António', grandola: 'Grândola', alcacer: 'Alcácer',
  obidos: 'Óbidos', agueda: 'Águeda', tamega: 'Tâmega', guarda: 'Guarda', mirao: 'Mirão', lousa: 'Lousã',
  conceicao: 'Conceição', assuncao: 'Assunção', jose: 'José', ines: 'Inês', camara: 'Câmara', municipio: 'Município',
  praca: 'Praça', avenida: 'Avenida', hospital: 'Hospital', universidade: 'Universidade', terminal: 'Terminal',
};
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'nas', 'nos', 'à', 'ao', 'ou', 'para', 'por']);

// Siglas que ficam em maiúsculas
const SIGLAS = new Set(['CP', 'STCP', 'MTS', 'TCB', 'TUB', 'TUBA', 'SMTUC', 'UNIR', 'ISEP', 'IPO', 'CUF', 'ISCTE', 'FEUP', 'ISEG', 'IST', 'ISEL', 'IKEA', 'CTT', 'PSP', 'GNR', 'EB', 'EB1', 'EB23', 'ES', 'ESE', 'ETAR', 'ZI', 'UC', 'UM', 'UA', 'IPCA', 'IPB', 'IPL', 'HSJ', 'CHUC', 'IC', 'IP', 'EN', 'ER', 'CM', 'TAP', 'BP', 'GALP', 'EDP', 'ANA', 'ISMAI', 'ISCAP', 'ESMAE', 'FCUP', 'FMUP', 'FLUP', 'IPP', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XXI', 'NS', 'SA', 'BPI', 'CGD', 'BCP', 'LIDL', 'MAR', 'SAPO']);
const NAO_SIGLAS = new Set(['MAR']);

function capitalizar(p: string): string {
  const low = p.toLowerCase();
  const i = low.search(/[a-zà-ÿ]/);
  return i < 0 ? low : low.slice(0, i) + low.charAt(i).toUpperCase() + low.slice(i + 1);
}

function palavraBonita(p: string, primeira: boolean): string {
  if (!p) return p;
  const low = p.toLowerCase();
  const chave = semAcentos(low).replace(/[^a-z]/g, '');
  if (ACENTOS[chave] && semAcentos(low) === low) {
    // só troca se a palavra veio sem acentos
    const pref = p.match(/^[^A-Za-zÀ-ÿ]*/)?.[0] || '';
    const suf = p.match(/[^A-Za-zÀ-ÿ]*$/)?.[0] || '';
    return pref + ACENTOS[chave] + suf;
  }
  const letras = p.replace(/[^A-Za-zÀ-ÿ0-9]/g, '');
  if (!primeira && MINUSCULAS.has(semAcentos(low).replace(/[^a-z]/g, '')) && letras.length === low.replace(/[^a-zà-ÿ0-9]/g, '').length) return low;
  // Siglas (CP, ISCTE) e códigos com números (A1, IC19, EN10) ficam como estão
  const soLetras = letras.toUpperCase();
  if ((SIGLAS.has(soLetras) && !NAO_SIGLAS.has(soLetras)) || (/\d/.test(letras) && /[A-Z]/.test(letras) && letras.length <= 6)) return p.toUpperCase();
  // Palavras compostas ("CORDOARIA-S.") capitalizam cada parte
  if (p.includes('-')) return p.split('-').map((q) => (q ? capitalizar(q) : q)).join('-');
  return capitalizar(p);
}

/**
 * Nome legível de paragem/linha: "S.PEDRO C. /PASSAL" -> "S. Pedro C. / Passal",
 * "Porto Campanha" -> "Porto Campanhã". Nomes já bem escritos ficam como estão.
 */
export function nomeBonito(nome: string): string {
  let s = String(nome || '').replace(/\s+/g, ' ').trim();
  if (!s) return s;
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  const tudoMaiusculas = letras.length >= 4 && maiusculas / letras.length > 0.8;
  s = s.replace(/\s*\/\s*/g, ' / ').replace(/([A-Za-zÀ-ÿ])\.(?=[A-Za-zÀ-ÿ]{2,})/g, '$1. ');
  const partes = s.split(' ');
  s = partes
    .map((p, i) => {
      const so = p.replace(/[^A-Za-zÀ-ÿ]/g, '');
      const eMaiusc = so.length >= 2 && so === so.toUpperCase() && /[A-ZÀ-Þ]/.test(so);
      if (tudoMaiusculas || (eMaiusc && so.length >= 4 && !SIGLAS.has(so))) {
        return palavraBonita(p, i === 0);
      }
      const chave = semAcentos(p.toLowerCase()).replace(/[^a-z]/g, '');
      if (ACENTOS[chave] && semAcentos(p) === p) {
        const novo = ACENTOS[chave];
        return p[0] === p[0].toLowerCase() ? novo.toLowerCase() : novo;
      }
      return p;
    })
    .join(' ');
  return s;
}

/** Segundos desde a meia-noite (pode passar das 24 h) -> "07:05" */
export function hora(secs: number): string {
  const s = ((Math.floor(secs) % 86400) + 86400) % 86400;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

export function cortar(s: string, max: number): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

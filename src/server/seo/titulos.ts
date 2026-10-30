// Títulos e descrições (em português) das páginas de linhas, pensados para quem pesquisa no Google.
//
// O que os dados do Search Console mostraram (out/2026): a maior parte das pesquisas é só o número da linha
// («4562», «4725») ou o número com o operador («4562 carris metropolitana»). Por isso o título começa pelo
// número e pelo percurso (o que a pessoa escreveu fica a negrito no Google), e a descrição mostra logo a
// primeira e a última partida e de quanto em quanto tempo passa, que é o que essa pessoa quer saber.
// Funções puras (sem base de dados), testadas em auditoria/titulos-linhas.mjs.

const MAX_TITULO = 65;
// Para não perder o nome do operador (muitas pesquisas são «4562 carris metropolitana»), aceita um
// pouco mais; o Google corta pela largura e o fim do destino é o que menos falta faz
const MAX_TITULO_COM_OPERADOR = 72;
// O Google mostra ~120 a 160 caracteres, mas lê a descrição toda: o que importa vem primeiro e o resto
// (sábados/domingos, paragens) fica para quem tem ecrã maior. Sem limite oficial (Google Search Central).
const MAX_DESCRICAO = 200;

export interface ResumoDia { partidas: number[] }

export interface DadosTituloLinha {
  codigo: string; // "4562", "Linha Azul", "Linha de Sintra"
  percurso: string; // "Setúbal (ITS) – Vila Nogueira de Azeitão (Escola) via Palmela (Estação)"
  operador: string; // "Carris Metropolitana"
  modo: string; // "Autocarro", "Metro", "Comboio", "Barco", "Elétrico"
  nParagens: number;
  tempoReal: boolean;
  /** Partidas dos dias úteis no primeiro sentido (segundos desde a meia-noite, por ordem) */
  uteis?: number[];
  sabado?: number[];
  domingo?: number[];
}

const PALAVRA_MODO: Record<string, string> = { Autocarro: 'autocarro', Metro: 'metro', Comboio: 'comboio', Barco: 'barco', 'Elétrico': 'elétrico' };

/** "4562" e "1M" são códigos; "Linha de Sintra" e "Intercidades" são nomes */
export function eCodigo(codigo: string): boolean {
  return /^\d/.test(codigo) || /^[A-Z0-9]{1,4}$/.test(codigo);
}

function limpar(t: string): string {
  // Só os traços com espaços (ou travessões) separam origem e destino; "Lisboa-Rossio" fica como está
  return String(t || '').replace(/\s+/g, ' ').replace(/\s+[-–—]\s+|\s*[–—]\s*/g, ' – ').trim();
}
/** Nome curto do operador para o título: "CP – Comboios de Portugal" -> "CP" */
export function operadorCurto(op: string): string {
  return String(op || '').split(/\s+[–—-]\s+/)[0].trim();
}
/** Como a linha aparece no início do título: "4562", "M44", "Linha A", "Linha de Sintra" */
export function inicioTitulo(codigo: string): string {
  const c = String(codigo || '').trim();
  if (/\d/.test(c)) return c;
  if (/^[A-Za-z]{1,3}$/.test(c)) return `Linha ${c}`;
  return c.replace(/^linha\s+/i, 'Linha ');
}
/** Tira " via …", " pela …", " (pela …)" e " por …" do fim do percurso */
export function semVia(p: string): string {
  return limpar(p).replace(/\s*\((?:via|pela|pelo|por)\b[^)]*\)\s*$/i, '').replace(/\s+(?:via|pela|pelo|por)\s+.*$/i, '').trim();
}
/** Tira o que está entre parênteses: "Setúbal (ITS) – Azeitão (Escola)" -> "Setúbal – Azeitão" */
export function semParenteses(p: string): string {
  return semVia(p).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}

function cortarFrase(t: string, max: number): string {
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/[\s,;:–-]+\S*$/, '')}…`;
}

/** Título da página de uma linha: número e percurso primeiro, depois "horário" e o operador */
export function tituloLinha(d: DadosTituloLinha): string {
  const base = inicioTitulo(d.codigo);
  const op = operadorCurto(d.operador);
  const percursos = Array.from(new Set([limpar(d.percurso), semVia(d.percurso), semParenteses(d.percurso)])).filter(Boolean);
  // Percurso igual ao nome (ex.: "Linha Azul"): não repete
  const comPercurso = (p: string) => (p && p.toLowerCase() !== base.toLowerCase() ? `${base} ${p}` : base);
  // O operador só não entra se já fizer parte do nome da linha
  const comOp = (t: string) => (t.toLowerCase().includes(op.toLowerCase()) ? t : `${t} ${op}`);
  const candidatos: Array<[string, number]> = [];
  for (const p of percursos.length ? percursos : ['']) {
    candidatos.push([`${comOp(`${comPercurso(p)}: horário`)} | PAROU`, MAX_TITULO]);
    candidatos.push([comOp(`${comPercurso(p)}: horário`), MAX_TITULO]);
  }
  const curto = percursos[percursos.length - 1] || '';
  candidatos.push([comOp(`${comPercurso(curto)}: horário`), MAX_TITULO_COM_OPERADOR]);
  const bom = candidatos.find(([c, max]) => c.length <= max);
  if (bom) return bom[0];
  // Ainda comprido: operador logo a seguir ao número e o percurso no fim (cortado se for preciso)
  return cortarFrase(`${base} ${op}: horário ${curto}`.trim(), MAX_TITULO_COM_OPERADOR);
}

/** "06:35" a partir de segundos (aceita horas depois da meia-noite: 24:05 -> 00:05) */
export function hhmm(s: number): string {
  const x = ((Math.round(s) % 86400) + 86400) % 86400;
  return `${String(Math.floor(x / 3600)).padStart(2, '0')}:${String(Math.floor((x % 3600) / 60)).padStart(2, '0')}`;
}

/** Intervalo típico (mediana) entre partidas das 7h às 10h, em minutos; null se houver menos de 3 */
export function intervaloPonta(partidas: number[]): number | null {
  const ponta = partidas.filter((x) => x >= 7 * 3600 && x < 10 * 3600).sort((a, b) => a - b);
  if (ponta.length < 3) return null;
  const gaps = ponta.slice(1).map((x, i) => x - ponta[i]).filter((g) => g > 0).sort((a, b) => a - b);
  if (!gaps.length) return null;
  return Math.max(1, Math.round(gaps[Math.floor(gaps.length / 2)] / 60));
}

/** Descrição: primeiro as horas (o que a pessoa procura), depois o resto do que a página tem */
export function descricaoLinha(d: DadosTituloLinha): string {
  const palavra = PALAVRA_MODO[d.modo] || 'transporte';
  const nome = /\d/.test(d.codigo) || /^[A-Za-z]{1,3}$/.test(d.codigo) ? `Linha ${d.codigo}` : d.codigo;
  const dias: string[] = [];
  if (d.sabado && d.sabado.length) dias.push('sábados');
  if (d.domingo && d.domingo.length) dias.push('domingos');
  const pedacos = [...(dias.length ? [`horário de ${dias.join(' e ')}`] : []), d.nParagens ? `${d.nParagens} paragens` : 'paragens'];
  const extras = `${pedacos.join(', ')}${d.tempoReal ? ' e tempo real' : ''}`;
  const u = (d.uteis || []).slice().sort((a, b) => a - b);
  const intervalo = u.length ? intervaloPonta(u) : null;
  const horas = u.length === 1
    ? `Dias úteis: uma partida, às ${hhmm(u[0])}.`
    : u.length
      ? `Dias úteis: 1.º ${palavra} às ${hhmm(u[0])}, último às ${hhmm(u[u.length - 1])}`
        + (intervalo && intervalo <= 60 ? `, de ${intervalo} em ${intervalo} min na hora de ponta` : `, ${u.length} partidas por dia`) + '.'
      : '';
  // Ordem: horas (o que se procura), a linha e o operador, o percurso e o resto (o fim é o que se corta)
  const montar = (percurso: string) => {
    const p = percurso && percurso.toLowerCase() !== nome.toLowerCase() ? ` (${percurso})` : '';
    const frase = horas
      ? `${horas} ${nome} · ${d.operador}${p}: ${extras}.`
      : `Horário da ${nome} · ${d.operador}${p}: ${extras}.`;
    return frase.replace(/\s+/g, ' ').trim();
  };
  // Sem parênteses dentro de parênteses: "(Penafiel (Esc.) – Valongo)" fica "(Penafiel – Valongo)"
  const longo = montar(/\(/.test(semVia(d.percurso)) ? semParenteses(d.percurso) : semVia(d.percurso));
  if (longo.length <= MAX_DESCRICAO) return longo;
  return cortarFrase(montar(semParenteses(d.percurso)), MAX_DESCRICAO);
}

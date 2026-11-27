// =====================================================================================
// PAROU.PT — Comboios dos serviços mínimos nas greves da CP
//
// Nas greves, a CP publica no aviso PDFs com os comboios garantidos («Serviços mínimos 24 e 25 de novembro», um por serviço:
// Alfa Pendular/Intercidades, Regional, Urbanos de Lisboa, Porto e Coimbra). Cada linha tem o número do comboio; nalguns há
// uma coluna por dia com «SM». Aqui lêem-se esses PDFs (pdftotext no servidor) e fica, para cada dia, a lista dos números.
// Na app: o comboio da lista fica «serviço mínimo»; os outros «pode não se realizar» (a CP avisa que «poderão realizar-se
// outros serviços»). Os números são os mesmos das viagens da CP na base (cp:<número>_<data>).
// =====================================================================================
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { DateTime } from 'luxon';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Dias do título do documento («24 e 25 de novembro de 2026», «de 23 a 27 de novembro») */
export function diasDoDocumento(texto: string, anoBase: number): string[] {
  const t = semAcentos(texto.slice(0, 1500));
  const meses = MESES.join('|');
  const out = new Set<string>();
  const dia = (d: number, m: number, a: number) => DateTime.fromObject({ year: a, month: m, day: d }, { zone: 'Europe/Lisbon' }).toISODate();
  for (const m of t.matchAll(new RegExp(`\\b(?:de|entre)\\s+(\\d{1,2})\\s+(?:a|e|ate)\\s+(\\d{1,2})\\s+de\\s+(${meses})(?:\\s+de\\s+(\\d{4}))?`, 'g'))) {
    const a = Number(m[1]), b = Number(m[2]), mes = MESES.indexOf(m[3]) + 1, ano = m[4] ? Number(m[4]) : anoBase;
    if (b >= a && b - a <= 14) for (let n = a; n <= b; n++) { const d = dia(n, mes, ano); if (d) out.add(d); }
  }
  if (!out.size) {
    for (const m of t.matchAll(new RegExp(`((?:\\b\\d{1,2}\\s*(?:,|e)\\s*)*\\b\\d{1,2})\\s+de\\s+(${meses})(?:\\s+de\\s+(\\d{4}))?`, 'g'))) {
      const mes = MESES.indexOf(m[2]) + 1, ano = m[3] ? Number(m[3]) : anoBase;
      for (const n of m[1].split(/\s*(?:,|e)\s*/).map(Number)) if (n >= 1 && n <= 31) { const d = dia(n, mes, ano); if (d) out.add(d); }
      if (out.size) break;
    }
  }
  return [...out].sort();
}

/**
 * Comboios dos serviços mínimos de um documento (texto do pdftotext -layout). Com colunas por dia («24  25» ou «24 novembro
 * 25 novembro»), cada «SM» vale para o dia da coluna mais perto; sem colunas, o comboio vale para todos os dias do documento.
 */
export function comboiosDoTexto(texto: string, anoBase: number): Record<string, string[]> {
  const dias = diasDoDocumento(texto, anoBase);
  const out: Record<string, Set<string>> = {};
  if (!dias.length) return {};
  const numDia = new Map(dias.map((d) => [Number(d.slice(8, 10)), d]));
  let colunas: Array<{ x: number; dia: string }> = [];
  for (const linha of texto.split(/\r?\n/)) {
    // cabeçalho com os dias à direita: «   24         25» ou «Chegada 24 novembro      25 novembro»
    const cab: Array<{ x: number; dia: string }> = [];
    for (const m of linha.matchAll(/(?<![\d:.,])(\d{1,2})(?![\d:.,])/g)) {
      const d = numDia.get(Number(m[1]));
      if (d && (m.index ?? 0) > 30) cab.push({ x: (m.index ?? 0) + m[1].length / 2, dia: d });
    }
    const pareceCabecalho = cab.length >= 2 && cab.length === new Set(cab.map((c) => c.dia)).size && !/^\s*\d{3,5}\s+\S/.test(linha);
    if (pareceCabecalho) { colunas = cab; continue; }
    const m = /^\s*(\d{3,5})\s+\D/.exec(linha);
    if (!m) continue;
    const comboio = String(Number(m[1]));
    const sms = [...linha.matchAll(/\bSM\b/g)].map((x) => (x.index ?? 0) + 1);
    let diasDoComboio: string[];
    if (colunas.length && sms.length) {
      diasDoComboio = sms.map((x) => colunas.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).dia);
    } else {
      // tabela sem colunas por dia (Urbanos do Porto e de Coimbra): vale para todos os dias do documento
      diasDoComboio = dias;
    }
    for (const d of diasDoComboio) (out[d] ||= new Set()).add(comboio);
  }
  return Object.fromEntries(Object.entries(out).map(([d, s]) => [d, [...s].sort((a, b) => Number(a) - Number(b))]));
}

/** Ligações aos PDFs dos serviços mínimos dentro de um aviso da CP (o JSON do aviso) */
export function ligacoesServicosMinimos(item: unknown): string[] {
  const s = JSON.stringify(item || {});
  const out = new Set<string>();
  for (const m of s.matchAll(/(?:https?:\/\/www\.cp\.pt)?(\/info\/documents\/d\/cp\/[a-z0-9-]*servicos-minimos[a-z0-9-]*)/gi)) out.add(`https://www.cp.pt${m[1]}`);
  return [...out].slice(0, 12);
}

/** Junta as listas de vários documentos */
export function juntarComboios(listas: Array<Record<string, string[]>>): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const l of listas) for (const [d, cs] of Object.entries(l)) for (const c of cs) (out[d] ||= new Set()).add(c);
  return Object.fromEntries(Object.entries(out).map(([d, s]) => [d, [...s].sort((a, b) => Number(a) - Number(b))]));
}

const cache = new Map<string, { quando: number; comboios: Record<string, string[]> | null }>();
function pdfParaTexto(ficheiro: string): Promise<string> {
  return new Promise((ok, falha) => {
    execFile('pdftotext', ['-layout', ficheiro, '-'], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => (err ? falha(err) : ok(String(out))));
  });
}

/** Lê os PDFs (cache de 3 h por documento; um documento que falha não estraga os outros) */
export async function comboiosDosServicosMinimos(urls: string[], anoBase: number): Promise<Record<string, string[]>> {
  const listas: Array<Record<string, string[]>> = [];
  for (const url of urls) {
    const c = cache.get(url);
    if (c && Date.now() - c.quando < 3 * 3600_000) { if (c.comboios) listas.push(c.comboios); continue; }
    let comboios: Record<string, string[]> | null = c?.comboios ?? null;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'PAROU.PT/AlertCenter/2.0 (+https://parou.pt)' }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const tmp = path.join(os.tmpdir(), `parou-cp-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      await fs.writeFile(tmp, Buffer.from(await r.arrayBuffer()));
      try { comboios = comboiosDoTexto(await pdfParaTexto(tmp), anoBase); } finally { fs.unlink(tmp).catch(() => {}); }
    } catch { /* sem pdftotext ou sem rede: fica o que havia */ }
    cache.set(url, { quando: Date.now(), comboios });
    if (cache.size > 60) for (const k of [...cache.keys()].slice(0, 20)) cache.delete(k);
    if (comboios) listas.push(comboios);
  }
  return juntarComboios(listas);
}

/** Número do comboio de uma viagem da CP (cp:15153_20251226 → 15153) */
export const numeroDoComboio = (viagem?: string): string | null => {
  const m = /^cp:0*(\d{2,5})_/.exec(String(viagem || ''));
  return m ? m[1] : null;
};

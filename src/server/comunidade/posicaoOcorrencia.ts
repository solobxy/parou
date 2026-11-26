// Onde fica uma ocorrência no mapa (26/11/2026: «há ocorrências fora do sítio, no meio do mar»). Antes o mapa punha cada
// ocorrência no centro do distrito com um desvio ao acaso de 4 a 16 km, e as de Setúbal caíam no mar da Caparica.
// Agora: as coordenadas da fonte (a Proteção Civil dá-as) ou, sem elas, a localidade escrita na ocorrência dentro do concelho,
// ou o próprio concelho (base de locais do país, continente e ilhas). Sem nada disso, a ocorrência não vai para o mapa.
import { getDatabase } from '../db/gtfsDatabase';

export interface PosicaoOcorrencia { lat: number; lon: number; aproximada: boolean }

/** Coordenadas dentro de Portugal (continente, Madeira ou Açores) */
export function dentroDePortugal(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (lat >= 36.8 && lat <= 42.2 && lon >= -9.6 && lon <= -6.1)
    || (lat >= 32.3 && lat <= 33.2 && lon >= -17.4 && lon <= -16.2)
    || (lat >= 36.8 && lat <= 39.8 && lon >= -31.4 && lon <= -24.9);
}

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const POVOACOES = ['cidade', 'vila', 'aldeia', 'localidade', 'bairro', 'freguesia', 'lugar'];
const memo = new Map<string, PosicaoOcorrencia | null>();

/** Localidade pelo nome (exato, sem acentos), de preferência no concelho dado; a mais importante */
function localidade(db: any, nome: string, concelho: string): { lat: number; lon: number } | null {
  if (!nome || nome.length < 2) return null;
  const q = `SELECT nome, cat, sitio, lat, lon, imp FROM locais WHERE nome = ? COLLATE NOCASE AND cat IN (${POVOACOES.map(() => '?').join(',')}) ORDER BY imp DESC LIMIT 20`;
  let linhas: any[] = [];
  try { linhas = db.prepare(q).all(nome, ...POVOACOES) as any[]; } catch { return null; }
  if (!linhas.length) {
    // nome com acentos diferentes («Sao Joao» / «São João»): procura no índice de texto e confere sem acentos
    try {
      const fts = norm(nome).split(' ').filter((p) => p.length >= 2).map((p) => `"${p}"*`).join(' ');
      if (fts) linhas = (db.prepare(`SELECT nome, cat, sitio, lat, lon, imp FROM locais WHERE id IN (SELECT rowid FROM locais_fts WHERE locais_fts MATCH ? LIMIT 200)`).all(fts) as any[])
        .filter((l) => norm(l.nome) === norm(nome) && POVOACOES.includes(l.cat)).sort((a, b) => b.imp - a.imp);
    } catch { /* sem índice */ }
  }
  const c = norm(concelho);
  const noConcelho = linhas.filter((l) => dentroDePortugal(l.lat, l.lon) && (!c || norm(l.sitio) === c || (!l.sitio && norm(l.nome) === c)));
  const l = noConcelho[0] || (c ? null : linhas.find((x) => dentroDePortugal(x.lat, x.lon)));
  return l ? { lat: Number(l.lat), lon: Number(l.lon) } : null;
}

/** Posição de uma ocorrência guardada (ou null: fica fora do mapa) */
export function posicaoDaOcorrencia(d: any): PosicaoOcorrencia | null {
  const lat = Number(d?.latitude), lon = Number(d?.longitude);
  if (dentroDePortugal(lat, lon)) return { lat, lon, aproximada: !!d?.posicaoAproximada };
  const concelho = String(d?.concelho || '').trim();
  const local = String(d?.locationDetails || '').trim();
  const chave = `${norm(local)}|${norm(concelho)}`;
  if (memo.has(chave)) return memo.get(chave)!;
  let db: any;
  try { db = getDatabase(); } catch { return null; }
  let r: PosicaoOcorrencia | null = null;
  // a localidade escrita («Buarcos», «Paço de Arcos»): cada parte separada por vírgulas, da mais concreta para a mais larga
  for (const parte of local.split(/[,;·/]| - /).map((x) => x.trim()).filter(Boolean)) {
    const p = localidade(db, parte, concelho);
    if (p) { r = { ...p, aproximada: true }; break; }
  }
  // senão, o concelho (a sede: cidade ou vila com o mesmo nome)
  if (!r && concelho) {
    const p = localidade(db, concelho, '');
    if (p) r = { ...p, aproximada: true };
  }
  // só se guarda o que se encontrou (no arranque a base de locais pode ainda não estar pronta)
  if (r) { memo.set(chave, r); if (memo.size > 5000) memo.clear(); }
  return r;
}

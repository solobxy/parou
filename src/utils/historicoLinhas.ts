// Memória local do separador Horários: linhas abertas (recentes e mais vistas), pesquisas recentes
// e as linhas que estavam perto da última vez que houve localização. Fica só neste telemóvel.
const CHAVE_VISTAS = 'parou_linhas_vistas';
const CHAVE_PESQUISAS = 'parou_pesquisas_linhas';
const CHAVE_PERTO = 'parou_linhas_perto_guardadas';

interface Vista { id: string; n: number; ultima: number }

function ler<T>(chave: string, defeito: T): T {
  try { const v = JSON.parse(localStorage.getItem(chave) || 'null'); return v ?? defeito; } catch { return defeito; }
}
function gravar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

/** Regista que a linha foi aberta */
export function registarLinhaVista(id: string): void {
  if (!id) return;
  const lista = ler<Vista[]>(CHAVE_VISTAS, []).filter((v) => v && v.id);
  const v = lista.find((x) => x.id === id);
  if (v) { v.n += 1; v.ultima = Date.now(); } else lista.push({ id, n: 1, ultima: Date.now() });
  gravar(CHAVE_VISTAS, lista.sort((a, b) => b.ultima - a.ultima).slice(0, 40));
}

/** As linhas que a pessoa mais usa: mistura frequência e há quanto tempo (as recentes pesam mais) */
export function linhasPreferidas(max = 8): string[] {
  const agora = Date.now();
  return ler<Vista[]>(CHAVE_VISTAS, [])
    .filter((v) => v && v.id)
    .map((v) => ({ id: v.id, peso: v.n / (1 + (agora - v.ultima) / (7 * 86400_000)) }))
    .sort((a, b) => b.peso - a.peso)
    .slice(0, max)
    .map((v) => v.id);
}

export function esquecerLinhasVistas(): void {
  try { localStorage.removeItem(CHAVE_VISTAS); } catch {}
}

/** Pesquisas recentes (texto), sem repetidos, a mais recente primeiro */
export function registarPesquisa(texto: string): void {
  const q = texto.trim();
  if (q.length < 2) return;
  const lista = ler<string[]>(CHAVE_PESQUISAS, []).filter((x) => typeof x === 'string' && x.toLowerCase() !== q.toLowerCase());
  gravar(CHAVE_PESQUISAS, [q, ...lista].slice(0, 8));
}
export function pesquisasRecentes(): string[] {
  return ler<string[]>(CHAVE_PESQUISAS, []).filter((x) => typeof x === 'string').slice(0, 6);
}
export function esquecerPesquisas(): void {
  try { localStorage.removeItem(CHAVE_PESQUISAS); } catch {}
}

/** Linhas que estavam perto da última vez que houve localização */
export function guardarLinhasPerto(ids: string[]): void {
  if (!ids.length) return;
  gravar(CHAVE_PERTO, { ids: ids.slice(0, 12), quando: Date.now() });
}
export function linhasPertoGuardadas(): { ids: string[]; quando: number } | null {
  const v = ler<{ ids: string[]; quando: number } | null>(CHAVE_PERTO, null);
  if (!v || !Array.isArray(v.ids) || !v.ids.length) return null;
  // Mais de 60 dias: provavelmente já não interessa
  if (Date.now() - Number(v.quando || 0) > 60 * 86400_000) return null;
  return v;
}

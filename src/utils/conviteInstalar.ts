// Quando convidar a pôr a PAROU no ecrã principal (regras puras, testadas em auditoria/convite-instalar.mjs).
//
// Porquê: quem tem a app instalada volta muito mais (67% na 1.ª semana, contra 8% de quem só usa o site, out–nov 2026).
// Mas um convite logo à entrada é ruído: só aparece depois de a pessoa ter tido valor (abriu uma opção de viagem, viu as
// partidas de uma paragem ou o horário de uma linha), uma vez por sessão, e quem diz "agora não" fica sossegado semanas.

export const CHAVE_CONVITE = 'parou_convite_instalar';
/** Chave antiga de quem já fechou um aviso de instalar (e a que os testes automáticos usam para não o verem) */
export const CHAVE_AVISO_ANTIGO = 'parou_aviso_instalar';
export const CHAVE_SESSAO = 'parou_convite_visto';

const DIA = 24 * 3600_000;

export interface MemoriaConvite {
  /** quando a pessoa fechou o convite pela última vez (ms) */
  fechadoEm: number | null;
  /** quantas vezes o fechou */
  vezes: number;
}

export interface EstadoConvite {
  instalada: boolean;
  /** telemóvel ou tablet (no computador instala-se pelo menu, sem convite) */
  telemovel: boolean;
  /** navegador automático (testes, robôs) */
  robo: boolean;
  avisoAntigoFechado: boolean;
  jaMostradoNestaSessao: boolean;
  memoria: MemoriaConvite;
  agora: number;
}

/** Dias de sossego depois de fechar: 14 à primeira, 45 à segunda; à terceira não volta a aparecer */
export function diasDeSossego(vezes: number): number | null {
  if (vezes <= 0) return 0;
  if (vezes === 1) return 14;
  if (vezes === 2) return 45;
  return null;
}

export function deveConvidar(e: EstadoConvite): boolean {
  if (e.instalada || !e.telemovel || e.robo || e.avisoAntigoFechado || e.jaMostradoNestaSessao) return false;
  const sossego = diasDeSossego(e.memoria.vezes);
  if (sossego === null) return false;
  if (e.memoria.fechadoEm !== null && e.agora - e.memoria.fechadoEm < sossego * DIA) return false;
  return true;
}

export function lerMemoria(texto: string | null): MemoriaConvite {
  try {
    const m = JSON.parse(texto || 'null');
    const fechadoEm = Number.isFinite(m?.fechadoEm) ? Number(m.fechadoEm) : null;
    const vezes = Number.isFinite(m?.vezes) && m.vezes > 0 ? Math.min(10, Math.floor(m.vezes)) : 0;
    return { fechadoEm, vezes };
  } catch {
    return { fechadoEm: null, vezes: 0 };
  }
}

export function memoriaDepoisDeFechar(m: MemoriaConvite, agora: number): MemoriaConvite {
  return { fechadoEm: agora, vezes: m.vezes + 1 };
}

/** Navegador dentro de outra app (ChatGPT, Instagram, Facebook…): aí não se instala, abre-se primeiro no browser */
export function dentroDeOutraApp(ua: string): boolean {
  return /\bFBAN|\bFBAV|Instagram|LinkedInApp|Line\/|Twitter|TikTok|musical_ly|Snapchat|Pinterest|GSA\/|; wv\)|ChatGPT|OpenAI/i.test(ua);
}

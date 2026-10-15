// Temas da app: Claro (o de sempre, para toda a gente), Escuro, Âmbar (laranja, mais "premium") e Azul Porto (azul e branco).
// A escolha fica guardada neste aparelho. O <html> leva data-tema="escuro", "ambar" ou "porto" (o claro não leva nada),
// e é o CSS (gerado no build a partir das cores da app, ver vite.temas.ts, e src/temas.css) que muda as cores.
export type TemaId = 'claro' | 'escuro' | 'ambar' | 'porto';

export interface InfoTema {
  id: TemaId;
  nome: string;
  descricao: string;
  /** Cor da barra do telemóvel (theme-color) */
  corBarra: string;
  /** Cores da miniatura: fundo, cartão, texto, destaque */
  mini: { fundo: string; cartao: string; texto: string; destaque: string };
}

export const TEMAS: InfoTema[] = [
  { id: 'claro', nome: 'Claro', descricao: 'O de sempre', corBarra: '#FFFFFF', mini: { fundo: '#F4F4F2', cartao: '#FFFFFF', texto: '#111111', destaque: '#FF6B1A' } },
  { id: 'escuro', nome: 'Escuro', descricao: 'Descansa a vista à noite', corBarra: '#161618', mini: { fundo: '#0F0F10', cartao: '#222225', texto: '#F2F2F0', destaque: '#FF6B1A' } },
  { id: 'ambar', nome: 'Âmbar', descricao: 'Mais laranja, em vidro', corBarra: '#FFE9D2', mini: { fundo: '#FFD9B5', cartao: '#FFF4E8', texto: '#2A170B', destaque: '#FF6B1A' } },
  { id: 'porto', nome: 'Azul Porto', descricao: 'Azul e branco, à moda do Porto', corBarra: '#FFFFFF', mini: { fundo: '#EDF2FA', cartao: '#FFFFFF', texto: '#0B1A36', destaque: '#0B46B0' } },
];

const CHAVE = 'parou_tema';
export const EVENTO_TEMA = 'parou_tema_mudou';

export function eTemaValido(x: unknown): x is TemaId {
  return x === 'claro' || x === 'escuro' || x === 'ambar' || x === 'porto';
}

export function temaGuardado(): TemaId {
  try {
    const v = localStorage.getItem(CHAVE);
    return eTemaValido(v) ? v : 'claro';
  } catch { return 'claro'; }
}

export function temaAtual(): TemaId {
  const v = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-tema') : null;
  return eTemaValido(v) ? v : 'claro';
}

/** Aplica o tema ao documento (sem guardar). */
export function aplicarTema(id: TemaId) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (id === 'claro') html.removeAttribute('data-tema'); else html.setAttribute('data-tema', id);
  const info = TEMAS.find((x) => x.id === id) || TEMAS[0];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', info.corBarra);
  const esquema = document.querySelector('meta[name="color-scheme"]');
  if (esquema) esquema.setAttribute('content', id === 'escuro' ? 'dark' : 'light');
}

/** Muda de tema, guarda a escolha neste aparelho e avisa quem estiver a ouvir. */
export function mudarTema(id: TemaId) {
  aplicarTema(id);
  try { if (id === 'claro') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, id); } catch { /* sem armazenamento: vale só até fechar */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: id })); } catch { /* ignora */ }
}

/** Arranque: repõe o tema guardado (o script do index.html já o fez antes de pintar; isto só garante a barra). */
export function iniciarTema() {
  aplicarTema(temaGuardado());
}

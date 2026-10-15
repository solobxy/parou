// Se a app pode perguntar «Estás no autocarro …?». Ligado por omissão; desliga-se no próprio aviso ou na janela «A tua localização».
// Fica só neste aparelho.
const CHAVE = 'parou_abordo_desligado';
export const EVENTO_ABORDO = 'parou_abordo_mudou';

export function abordoLigado(): boolean {
  try { return localStorage.getItem(CHAVE) !== '1'; } catch { return true; }
}

export function definirAbordo(ligado: boolean): void {
  try { if (ligado) localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento: vale até fechar */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_ABORDO, { detail: ligado })); } catch { /* ignora */ }
}

// Distâncias escritas por extenso ("120 metros"): "12 m" confunde-se com "12 minutos".
import { tn } from '../i18n';

/** "1 metro", "120 metros" */
export function textoMetros(metros: number): string {
  const n = Math.max(0, Math.round(metros));
  return tn(n, '{n} metro', '{n} metros');
}

/** Converte "120 m" (como o servidor escreve) em "120 metros"; "1,4 km" fica igual */
export function traduzirDistancia(texto: string): string {
  const m = /^(\d+)\s*m$/.exec(texto.trim());
  return m ? textoMetros(Number(m[1])) : texto;
}

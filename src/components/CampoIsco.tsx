/**
 * Campo isco contra robôs: invisível para pessoas (fora do ecrã, sem foco com o Tab, escondido dos leitores de ecrã) mas os
 * robôs que preenchem todos os campos de um formulário enchem-no. O nome não parece nada que o preenchimento automático do
 * browser conheça. Quando tem texto, os pedidos levam o cabeçalho x-parou-isco e o servidor finge que aceitou sem guardar.
 */
export function CampoIsco() {
  return (
    <input
      type="text"
      name="cx_ref_2"
      data-isco=""
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      defaultValue=""
      style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );
}

/** Algum campo isco visível na página foi preenchido? */
export function iscoPreenchido(): boolean {
  try {
    return Array.from(document.querySelectorAll<HTMLInputElement>('input[data-isco]')).some((i) => i.value.trim() !== '');
  } catch {
    return false;
  }
}

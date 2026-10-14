// O Safari do iPhone aumenta a página sozinho quando se toca num campo de texto com letra menor que 16 px, e não
// volta ao tamanho normal. No Perto (ecrã fixo, onde o gesto de ampliar com dois dedos está bloqueado) a pessoa
// ficava com a app "grande demais" e sem maneira de a reduzir. Os campos têm agora 16 px (ver index.css); isto é a
// rede de segurança: se mesmo assim a página ficar ampliada sem a pessoa ter pedido, repõe o tamanho normal.

function campoDeTexto(alvo: EventTarget | null): boolean {
  const e = alvo as HTMLElement | null;
  if (!e || !e.tagName) return false;
  const tag = e.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const tipo = (e as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'file', 'color', 'button', 'submit', 'image', 'hidden'].includes(tipo);
  }
  return e.isContentEditable === true;
}

/** Volta à escala 1: o iOS refaz o zoom quando a página muda o limite de escala e o repõe logo a seguir. */
export function reporZoom() {
  try {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    if (/maximum-scale/.test(original)) return; // já está a repor
    meta.setAttribute('content', original + ', maximum-scale=1.0');
    window.setTimeout(() => meta.setAttribute('content', original), 350);
  } catch {
    /* sem efeito: a página continua utilizável */
  }
}

export function iniciarSegurancaZoom() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const vv = window.visualViewport;
  if (!vv) return;
  const html = document.documentElement;
  let escalaAntes = 1;
  let ampliouSozinho = false;
  let temporizador = 0;

  const bloqueada = () => html.classList.contains('pagina-fixa');
  const ampliada = () => vv.scale > 1.02;

  document.addEventListener('focusin', (e) => {
    if (campoDeTexto(e.target)) {
      escalaAntes = vv.scale;
      ampliouSozinho = false;
    }
  });

  vv.addEventListener('resize', () => {
    const foco = document.activeElement;
    if (foco && campoDeTexto(foco) && vv.scale > escalaAntes * 1.05) ampliouSozinho = true;
    // Ecrã onde ampliar está bloqueado e a página está ampliada: ninguém pediu isto
    if (bloqueada() && ampliada() && !(foco && campoDeTexto(foco))) {
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(() => { if (bloqueada() && ampliada()) reporZoom(); }, 250);
    }
  });

  document.addEventListener('focusout', (e) => {
    if (!campoDeTexto(e.target)) return;
    window.setTimeout(() => {
      if (ampliouSozinho || (bloqueada() && ampliada())) {
        ampliouSozinho = false;
        reporZoom();
      }
    }, 150);
  });
}

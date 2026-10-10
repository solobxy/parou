// Portão para o Firebase: o SDK (contas e ocorrências da comunidade) é pesado, por isso só se
// descarrega depois de a app abrir, ou quando alguém precisa dele (entrar, reportar, votar).
// Assim o primeiro ecrã aparece mais depressa no telemóvel.
import type { User } from 'firebase/auth';

type ModuloFirebase = typeof import('./firebase');
let pedido: Promise<ModuloFirebase> | null = null;

export function carregarFirebase(): Promise<ModuloFirebase> {
  if (!pedido) {
    pedido = import('./firebase').catch((err) => {
      pedido = null; // deixa tentar outra vez (ex.: estava sem rede)
      throw err;
    });
  }
  return pedido;
}

/** Carrega o Firebase quando o browser estiver livre (sem atrasar o primeiro ecrã) */
export function carregarFirebaseMaisTarde(ms = 1800): void {
  const ir = () => { void carregarFirebase().catch(() => {}); };
  const w = window as any;
  setTimeout(() => (typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(ir, { timeout: 3000 }) : ir()), ms);
}

// Sessão atual (fica a saber quando o Firebase carrega e quando se entra ou sai)
let utilizadorAtual: User | null = null;
const ouvintes = new Set<(u: User | null) => void>();
let aObservar = false;

function comecarAObservar() {
  if (aObservar) return;
  aObservar = true;
  // Espera um pouco (o primeiro ecrã primeiro); se entretanto alguém precisar do Firebase, já está a vir
  const ligar = () => carregarFirebase()
    .then((fb) => {
      fb.observarSessao((u) => {
        utilizadorAtual = u;
        ouvintes.forEach((f) => { try { f(u); } catch {} });
      });
    })
    .catch(() => { aObservar = false; });
  setTimeout(ligar, 1200);
}

/** Utilizador com sessão iniciada (null se ainda não carregou ou não há sessão) */
export function utilizadorFirebase(): User | null {
  return utilizadorAtual;
}

/** Como o onAuthStateChanged, mas sem obrigar a carregar o Firebase logo no arranque */
export function observarSessao(cb: (u: User | null) => void): () => void {
  ouvintes.add(cb);
  comecarAObservar();
  return () => { ouvintes.delete(cb); };
}

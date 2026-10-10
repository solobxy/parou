// Aviso anónimo ao servidor de que a app foi aberta, para sabermos quantas pessoas usam a PAROU.
// O servidor dá a cada telemóvel um número aleatório (cookie) e conta cada pessoa uma só vez por dia.
// Não vai IP, posição, conta nem dados pessoais. Explicado na página de Privacidade (com opção de desligar).
// Ver src/server/estatisticas.ts.
import { idioma } from '../i18n';

type Origem = 'android' | 'instalada' | 'site';

/** Como a app foi aberta: app Android da Play Store, app instalada no ecrã principal, ou site no browser. */
function detetarOrigem(): Origem {
  try {
    if (document.referrer.startsWith('android-app://')) return 'android';
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true) return 'instalada';
  } catch {}
  return 'site';
}

const MEIA_HORA = 30 * 60_000;
let iniciado = false;
let ultimoAviso = 0;
let origem: Origem = 'site';

function avisar() {
  ultimoAviso = Date.now();
  try {
    void fetch('/api/estatisticas/visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ o: origem, i: idioma }),
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/** Chamar uma vez ao arrancar. Conta a abertura e, se a app ficar aberta em segundo plano, a volta a ela passada meia hora. */
export function iniciarContagem() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  try { if ((navigator as any).webdriver) return; } catch {} // testes automáticos não contam
  origem = detetarOrigem(); // lido no arranque: é aqui que o Android indica que veio da app
  const quandoVisivel = () => {
    if (document.visibilityState === 'visible' && Date.now() - ultimoAviso > MEIA_HORA) avisar();
  };
  quandoVisivel();
  document.addEventListener('visibilitychange', quandoVisivel);
}

/** Para a página de Privacidade: a pessoa quer ser contada? (null = não foi possível saber) */
export async function lerPreferenciaContagem(): Promise<boolean | null> {
  try {
    const r = await fetch('/api/estatisticas/estado', { credentials: 'same-origin' });
    if (!r.ok) return null;
    return (await r.json()).contar !== false;
  } catch {
    return null;
  }
}

export async function mudarPreferenciaContagem(contar: boolean): Promise<boolean> {
  try {
    const r = await fetch('/api/estatisticas/preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contar }),
      credentials: 'same-origin',
    });
    return r.ok;
  } catch {
    return false;
  }
}

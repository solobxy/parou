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
let diaDoUltimoAviso = '';
let pendente = false; // o último aviso não chegou (sem rede ou servidor ocupado): tenta outra vez
let origem: Origem = 'site';

const diaDeLisboa = (): string => {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }); } catch { return ''; }
};

async function enviar(): Promise<boolean> {
  try {
    const r = await fetch('/api/estatisticas/visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ o: origem, i: idioma }),
      credentials: 'same-origin',
      keepalive: true,
    });
    // 4xx = o servidor recusou de propósito (ex.: contagem desligada): não insiste. 5xx/429: tenta outra vez.
    return r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429);
  } catch {
    return false;
  }
}

function avisar() {
  ultimoAviso = Date.now();
  diaDoUltimoAviso = diaDeLisboa();
  void enviar().then((ok) => {
    if (ok) return;
    pendente = true;
    // Sem rede quando a app abriu: avisa assim que voltar (ou daqui a um minuto, uma vez)
    setTimeout(repetir, 60_000);
  });
}

function repetir() {
  if (!pendente || document.visibilityState !== 'visible') return;
  pendente = false;
  void enviar().then((ok) => { if (!ok) pendente = true; });
}

/** Chamar uma vez ao arrancar. Conta a abertura e, se a app ficar aberta em segundo plano, a volta a ela passada meia hora (ou num novo dia). */
export function iniciarContagem() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  try { if ((navigator as any).webdriver) return; } catch {} // testes automáticos não contam
  origem = detetarOrigem(); // lido no arranque: é aqui que o Android indica que veio da app
  const quandoVisivel = () => {
    if (document.visibilityState !== 'visible') return;
    // Passada meia hora, ou a meia-noite passou (quem deixa a app aberta de um dia para o outro conta no dia novo)
    if (Date.now() - ultimoAviso > MEIA_HORA || (diaDoUltimoAviso && diaDeLisboa() !== diaDoUltimoAviso)) avisar();
    else if (pendente) repetir();
  };
  quandoVisivel();
  document.addEventListener('visibilitychange', quandoVisivel);
  window.addEventListener('online', repetir);
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

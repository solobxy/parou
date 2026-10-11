// Janelas (modais, folhas, painéis) ligadas ao botão/gesto "voltar" do telemóvel.
//
// Cada janela aberta ocupa uma entrada no histórico do browser. Assim:
//  - o gesto de voltar (ou o botão do Android) fecha a janela em vez de sair da página;
//  - fechar pelo X tira essa entrada, para o "voltar" seguinte não parecer não fazer nada;
//  - mudar de separador fecha todas as janelas (fecharJanelas) e a nova página ocupa o lugar delas.
//
// As entradas das janelas têm o estado { parou: nível }. Nível 0 = página normal. Uma entrada com nível
// maior do que o da janela aberta mais alta já não tem janela ("morta"): ao chegar a ela, salta-se.
import { useEffect, useRef } from 'react';

interface Janela { nivel: number; fechar: () => void; ativa: boolean }

const pilha: Janela[] = [];
const proprios: number[] = []; // validade dos "voltar" que fomos nós a pedir (não são do utilizador)
let limpezaAgendada = false;
let emSalto = false; // a saltar entradas mortas: o último evento tem de chegar aos outros ouvintes
let reenviando = false;

function estadoBase(): Record<string, unknown> {
  const s = window.history.state;
  if (s && typeof s === 'object') {
    const copia = { ...(s as Record<string, unknown>) };
    delete copia.parou;
    return copia;
  }
  return {};
}
function nivelAtual(): number {
  const n = (window.history.state as { parou?: unknown } | null)?.parou;
  return typeof n === 'number' ? n : 0;
}
function nivelDoTopo(): number {
  return pilha.length ? pilha[pilha.length - 1].nivel : 0;
}

function recuar(n: number) {
  proprios.push(Date.now() + 800);
  try { window.history.go(-n); } catch {}
}
function eraProprio(): boolean {
  const agora = Date.now();
  while (proprios.length && proprios[0] < agora) proprios.shift();
  return proprios.shift() !== undefined;
}

/** Tira do histórico as entradas de janelas que já fecharam (as que estão por cima, sem janela). */
function agendarLimpeza() {
  if (limpezaAgendada) return;
  limpezaAgendada = true;
  setTimeout(() => {
    limpezaAgendada = false;
    const sobram = nivelAtual() - nivelDoTopo();
    if (sobram > 0) recuar(sobram);
  }, 0);
}

function abrir(fechar: () => void): Janela {
  const d = nivelAtual();
  const j: Janela = { nivel: d + 1, fechar, ativa: true };
  try {
    if (d > nivelDoTopo()) {
      // Uma janela acabou de fechar neste mesmo momento: aproveita a entrada dela
      j.nivel = d;
      window.history.replaceState({ ...estadoBase(), parou: d }, '', window.location.href);
    } else {
      window.history.pushState({ ...estadoBase(), parou: j.nivel }, '', window.location.href);
    }
  } catch {}
  pilha.push(j);
  return j;
}

function fecharPelaInterface(j: Janela) {
  if (!j.ativa) return;
  j.ativa = false;
  const i = pilha.indexOf(j);
  if (i >= 0) pilha.splice(i, 1);
  agendarLimpeza();
}

/**
 * Fecha todas as janelas abertas (ex.: ao mudar de separador). As entradas delas ficam no histórico
 * até a navegação seguinte as ocupar (navegarHistorico).
 */
export function fecharJanelas() {
  const lista = pilha.splice(0);
  for (const j of lista) {
    j.ativa = false;
    try { j.fechar(); } catch {}
  }
  if (lista.length) agendarLimpeza();
}

/**
 * Vai para outro endereço. Se havia janelas abertas por cima da página, a nova página ocupa o lugar delas,
 * por isso o histórico fica [página anterior → nova página] sem entradas a mais.
 */
export function navegarHistorico(estado: unknown, url: string) {
  try {
    if (nivelAtual() > nivelDoTopo()) window.history.replaceState(estado, '', url);
    else window.history.pushState(estado, '', url);
  } catch {}
}

/** Há alguma janela aberta neste momento? */
export function haJanelasAbertas(): boolean {
  return pilha.length > 0;
}

if (typeof window !== 'undefined') {
  // Registado antes de qualquer outro ouvinte: assim pode impedir que os outros reajam a um "voltar"
  // que só serviu para fechar uma janela.
  window.addEventListener('popstate', (e) => {
    if (reenviando) { reenviando = false; return; }
    const d = nivelAtual();
    let tratado = eraProprio();
    while (pilha.length && pilha[pilha.length - 1].nivel > d) {
      const j = pilha.pop()!;
      j.ativa = false;
      try { j.fechar(); } catch {}
      tratado = true;
    }
    if (d > nivelDoTopo()) {
      // Entrada de uma janela que já não existe: continua a voltar
      emSalto = true;
      recuar(1);
      e.stopImmediatePropagation();
      return;
    }
    if (emSalto) {
      // Aterrou numa entrada com página: os outros ouvintes têm de saber (um aviso novo, sem este)
      emSalto = false;
      e.stopImmediatePropagation();
      setTimeout(() => {
        reenviando = true;
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
        reenviando = false;
      }, 0);
      return;
    }
    if (tratado) e.stopImmediatePropagation();
  });
}

/**
 * Liga uma janela ao "voltar" do telemóvel: enquanto `aberto` for verdadeiro, o gesto de voltar chama
 * `aoFechar`. Usar no componente da janela (antes de qualquer `return null`).
 */
export function useVoltarFecha(aberto: boolean, aoFechar: () => void) {
  const ref = useRef(aoFechar);
  ref.current = aoFechar;
  useEffect(() => {
    if (!aberto) return;
    const j = abrir(() => ref.current());
    return () => fecharPelaInterface(j);
  }, [aberto]);
}

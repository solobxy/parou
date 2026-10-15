import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { fetchVeiculos, type Caixa } from '../services/veiculosApi';
import type { VeiculoLeve } from '../types/aBordo';
import { t } from '../i18n';

// Autocarros em direto no mapa (STCP e Carris Metropolitana): só os das linhas pedidas, perto do que a pessoa está a ver.
// A posição é a que o operador envia; mexe-se de 15 em 15 segundos, e o marcador desliza até lá em vez de saltar.

const INTERVALO_MS = 15_000;
const DURACAO_DESLIZE_MS = 1_600;
/** Posição com mais de 75 s: o autocarro fica esbatido (pode já não estar ali) */
const IDADE_ESBATIDA_S = 75;

const escapar = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Marcador de um autocarro: o número da linha numa etiqueta, com uma seta a apontar para onde vai */
function iconeAutocarro(v: VeiculoLeve, esbatido: boolean, meu: boolean): L.DivIcon {
  const rumo = typeof v.rumo === 'number' ? Math.round(v.rumo / 10) * 10 : null;
  return L.divIcon({
    className: 'parou-bus-icone',
    html: `<div class="bus-pin${esbatido ? ' bus-pin--esbatido' : ''}${meu ? ' bus-pin--meu' : ''}">${rumo === null ? '' : `<i class="bus-pin__seta" style="transform:rotate(${rumo}deg)"></i>`}<b class="bus-pin__num">${escapar(v.linha)}</b></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

interface Entrada {
  marker: L.Marker;
  v: VeiculoLeve;
  chaveIcone: string;
  raf: number | null;
}

function conteudoPopup(v: VeiculoLeve, agoraS: number, aoEstarABordo?: (v: VeiculoLeve) => void): HTMLElement {
  const raiz = document.createElement('div');
  raiz.className = 'pp-bus';
  const titulo = document.createElement('div');
  titulo.className = 'pp-t text-[15px] font-bold';
  titulo.textContent = t('Linha {l}', { l: v.linha });
  raiz.appendChild(titulo);
  const idade = Math.max(0, Math.round(agoraS - v.t));
  const sub = document.createElement('div');
  sub.className = 'pp-f text-[12px]';
  sub.textContent = idade < 5 ? t('Posição agora mesmo') : t('Posição de há {s} s', { s: idade });
  raiz.appendChild(sub);
  if (aoEstarABordo) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'mt-2 h-11 w-full px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14px] font-bold cursor-pointer';
    botao.textContent = t('Estou a bordo');
    botao.setAttribute('data-teste', 'estou-a-bordo');
    botao.addEventListener('click', (e) => { e.stopPropagation(); aoEstarABordo(v); });
    raiz.appendChild(botao);
  }
  return raiz;
}

interface Props {
  mapa: L.Map | null;
  /** Chaves de linha ("stcp:803", "cm:4436"); vazio = não mostra nada */
  linhas: string[];
  /** Só os autocarros dentro desta caixa (menos marcadores e menos dados) */
  caixa?: Caixa;
  /** Autocarro em que a pessoa vai (fica destacado) */
  meu?: string | null;
  aoEstarABordo?: (v: VeiculoLeve) => void;
}

export function VeiculosNoMapa({ mapa, linhas, caixa, meu, aoEstarABordo }: Props) {
  const entradasRef = useRef<Map<string, Entrada>>(new Map());
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const agoraRef = useRef<number>(Math.floor(Date.now() / 1000));
  const aoEstarRef = useRef(aoEstarABordo);
  aoEstarRef.current = aoEstarABordo;
  const meuRef = useRef<string | null>(meu ?? null);
  meuRef.current = meu ?? null;

  const chaveLinhas = [...linhas].sort().join(',');
  const chaveCaixa = caixa ? [caixa.sul, caixa.oeste, caixa.norte, caixa.leste].map((x) => x.toFixed(4)).join(',') : '';

  // Destaque do autocarro "meu" sem esperar pelo próximo pedido
  useEffect(() => {
    entradasRef.current.forEach((e, id) => {
      const esbatido = agoraRef.current - e.v.t > IDADE_ESBATIDA_S;
      const chave = `${e.v.linha}|${typeof e.v.rumo === 'number' ? Math.round(e.v.rumo / 10) : '-'}|${esbatido ? 1 : 0}|${id === meu ? 1 : 0}`;
      if (chave !== e.chaveIcone) { e.marker.setIcon(iconeAutocarro(e.v, esbatido, id === meu)); e.chaveIcone = chave; }
    });
  }, [meu]);

  useEffect(() => {
    const entradas = entradasRef.current;
    const limpar = () => {
      entradas.forEach((e) => { if (e.raf !== null) cancelAnimationFrame(e.raf); e.marker.remove(); });
      entradas.clear();
      grupoRef.current?.remove();
      grupoRef.current = null;
    };
    if (!mapa || !linhas.length) { limpar(); return; }

    let ativo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let pedido: AbortController | null = null;
    const grupo = L.layerGroup().addTo(mapa);
    grupoRef.current = grupo;

    const deslizar = (e: Entrada, para: L.LatLng) => {
      if (e.raf !== null) cancelAnimationFrame(e.raf);
      const de = e.marker.getLatLng();
      if (de.distanceTo(para) < 1) { e.raf = null; return; }
      const inicio = performance.now();
      const passo = (agora: number) => {
        const f = Math.min(1, (agora - inicio) / DURACAO_DESLIZE_MS);
        e.marker.setLatLng([de.lat + (para.lat - de.lat) * f, de.lng + (para.lng - de.lng) * f]);
        e.raf = f < 1 ? requestAnimationFrame(passo) : null;
      };
      e.raf = requestAnimationFrame(passo);
    };

    const desenhar = (lista: VeiculoLeve[], agoraS: number) => {
      agoraRef.current = agoraS;
      const ids = new Set(lista.map((v) => v.id));
      entradas.forEach((e, id) => {
        if (ids.has(id)) return;
        if (e.raf !== null) cancelAnimationFrame(e.raf);
        e.marker.remove();
        entradas.delete(id);
      });
      for (const v of lista) {
        const esbatido = agoraS - v.t > IDADE_ESBATIDA_S;
        const eMeu = v.id === meuRef.current;
        const chave = `${v.linha}|${typeof v.rumo === 'number' ? Math.round(v.rumo / 10) : '-'}|${esbatido ? 1 : 0}|${eMeu ? 1 : 0}`;
        const atual = entradas.get(v.id);
        if (atual) {
          atual.v = v;
          if (chave !== atual.chaveIcone) { atual.marker.setIcon(iconeAutocarro(v, esbatido, eMeu)); atual.chaveIcone = chave; }
          deslizar(atual, L.latLng(v.lat, v.lon));
        } else {
          const marker = L.marker([v.lat, v.lon], {
            icon: iconeAutocarro(v, esbatido, eMeu),
            zIndexOffset: eMeu ? 1500 : 800,
            keyboard: true,
            title: t('Linha {l}', { l: v.linha }),
          });
          const entrada: Entrada = { marker, v, chaveIcone: chave, raf: null };
          marker.bindPopup(() => conteudoPopup(entrada.v, agoraRef.current, aoEstarRef.current), { closeButton: false, offset: [0, -14], autoPanPadding: [24, 90] });
          marker.addTo(grupo);
          entradas.set(v.id, entrada);
        }
      }
    };

    const carregar = async () => {
      if (!ativo) return;
      if (document.visibilityState === 'hidden') { temporizador = setTimeout(carregar, INTERVALO_MS); return; }
      pedido?.abort();
      pedido = new AbortController();
      try {
        const r = await fetchVeiculos({ linhas, caixa }, pedido.signal);
        if (ativo) desenhar(r.veiculos, r.agora);
      } catch {
        /* sem rede ou o servidor falhou: ficam os que já estão e tenta-se outra vez */
      }
      if (ativo) temporizador = setTimeout(carregar, INTERVALO_MS);
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible' && ativo) { if (temporizador) clearTimeout(temporizador); carregar(); } };
    document.addEventListener('visibilitychange', aoVoltar);
    carregar();

    return () => {
      ativo = false;
      if (temporizador) clearTimeout(temporizador);
      pedido?.abort();
      document.removeEventListener('visibilitychange', aoVoltar);
      limpar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chaveLinhas, chaveCaixa]);

  return null;
}

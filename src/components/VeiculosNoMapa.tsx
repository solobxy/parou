import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { fetchVeiculos, type Caixa } from '../services/veiculosApi';
import type { VeiculoLeve } from '../types/aBordo';
import { t } from '../i18n';

// Autocarros em direto no mapa (STCP, Carris Metropolitana e TUB): só os das linhas pedidas, perto do que a pessoa está a ver.
// A posição é a que o operador envia; mexe-se de 15 em 15 segundos, e o marcador desliza até lá em vez de saltar.
// Tocar num autocarro avisa a PertoView, que mostra o cartão «Estou a bordo» (um cartão da app, não uma janela do mapa, para não ficar tapado pelos botões do mapa).

const INTERVALO_MS = 15_000;
const DURACAO_DESLIZE_MS = 1_600;
/** Posição com mais de 75 s: o autocarro fica esbatido (pode já não estar ali) */
const IDADE_ESBATIDA_S = 75;

const escapar = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Marcador de um autocarro: uma roda com o número da linha lá dentro (azul STCP, amarelo Carris Metropolitana, vermelho TUB), com uma ponta a apontar para onde vai */
function iconeAutocarro(v: VeiculoLeve, esbatido: boolean, meu: boolean): L.DivIcon {
  const rumo = typeof v.rumo === 'number' ? Math.round(v.rumo / 10) * 10 : null;
  const n = Math.min(5, Math.max(1, String(v.linha || '').length));
  return L.divIcon({
    className: 'parou-bus-icone',
    html: `<div class="bus-pin bus-pin--${v.op}${esbatido ? ' bus-pin--esbatido' : ''}${meu ? ' bus-pin--meu' : ''}">${rumo === null ? '' : `<i class="bus-pin__seta" style="transform:rotate(${rumo}deg)"></i>`}<b class="bus-pin__num${n >= 3 ? ` bus-pin__num--${n}` : ''}">${escapar(v.linha)}</b></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

interface Entrada {
  marker: L.Marker;
  v: VeiculoLeve;
  chaveIcone: string;
  raf: number | null;
}

interface Props {
  mapa: L.Map | null;
  /** Chaves de linha ("stcp:803", "cm:4436", "tub:45"); vazio = não mostra nada */
  linhas: string[];
  /** Só os autocarros dentro desta caixa (menos marcadores e menos dados) */
  caixa?: Caixa;
  /** Autocarro em que a pessoa vai (fica destacado) */
  meu?: string | null;
  /** Tocar num autocarro: devolve-o, com a hora do servidor (segundos) para saber há quanto tempo é a posição */
  aoTocar?: (v: VeiculoLeve, agoraServidorS: number) => void;
}

export function VeiculosNoMapa({ mapa, linhas, caixa, meu, aoTocar }: Props) {
  const entradasRef = useRef<Map<string, Entrada>>(new Map());
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const agoraRef = useRef<number>(Math.floor(Date.now() / 1000));
  const aoTocarRef = useRef(aoTocar);
  aoTocarRef.current = aoTocar;
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
          marker.on('click', () => aoTocarRef.current?.(entrada.v, agoraRef.current));
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

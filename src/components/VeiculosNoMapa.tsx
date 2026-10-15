import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { fetchVeiculos } from '../services/veiculosApi';
import { caixaDoEcra, type Caixa } from '../utils/caixaVeiculos';
import type { VeiculoLeve } from '../types/aBordo';
import { t } from '../i18n';
import { MovimentoVeiculo, agoraDoServidor, atualizarRelogio, rodarPeloCaminhoMaisCurto, type Relogio } from '../utils/trajetoVeiculo';

// Autocarros em direto no mapa (STCP, Carris Metropolitana e TUB). Por defeito (`todos`) mostra TODOS os que estão no ecrã do mapa,
// de qualquer operador e linha, e acompanha o mapa quando a pessoa o arrasta ou afasta (até um raio de ~30 km; mais longe pede para aproximar).
// Só quando há uma linha escolhida (percurso aberto) ou a pessoa vai a bordo é que mostra só os autocarros dessa linha.
// Os operadores só enviam uma posição de 15 em 15 s (STCP de 30 em 30) e ela chega com 10 a 30 s de idade. Para o autocarro não
// «teleportar» de uma posição para a seguinte, o marcador não vai direto para a última posição: segue-a com um movimento suave
// (src/utils/trajetoVeiculo.ts), desenhado 30 vezes por segundo só para o que está à vista.
// Tocar num autocarro avisa a PertoView, que mostra o cartão «Estou a bordo» (um cartão da app, não uma janela do mapa, para não ficar tapado pelos botões do mapa).

/** De quanto em quanto tempo se pedem as posições ao servidor (ms); o servidor só as renova de ~10 em 10 s */
const INTERVALO_MS = 6_000;
/** Imagens por segundo do movimento (a ~9 px/s num mapa muito ampliado, 30 imagens chegam para parecer contínuo) */
const QUADRO_MS = 33;
/** Com mais de 300 autocarros à vista (mapa afastado) pede-se de 10 em 10 s: a resposta é maior e as posições só mudam de ~15 em 15 s */
const MUITOS = 300;
const INTERVALO_MUITOS_MS = 10_000;
/** Até este nível de zoom (no modo «todos») os autocarros viram pontos coloridos sem número, para não taparem o mapa */
const ZOOM_PONTOS = 14;
/** Depois de o mapa parar de mexer, espera-se isto antes de pedir os autocarros da zona nova (ms) */
const ESPERA_MAPA_MS = 300;
/** Posição com mais de 75 s: o autocarro fica esbatido (pode já não estar ali) */
const IDADE_ESBATIDA_S = 75;
/** Rotação mínima (graus) para atualizar a ponta que aponta para onde vai */
const ROTACAO_MIN_GRAUS = 3;

/** Tempo entre imagens do movimento: com o mapa afastado um autocarro mexe menos de 0,3 px por imagem, por isso desenha-se menos vezes */
const intervaloQuadro = (zoom: number, n: number): number =>
  zoom >= 15 ? (n > 120 ? 2 * QUADRO_MS : QUADRO_MS) : zoom >= 14 ? 100 : zoom >= 13 ? 250 : 500;

const escapar = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Marcador de um autocarro: uma roda com o número da linha lá dentro (azul STCP, amarelo Carris Metropolitana, vermelho TUB), com uma ponta a apontar para onde vai */
function iconeAutocarro(v: VeiculoLeve): L.DivIcon {
  const n = Math.min(5, Math.max(1, String(v.linha || '').length));
  return L.divIcon({
    className: 'parou-bus-icone',
    // A ponta existe sempre (escondida até se saber o rumo): a rotação faz-se com transform e transição CSS, sem refazer o ícone
    html: `<div class="bus-pin bus-pin--${v.op}"><i class="bus-pin__seta bus-pin__seta--oculta"></i><b class="bus-pin__num${n >= 3 ? ` bus-pin__num--${n}` : ''}">${escapar(v.linha)}</b></div>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

interface Entrada {
  marker: L.Marker;
  v: VeiculoLeve;
  mov: MovimentoVeiculo;
  /** Linha e operador com que o ícone foi feito (se mudarem, refaz-se) */
  chaveIcone: string;
  pino: HTMLElement | null;
  seta: HTMLElement | null;
  /** Ângulo acumulado aplicado à ponta (pode passar de 360 para rodar sempre pelo lado mais curto) */
  rumoCss: number | null;
  esbatido: boolean;
  meu: boolean;
  /** Último desvio de subpixel aplicado ao pino (px) */
  fx: number;
  fy: number;
}

interface Props {
  mapa: L.Map | null;
  /** Chaves de linha ("stcp:803", "cm:4436", "tub:45"); com `todos` não conta */
  linhas: string[];
  /** Só os autocarros dentro desta caixa (percurso aberto) */
  caixa?: Caixa;
  /** Mostra todos os autocarros que estão no ecrã do mapa (qualquer operador e linha) e acompanha o mapa */
  todos?: boolean;
  /** Autocarro em que a pessoa vai (fica destacado) */
  meu?: string | null;
  /** Tocar num autocarro: devolve-o, com a hora do servidor (segundos) para saber há quanto tempo é a posição */
  aoTocar?: (v: VeiculoLeve, agoraServidorS: number) => void;
}

export function VeiculosNoMapa({ mapa, linhas, caixa, todos, meu, aoTocar }: Props) {
  const entradasRef = useRef<Map<string, Entrada>>(new Map());
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const relogioRef = useRef<Relogio | null>(null);
  const aoTocarRef = useRef(aoTocar);
  aoTocarRef.current = aoTocar;
  const meuRef = useRef<string | null>(meu ?? null);
  meuRef.current = meu ?? null;
  const estadoRef = useRef<() => void>(() => {});
  const caixaRef = useRef<Caixa | undefined>(caixa);
  caixaRef.current = caixa;
  const recarregarRef = useRef<() => void>(() => {});

  const chaveLinhas = [...linhas].sort().join(',');
  const chaveCaixa = caixa ? [caixa.sul, caixa.oeste, caixa.norte, caixa.leste].map((x) => x.toFixed(4)).join(',') : '';

  // Destaque do autocarro "meu" sem esperar pelo próximo pedido
  useEffect(() => { estadoRef.current(); }, [meu]);
  // Quando o mapa muda de zona, pedem-se logo os autocarros da zona nova; os que continuam à vista não se refazem (mantêm o movimento)
  useEffect(() => { recarregarRef.current(); }, [chaveCaixa]);

  useEffect(() => {
    const entradas = entradasRef.current;
    const esvaziar = () => {
      entradas.forEach((e) => e.marker.remove());
      entradas.clear();
    };
    const limpar = () => {
      esvaziar();
      grupoRef.current?.remove();
      grupoRef.current = null;
      relogioRef.current = null;
    };
    const emTodos = !!todos;
    if (!mapa || (!emTodos && !linhas.length)) { limpar(); estadoRef.current = () => {}; return; }

    let ativo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let pedido: AbortController | null = null;
    let quadro: number | null = null;
    let ultimoQuadro = 0;
    let ultimoEstado = 0;
    let aAmpliar = false;
    let inicioZoom = 0;
    const grupo = L.layerGroup().addTo(mapa);
    grupoRef.current = grupo;
    const contentor = mapa.getContainer();

    // Mapa muito afastado: não se pede nada e diz-se para aproximar (um aviso pequeno por cima do mapa)
    let dica: HTMLElement | null = null;
    if (emTodos) {
      dica = document.createElement('div');
      dica.className = 'bus-dica';
      dica.setAttribute('role', 'status');
      dica.hidden = true;
      dica.textContent = t('Aproxima o mapa para ver os autocarros em direto');
      contentor.appendChild(dica);
    }
    const mostrarDica = (v: boolean) => { if (dica) dica.hidden = !v; };
    // Com o mapa afastado os autocarros são pontos (ver .mapa-bus-ponto em index.css)
    const ajustarPontos = () => { contentor.classList.toggle('mapa-bus-ponto', emTodos && mapa.getZoom() <= ZOOM_PONTOS); };
    ajustarPontos();
    mapa.on('zoomend', ajustarPontos);

    const agoraServidor = (): number => {
      const r = relogioRef.current;
      return r ? agoraDoServidor(r, performance.now()) : Math.floor(Date.now() / 1000);
    };

    const ligarElementos = (e: Entrada) => {
      const el = e.marker.getElement();
      e.pino = (el?.querySelector('.bus-pin') as HTMLElement | null) ?? null;
      e.seta = (el?.querySelector('.bus-pin__seta') as HTMLElement | null) ?? null;
      e.rumoCss = null;
      e.esbatido = false;
      e.meu = false;
      e.fx = 0;
      e.fy = 0;
    };

    /** Esbatido e «meu» mexem só nas classes do pino (sem refazer o ícone) */
    const atualizarEstado = (e: Entrada, agoraS: number) => {
      if (!e.pino) return;
      const esbatido = agoraS - e.v.t > IDADE_ESBATIDA_S;
      const eMeu = e.v.id === meuRef.current;
      if (esbatido !== e.esbatido) { e.pino.classList.toggle('bus-pin--esbatido', esbatido); e.esbatido = esbatido; }
      if (eMeu !== e.meu) {
        e.pino.classList.toggle('bus-pin--meu', eMeu);
        e.marker.setZIndexOffset(eMeu ? 1500 : 800);
        e.meu = eMeu;
      }
    };

    const atualizarSeta = (e: Entrada, rumo: number | undefined) => {
      if (!e.seta) return;
      // Enquanto o movimento ainda não diz para onde vai, usa-se o rumo do operador, mas só se o autocarro vai em andamento
      const alvo = rumo ?? (typeof e.v.rumo === 'number' && (e.v.vel ?? 0) >= 8 ? e.v.rumo : undefined);
      if (alvo === undefined) return;
      if (e.rumoCss === null) {
        e.seta.style.transform = `rotate(${Math.round(alvo)}deg)`;
        e.rumoCss = alvo;
        e.seta.classList.remove('bus-pin__seta--oculta');
        // a transição só se liga depois da primeira rotação, para a ponta não rodar desde 0° ao aparecer
        requestAnimationFrame(() => e.seta?.classList.add('bus-pin__seta--anima'));
        return;
      }
      const novo = rodarPeloCaminhoMaisCurto(e.rumoCss, alvo);
      if (Math.abs(novo - e.rumoCss) >= ROTACAO_MIN_GRAUS) { e.seta.style.transform = `rotate(${Math.round(novo)}deg)`; e.rumoCss = novo; }
    };

    const posicionar = (e: Entrada, agoraS: number, visivel: L.LatLngBounds | null) => {
      const p = e.mov.mostrar(agoraS);
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      // Fora do ecrã não se mexe no DOM; quando voltar a estar à vista, o modelo já sabe onde ele está
      if (visivel && !visivel.contains([p.lat, p.lon])) return;
      e.marker.setLatLng([p.lat, p.lon]);
      // O Leaflet arredonda a posição ao pixel; o resto (menos de 1 px) aplica-se ao pino, para o movimento lento ser contínuo
      if (e.pino) {
        const pt = mapa.latLngToLayerPoint([p.lat, p.lon]);
        const fx = Math.round((pt.x - Math.round(pt.x)) * 10) / 10;
        const fy = Math.round((pt.y - Math.round(pt.y)) * 10) / 10;
        if (fx !== e.fx || fy !== e.fy) { e.pino.style.transform = `translate(${fx}px, ${fy}px)`; e.fx = fx; e.fy = fy; }
      }
      atualizarSeta(e, p.rumo);
    };

    const passo = (ts: number) => {
      quadro = requestAnimationFrame(passo);
      // Com muitos autocarros (centenas) desenha-se a metade das imagens por segundo, para não pesar no telemóvel
      if (ts - ultimoQuadro < intervaloQuadro(mapa.getZoom(), entradas.size) - 2) return;
      ultimoQuadro = ts;
      if (aAmpliar && ts - inicioZoom > 1500) aAmpliar = false; // se o fim do zoom se perder, não ficar parado
      if (!relogioRef.current || document.visibilityState === 'hidden' || aAmpliar) return;
      const agoraS = agoraServidor();
      const visivel = mapa.getBounds().pad(0.25);
      entradas.forEach((e) => posicionar(e, agoraS, visivel));
      if (ts - ultimoEstado > 1000) { ultimoEstado = ts; entradas.forEach((e) => atualizarEstado(e, agoraS)); }
    };
    // Durante a animação de zoom o Leaflet move os marcadores sozinho; mexer-lhes aqui dava saltos
    const aoComecarZoom = () => { aAmpliar = true; inicioZoom = performance.now(); };
    const aoAcabarZoom = () => { aAmpliar = false; };
    mapa.on('zoomanim', aoComecarZoom);
    mapa.on('zoomend', aoAcabarZoom);

    estadoRef.current = () => { const agoraS = agoraServidor(); entradas.forEach((e) => atualizarEstado(e, agoraS)); };

    const desenhar = (lista: VeiculoLeve[], agoraRespostaS: number) => {
      relogioRef.current = atualizarRelogio(relogioRef.current, agoraRespostaS, performance.now());
      const agoraS = agoraServidor();
      const ids = new Set(lista.map((v) => v.id));
      entradas.forEach((e, id) => {
        if (ids.has(id)) return;
        e.marker.remove();
        entradas.delete(id);
      });
      for (const v of lista) {
        const chave = `${v.op}|${v.linha}`;
        const fix = { t: v.t, lat: v.lat, lon: v.lon };
        let atual = entradas.get(v.id);
        if (atual && atual.chaveIcone !== chave) { atual.marker.remove(); entradas.delete(v.id); atual = undefined; }
        if (atual) {
          atual.v = v;
          atual.mov.receber(fix, agoraS);
          continue;
        }
        const mov = new MovimentoVeiculo(v.op);
        if (v.ant && v.ant.t < v.t) {
          // O servidor já traz a posição anterior: o autocarro aparece em movimento em vez de parado até chegar a seguinte
          mov.receber({ t: v.ant.t, lat: v.ant.lat, lon: v.ant.lon }, agoraS, Math.max(0, agoraS - v.t));
          mov.receber(fix, agoraS);
          mov.alinhar(agoraS);
        } else {
          mov.receber(fix, agoraS);
        }
        const p0 = mov.mostrar(agoraS);
        const marker = L.marker([p0.lat, p0.lon], {
          icon: iconeAutocarro(v),
          zIndexOffset: 800,
          keyboard: true,
          title: t('Linha {l}', { l: v.linha }),
        });
        const entrada: Entrada = { marker, v, mov, chaveIcone: chave, pino: null, seta: null, rumoCss: null, esbatido: false, meu: false, fx: 0, fy: 0 };
        marker.on('click', () => aoTocarRef.current?.(entrada.v, Math.floor(agoraServidor())));
        marker.addTo(grupo);
        ligarElementos(entrada);
        entradas.set(v.id, entrada);
        atualizarEstado(entrada, agoraS);
        atualizarSeta(entrada, p0.rumo);
      }
    };

    const carregar = async () => {
      if (!ativo) return;
      if (document.visibilityState === 'hidden') { temporizador = setTimeout(carregar, INTERVALO_MS); return; }
      pedido?.abort();
      const este = new AbortController();
      pedido = este;
      try {
        // «todos»: a caixa é o ecrã do mapa neste momento (com folga); as outras vistas usam a caixa que a PertoView dá
        let cx: Caixa | undefined = caixaRef.current;
        if (emTodos) {
          const b = mapa.getBounds();
          const r = caixaDoEcra({ sul: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), leste: b.getEast() });
          mostrarDica(r.longe === true);
          cx = r.caixa;
          if (!cx) esvaziar(); // mapa afastado de mais, ou fora de Portugal: não há nada para pedir
        }
        if (!emTodos || cx) {
          const r = await fetchVeiculos({ linhas: emTodos ? [] : linhas, caixa: cx }, este.signal);
          if (ativo) desenhar(r.veiculos, r.agora);
        }
      } catch {
        /* sem rede ou o servidor falhou: ficam os que já estão e tenta-se outra vez */
      }
      // Se o mapa mexeu enquanto este pedido andava, outro pedido tomou o seu lugar e é esse que marca o seguinte (senão acumulavam-se temporizadores)
      if (este.signal.aborted) return;
      if (ativo) temporizador = setTimeout(carregar, entradas.size > MUITOS ? INTERVALO_MUITOS_MS : INTERVALO_MS);
    };
    const recarregar = () => { if (ativo) { if (temporizador) clearTimeout(temporizador); carregar(); } };
    // O mapa mexeu (arrastou, zoom, mudou de tamanho): pedem-se os autocarros do ecrã novo quando ele parar
    let esperaMapa: ReturnType<typeof setTimeout> | null = null;
    const aoMexerMapa = () => {
      if (esperaMapa) clearTimeout(esperaMapa);
      esperaMapa = setTimeout(() => { esperaMapa = null; recarregar(); }, ESPERA_MAPA_MS);
    };
    if (emTodos) { mapa.on('moveend', aoMexerMapa); mapa.on('resize', aoMexerMapa); }
    const aoVoltar = () => { if (document.visibilityState === 'visible') recarregar(); };
    recarregarRef.current = recarregar;
    document.addEventListener('visibilitychange', aoVoltar);
    quadro = requestAnimationFrame(passo);
    carregar();

    return () => {
      ativo = false;
      if (temporizador) clearTimeout(temporizador);
      pedido?.abort();
      if (esperaMapa) clearTimeout(esperaMapa);
      if (quadro !== null) cancelAnimationFrame(quadro);
      document.removeEventListener('visibilitychange', aoVoltar);
      mapa.off('zoomanim', aoComecarZoom);
      mapa.off('zoomend', aoAcabarZoom);
      mapa.off('zoomend', ajustarPontos);
      mapa.off('moveend', aoMexerMapa);
      mapa.off('resize', aoMexerMapa);
      contentor.classList.remove('mapa-bus-ponto');
      dica?.remove();
      estadoRef.current = () => {};
      recarregarRef.current = () => {};
      limpar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa, chaveLinhas, todos]);

  return null;
}

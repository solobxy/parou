import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { 
  Compass, 
  Search, 
  X, 
  ZoomIn, 
  ZoomOut, 
  Clock, 
  AlertTriangle, 
  Star, 
  ChevronUp, 
  ChevronDown, 
  Bus, 
  Train, 
  Ship, 
  Radio, 
  RefreshCw, 
  Crosshair,
  LocateFixed,
  CornerDownRight,
  Footprints,
  MapPin,
  MapPinOff,
  Maximize2,
  Minimize2,
  TrainFront,
  TrainFrontTunnel,
  Navigation,
  ArrowLeft,
  ChevronRight,
  Plus
} from 'lucide-react';
import { useUserLocation } from '../hooks/useUserLocation';
import { passagensUnir, partidasParaMostrar, codigosUnir, viagemUnir, motivosFalhaUnir, type PassagemUnir } from '../services/unirAmp';
import { 
  fetchNearbyTransit, 
  searchDestinations, 
  planTransitRoute,
  getFavoriteStopIds,
  toggleFavoriteStopId,
  getFavoriteLineIds,
  toggleFavoriteLineId,
  type DadosLinhaFavorita
} from '../services/pertoApi';
import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  TransitRouteOption, 
  DestinationSuggestion,
} from '../types/perto';
import { CentralAlert } from '../types/alerts';
import { LineChip } from './LineChip';
import { AvisoPartida } from './AvisoPartida';
import { EtiquetaAtraso } from './EtiquetaAtraso';
import { InputPesquisa } from './InputPesquisa';
import { OpcaoRota } from './OpcaoRota';
import { RotaVariosDestinos, type MapaViagem } from './RotaVariosDestinos';
import { EditorParagens, linhaVazia, type LinhaEditor } from './EditorParagens';
import { MAX_DESTINOS, calcularTroco, novoUid, ordenarOpcoes, textoSemLigacao, type DestinoViagem, type LongeDeParagens } from '../services/rotaVarios';
import { textoMetros, traduzirDistancia } from '../utils/distancia';
import { opcoesComUnir } from '../services/hibridasUnir';
import { Logo } from './Logo';
import { formatTransitName, sortDepartures, parseDepartureTime, destinoLegivel } from '../utils/transitFormatter';
import { t, tn, LOCALE } from '../i18n';
import { carregarCelulas, celulasDosLimites, paragensNosLimites, aoChegarCelula, type ParagemLeve, type Limites } from './paragensDoMapa';
import { observarRumo, ligarBussola, rumoAtual } from '../utils/bussola';
import { observarPosicaoSuave, posicaoSuaveAtiva } from '../utils/posicaoSuave';
import { NotaLocalizacao, FolhaLocalizacao } from './PrivacidadeLocalizacao';
import { VeiculosNoMapa } from './VeiculosNoMapa';
import { useABordo, PerguntaABordo, PainelABordo, ABordoNoMapa } from './ABordo';
import { chaveDaPartida } from '../utils/chaveLinha';
import { AvisoPrecisaoMapa } from './AvisoPrecisaoMapa';
import { useQualidadeGps } from '../utils/qualidadeGps';

interface PertoViewProps {
  onSelectLineInSchedules?: (lineCode: string) => void;
  initialDestination?: { title: string; lat: number; lon: number } | null;
  onClearInitialDestination?: () => void;
  /** Abre os Favoritos (que vivem dentro do Perto) */
  onAbrirFavoritos?: () => void;
  totalFavoritos?: number;
  /** Abre a página de privacidade */
  onAbrirPrivacidade?: () => void;
}

// Normalize transport mode
// Símbolo e cor de cada tipo de transporte (mapa e cabeçalho da paragem)
const SVG_BUS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';
const SVG_COMBOIO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>';
const SVG_BARCO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10.2V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.4 20A11.6 11.6 0 0 0 21 14l-8.2-3.6a2 2 0 0 0-1.6 0L3 14a11.6 11.6 0 0 0 2.8 7.8"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>';
const SVG_METRO = '<span style="font:800 14px/1 Barlow, system-ui, sans-serif;color:#fff;letter-spacing:-.02em">M</span>';
/** "A carregar horários… 3/12" → traduz a frase e deixa o contador */
function traduzirCarregamento(msg: string): string {
  const m = /^(A carregar horários…)\s*(.*)$/.exec(msg);
  return m ? `${t(m[1])}${m[2] ? ' ' + m[2] : ''}` : t(msg);
}
/** Etiquetas dos percursos que vêm do servidor ("Direto", "2 transbordos", "A pé") */
function traduzirBadge(label: string): string {
  const m = /^(\d+) transbordos?$/.exec(label);
  return m ? tn(+m[1], '{n} transbordo', '{n} transbordos') : t(label);
}

export const ESTILO_MODO: Record<'Autocarro' | 'Metro' | 'Comboio' | 'Barco', { cor: string; plural: string; simbolo: string }> = {
  Autocarro: { cor: '#111111', plural: 'Autocarros', simbolo: SVG_BUS },
  Metro: { cor: '#D92D20', plural: 'Metros', simbolo: SVG_METRO },
  Comboio: { cor: '#1F7A3A', plural: 'Comboios', simbolo: SVG_COMBOIO },
  Barco: { cor: '#0E7490', plural: 'Barcos', simbolo: SVG_BARCO },
};

export function normalizeTransportMode(modeStr: string = ''): 'Autocarro' | 'Metro' | 'Comboio' | 'Barco' {
  const m = String(modeStr || '').toLowerCase();
  if (m.includes('metro') || m.includes('subway') || m.includes('tram') || m.includes('mst')) return 'Metro';
  if (m.includes('comboio') || m.includes('train') || m.includes('rail') || m.includes('fertagus') || m.includes('cp')) return 'Comboio';
  if (m.includes('barco') || m.includes('ferry') || m.includes('fluvial') || m.includes('navio')) return 'Barco';
  return 'Autocarro';
}

function isValidCoordinate(lat: unknown, lon: unknown): lat is number {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
  const nLat = Number(lat);
  const nLon = Number(lon);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLon) &&
    !isNaN(nLat) &&
    !isNaN(nLon) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLon >= -180 &&
    nLon <= 180
  );
}

// Ícones das paragens partilhados (um por tipo e estado): criar um novo por marcador a cada
// atualização era a maior fatia do trabalho do mapa
const iconesParagem = new Map<string, L.DivIcon>();
function iconeParagem(modo: 'Autocarro' | 'Metro' | 'Comboio' | 'Barco', selecionada: boolean, extra = false): L.DivIcon {
  const chave = `${modo}|${selecionada ? 1 : 0}|${extra ? 1 : 0}`;
  let icone = iconesParagem.get(chave);
  if (!icone) {
    const estilo = ESTILO_MODO[modo] || ESTILO_MODO.Autocarro;
    const tamanho = selecionada ? 34 : 26;
    icone = L.divIcon({
      className: 'custom-stop-marker-icon',
      html: `
        <div class="parou-pg${selecionada ? ' parou-pg-sel' : ''}${extra ? ' parou-pg-extra' : ''}" title="${estilo.plural}" style="width:${tamanho}px;height:${tamanho}px;background:${estilo.cor};border:2px solid #FFFFFF;border-radius:9999px;display:flex;align-items:center;justify-content:center;box-shadow:${selecionada ? '0 0 0 3px var(--cor-destaque,#FF6B1A), 0 4px 10px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.28)'};cursor:pointer;transition:transform .15s">
          ${estilo.simbolo}
        </div>
      `,
      iconSize: [tamanho, tamanho],
      iconAnchor: [tamanho / 2, tamanho / 2],
    });
    iconesParagem.set(chave, icone);
  }
  return icone;
}

// Paragens por onde se arrasta o mapa (além das que já vêm "perto de ti")
const ZOOM_MIN_EXTRAS = 15;        // mais afastado que isto seria um mar de marcadores
const MAX_EXTRAS_NOVOS = 400;      // marcadores a desenhar de cada vez (primeiro os do ecrã)
const MAX_EXTRAS_TOTAL = 450;      // teto de marcadores extra no mapa
const MARGEM_EXTRAS = 0.5;         // carrega e desenha meio ecrã além de cada lado
const MODO_DO_FILTRO = { autocarro: 'Autocarro', metro: 'Metro', comboio: 'Comboio', barco: 'Barco' } as const;

function limitesDoMapa(map: L.Map, margem: number): Limites {
  const b = map.getBounds().pad(margem);
  return { sul: b.getSouth(), oeste: b.getWest(), norte: b.getNorth(), este: b.getEast() };
}

/** Distância ao utilizador no formato do servidor; vazia se ainda não há posição */
function distanciaParaItem(de: { latitude: number; longitude: number } | null | undefined, lat: number, lon: number) {
  if (!de) return { distanceMeters: 0, formattedDistance: '', walkingMinutes: 0 };
  const m = Math.round(metrosEntre(de, { latitude: lat, longitude: lon }));
  if (!Number.isFinite(m)) return { distanceMeters: 0, formattedDistance: '', walkingMinutes: 0 };
  return {
    distanceMeters: m,
    formattedDistance: m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`,
    walkingMinutes: Math.max(1, Math.round(m / 80)),
  };
}

/** Paragem "leve" (só nome, sítio e modo) como cartão; as partidas chegam logo a seguir pelo painel */
function itemDeParagemLeve(p: ParagemLeve, de: { latitude: number; longitude: number } | null | undefined): NearbyStopItem {
  return {
    id: p.id,
    name: p.nome,
    operatorId: '',
    operatorName: p.op,
    transportMode: p.modo,
    latitude: p.lat,
    longitude: p.lon,
    locality: '',
    district: '',
    ...distanciaParaItem(de, p.lat, p.lon),
    lines: [],
    nextDepartures: [],
    activeAlerts: [],
    ...(p.unir?.length ? { unirIds: p.unir } : {}),
  };
}

/** Distância viva ao utilizador, no mesmo formato do servidor ("120 m", "1,4 km") */
function distanciaViva(de: { latitude: number; longitude: number } | null | undefined, stop: NearbyStopItem): { texto: string; minutos: number } | null {
  if (!de) return null;
  const m = Math.round(metrosEntre(de, stop));
  if (!Number.isFinite(m)) return null;
  return {
    texto: m >= 1000 ? `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000)} km` : textoMetros(m),
    minutos: Math.max(1, Math.round(m / 80)),
  };
}

/** Texto preto ou branco, conforme a cor de fundo (para o número da linha no mapa) */
function corTextoSobre(fundo?: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(fundo || '').trim());
  if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L_ = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L_ > 0.4 ? '#111111' : '#FFFFFF';
}

function escaparHtmlMapa(t: string): string {
  return String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Desenha no mapa os troços de uma opção de viagem: a pé a tracejado, transporte a laranja com as paragens e o número da linha */
function desenharPercurso(grupo: L.LayerGroup, legs: TransitRouteOption['legs'], limites: L.LatLngTuple[], etiquetas: boolean) {
  const nomeTip = (nome: string, extra?: string) =>
    `<span style="font:600 12px/1.2 Inter,system-ui,sans-serif">${escaparHtmlMapa(formatTransitName(nome))}${extra ? `<span style="font-weight:500;opacity:.75"> · ${escaparHtmlMapa(extra)}</span>` : ''}</span>`;

  legs.forEach((leg) => {
    const pts = (leg.pontos || []).filter((p) => isValidCoordinate(p.lat, p.lon));
    if (pts.length < 2) return;
    const linha: L.LatLngTuple[] = pts.map((p) => [p.lat, p.lon]);
    linha.forEach((p) => limites.push(p));

    if (leg.mode === 'WALK') {
      L.polyline(linha, { color: '#FFFFFF', weight: 8, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(grupo);
      L.polyline(linha, { color: '#111111', weight: 4, opacity: 0.85, dashArray: '1 9', lineCap: 'round', interactive: false }).addTo(grupo);
      return;
    }

    // Troço de transporte: linha laranja com contorno branco
    L.polyline(linha, { color: '#FFFFFF', weight: 11, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    L.polyline(linha, { color: '#FF6B1A', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);

    // Paragens intermédias
    pts.slice(1, -1).forEach((p) => {
      L.circleMarker([p.lat, p.lon], { radius: 3.5, color: '#FF6B1A', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1, interactive: !!p.nome })
        .bindTooltip(nomeTip(p.nome || ''), { direction: 'top', offset: [0, -4], className: 'parou-rota-tip' })
        .addTo(grupo);
    });

    // Embarque e desembarque
    const primeiro = pts[0];
    const ultimo = pts[pts.length - 1];
    L.circleMarker([primeiro.lat, primeiro.lon], { radius: 8, color: '#111111', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 })
      .bindTooltip(nomeTip(leg.fromStopName || primeiro.nome || '', leg.departureTime), { permanent: etiquetas, direction: 'top', offset: [0, -8], className: 'parou-rota-tip' })
      .addTo(grupo);
    L.circleMarker([ultimo.lat, ultimo.lon], { radius: 8, color: '#111111', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 })
      .bindTooltip(nomeTip(leg.toStopName || ultimo.nome || '', leg.arrivalTime), { permanent: etiquetas, direction: 'bottom', offset: [0, 8], className: 'parou-rota-tip' })
      .addTo(grupo);

    // Número da linha a meio do percurso
    const meio = pts[Math.floor(pts.length / 2)];
    const fundo = leg.lineColor || '#111111';
    L.marker([meio.lat, meio.lon], {
      interactive: false,
      zIndexOffset: 500,
      icon: L.divIcon({
        className: 'parou-rota-linha',
        html: `<div style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:22px;padding:0 6px;border-radius:5px;background:${fundo};color:${corTextoSobre(fundo)};border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(0,0,0,.35);font:700 13px/1 'Barlow Condensed',Inter,sans-serif;white-space:nowrap">${escaparHtmlMapa(leg.lineCode || '')}</div>`,
        iconSize: [40, 22],
        iconAnchor: [20, 11],
      }),
    }).addTo(grupo);
  });
}

function safeFlyTo(map: L.Map | null, lat: number, lon: number, zoom?: number) {
  if (!map) return;
  if (!isValidCoordinate(lat, lon)) return;
  try {
    const curZoom = map.getZoom();
    const targetZoom = Number.isFinite(zoom) ? zoom! : curZoom;
    const distancia = map.getCenter().distanceTo([lat, lon]);
    // Já está ali: não mexe (o GPS manda posições a cada segundo)
    if (distancia < 15 && Math.abs(curZoom - targetZoom) < 0.01) return;
    // Pequenos ajustes deslizam; só os saltos grandes fazem o "voo"
    if (distancia < 2000) map.setView([lat, lon], targetZoom, { animate: true });
    else map.flyTo([lat, lon], targetZoom, { duration: 0.8 });
  } catch (err) {
    console.warn('[PertoView] safeFlyTo error:', err);
  }
}

// "Sentido Cordoaria · Hosp. S. João" (só vem quando há paragens com o mesmo nome)
/**
 * Partidas a mostrar na paragem: a próxima de cada linha (e sentido) — senão as linhas pouco
 * frequentes, como as da UNIR, nunca apareciam — mais as partidas seguintes até um limite.
 */
function escolherPartidas(ordenadas: any[], seguintes = 12): any[] {
  const vistas = new Set<string>();
  let extra = 0;
  return ordenadas.filter((d) => {
    const chave = `${d.lineCode || d.route_short_name || ''}|${String(d.destination || d.headsign || '').toLowerCase()}`;
    if (!vistas.has(chave)) { vistas.add(chave); return true; }
    if (extra < seguintes) { extra += 1; return true; }
    return false;
  });
}

/** Distância em metros entre dois pontos (suficiente para paragens que ficam no mesmo sítio) */
function metrosEntre(a: { latitude?: number | string; longitude?: number | string }, b: { latitude?: number | string; longitude?: number | string }): number {
  const la = Number(a.latitude), lo = Number(a.longitude), lb = Number(b.latitude), lp = Number(b.longitude);
  if (![la, lo, lb, lp].every(Number.isFinite)) return Infinity;
  const dy = (lb - la) * 111_320;
  const dx = (lp - lo) * 111_320 * Math.cos((la * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

function textoSentido(stop: NearbyStopItem): string {
  if (!stop.direction) return '';
  if (stop.arrivalsOnly) return stop.direction;
  return t('Sentido {d}', { d: stop.direction.split(' · ').map((d) => formatTransitName(d)).join(' · ') });
}

// Cache ao nível do módulo para manter os últimos dados ao trocar de aba
let lastNearbyStops: NearbyStopItem[] = [];
let lastNearbyVehicles: NearbyVehicleItem[] = [];
let lastNearbyAlerts: CentralAlert[] = [];
let ultimoRaioUsado = 0;
let ultimoFiltro: 'todos' | 'autocarro' | 'metro' | 'comboio' | 'barco' | 'favoritos' = 'todos';
// Vista do mapa e se segue o utilizador: ao voltar ao Perto fica tudo como estava
let ultimaVistaMapa: { lat: number; lon: number; zoom: number; t: number } | null = null;
let ultimoSeguir = true;

export const PertoView: React.FC<PertoViewProps> = ({
  initialDestination,
  onClearInitialDestination,
  onAbrirFavoritos,
  totalFavoritos = 0,
  onAbrirPrivacidade,
}) => {
  const { coords: userCoords, status: gpsStatus, activateLocation, setManualLocation, stopLocation, motivoBloqueio, afinarPosicao } = useUserLocation();
  // Janela "A tua localização" (o que se faz com ela e como a apagar)
  const [dialogoLocalizacao, setDialogoLocalizacao] = useState<boolean>(false);
  const botaoFavoritos = onAbrirFavoritos ? (
    <button
      type="button"
      onClick={onAbrirFavoritos}
      data-teste="abrir-favoritos"
      aria-label={totalFavoritos > 0 ? `${t('Favoritos')} (${totalFavoritos})` : t('Favoritos')}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 h-10 min-w-[44px] px-3 rounded-full bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[13px] font-bold text-[#111111] cursor-pointer"
    >
      <Star className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
      <span className="hidden min-[400px]:inline lg:inline">{t('Favoritos')}</span>
      {totalFavoritos > 0 && <span className="font-condensada text-[14px] tabular-nums text-[#6B6B6B]">{totalFavoritos}</span>}
    </button>
  ) : null;
  // Passos para desbloquear (aparecem quando "Ativar localização" não chega)
  const [ajudaLocalizacao, setAjudaLocalizacao] = useState<boolean>(false);
  const eIphone = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  useEffect(() => { if (gpsStatus === 'active') setAjudaLocalizacao(false); }, [gpsStatus]);
  // O Perto só mostra paragens quando há uma posição (GPS ou local escolhido)
  const localizacaoPronta = Boolean(userCoords) && gpsStatus === 'active';
  // «A bordo»: deteta (ou a pessoa diz) que vai num autocarro e acompanha-o. Só com GPS real (não com um local escolhido à mão)
  const aBordo = useABordo(userCoords, localizacaoPronta && !userCoords?.isManual);
  const aBordoNoMapa = aBordo.fase === 'a-bordo' && aBordo.paragens.length > 1;
  const [mapaExpandido, setMapaExpandido] = useState<boolean>(false);
  // Painel de baixo (telemóvel) arrastável com o dedo, como nas apps de mapas: segue o dedo e,
  // ao largar, encaixa na posição mais próxima (ou na direção de um gesto rápido).
  const mapaElRef = useRef<HTMLElement | null>(null);
  const arrastoRef = useRef<{ x0: number; y0: number; h0: number; t0: number; total: number; ativo: boolean; cancelado: boolean } | null>(null);
  const gestoPainel = {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      const el = mapaElRef.current;
      if (!t || !el || window.innerWidth >= 1024) { arrastoRef.current = null; return; }
      const total = el.parentElement?.clientHeight || window.innerHeight;
      arrastoRef.current = { x0: t.clientX, y0: t.clientY, h0: el.getBoundingClientRect().height, t0: Date.now(), total, ativo: false, cancelado: false };
    },
    onTouchMove: (e: React.TouchEvent) => {
      const a = arrastoRef.current;
      const t = e.touches[0];
      const el = mapaElRef.current;
      if (!a || !t || !el || a.cancelado) return;
      const dy = t.clientY - a.y0;
      const dx = t.clientX - a.x0;
      if (!a.ativo) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { a.cancelado = true; return; } // deslize de lado (fila de chips)
        if (Math.abs(dy) < 8) return;
        a.ativo = true;
      }
      const h = Math.max(a.total * 0.28, Math.min(a.total * 0.86, a.h0 + dy));
      el.style.transition = 'none';
      el.style.height = `${h}px`;
      el.style.minHeight = '0px';
      el.style.maxHeight = 'none';
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const a = arrastoRef.current;
      arrastoRef.current = null;
      const el = mapaElRef.current;
      if (!a || !el || !a.ativo) return;
      const t = e.changedTouches[0];
      const dy = (t?.clientY ?? a.y0) - a.y0;
      const velocidade = dy / Math.max(1, Date.now() - a.t0); // px/ms
      const fracao = (a.h0 + dy) / a.total;
      const expandir = Math.abs(velocidade) > 0.45 ? velocidade > 0 : fracao > 0.56;
      // Larga o tamanho do dedo: a altura da classe volta a mandar, com animação a partir daqui
      el.style.transition = '';
      el.style.height = '';
      el.style.minHeight = '';
      el.style.maxHeight = '';
      setMapaExpandido(expandir);
      setTimeout(() => mapRef.current?.invalidateSize(), 340);
    },
  };
  const [pesquisarLocal, setPesquisarLocal] = useState<boolean>(false);
  const [pedidoLento, setPedidoLento] = useState<boolean>(false);
  // Aviso no mapa quando a posição está pouco precisa ou sem sinal (ver utils/qualidadeGps.ts)
  const qualidadeGps = useQualidadeGps(gpsStatus === 'active' && Boolean(userCoords) && !userCoords?.isManual);
  const [aAfinarGps, setAAfinarGps] = useState<boolean>(false);
  const tentarOutraVezGps = () => {
    if (aAfinarGps) return;
    setAAfinarGps(true);
    afinarPosicao().catch(() => {}).finally(() => setAAfinarGps(false));
  };
  // Coordenadas arredondadas (~100 m): evita pedir paragens a cada atualização do GPS
  const chaveCoords = userCoords ? `${userCoords.latitude.toFixed(3)},${userCoords.longitude.toFixed(3)}` : '';
  const coordsRef = useRef(userCoords);
  coordsRef.current = userCoords;

  // Vindo da página pública de uma paragem (/?local=lat,lon&nome=…&paragem=id): centra ali e abre-a
  const paragemPendenteRef = useRef<{ id: string; lat: number; lon: number } | null>(null);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const local = q.get('local');
      if (!local) return;
      const [lat, lon] = local.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
      const nome = (q.get('nome') || '').slice(0, 80);
      const paragem = q.get('paragem');
      if (paragem) paragemPendenteRef.current = { id: paragem, lat, lon };
      setManualLocation(lat, lon, nome || 'Paragem escolhida');
      const url = new URL(window.location.href);
      ['local', 'nome', 'paragem'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [stops, setStops] = useState<NearbyStopItem[]>(lastNearbyStops);
  const [vehicles, setVehicles] = useState<NearbyVehicleItem[]>(lastNearbyVehicles);
  const [contextualAlerts, setContextualAlerts] = useState<CentralAlert[]>(lastNearbyAlerts);
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(lastNearbyStops.length === 0);
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [falhouCarregar, setFalhouCarregar] = useState<boolean>(false);
  const [dbLoadingMessage, setDbLoadingMessage] = useState<string>('A carregar horários…');
  const [selectedRadius, setSelectedRadius] = useState<number>(1000);
  const [raioUsado, setRaioUsado] = useState<number>(ultimoRaioUsado);
  const [activeFilterTab, setActiveFilterTab] = useState<'todos' | 'autocarro' | 'metro' | 'comboio' | 'barco' | 'favoritos'>(ultimoFiltro);
  const [selectedStop, setSelectedStop] = useState<NearbyStopItem | null>(null);
  // Partidas pedidas à parte quando a paragem escolhida não as trouxe na lista do "Perto"
  const [partidasExtra, setPartidasExtra] = useState<{ id: string; deps: any[]; aCarregar: boolean } | null>(null);
  const [favoriteStopIds, setFavoriteStopIds] = useState<Set<string>>(new Set());
  // UNIR: horário do dia pedido à AMP pelo telemóvel (por paragem da lista)
  const [unirPorParagem, setUnirPorParagem] = useState<Record<string, { t: number; ok: boolean; aCarregar: boolean; passagens: PassagemUnir[] }>>({});
  const unirPedidosRef = useRef<Set<string>>(new Set());
  const [tiqueUnir, setTiqueUnir] = useState(0);

  // Search & Navigation
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [selectedDestination, setSelectedDestination] = useState<DestinationSuggestion | null>(null);
  const [calculatedRoutes, setCalculatedRoutes] = useState<TransitRouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<TransitRouteOption | null>(null);
  // Opção de viagem aberta (passo a passo e avisos): nenhuma até a pessoa tocar numa
  const [rotaAbertaId, setRotaAbertaId] = useState<string | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState<boolean>(false);
  const [rotasCalculadas, setRotasCalculadas] = useState<boolean>(false);
  const [longeRota, setLongeRota] = useState<LongeDeParagens | undefined>(undefined);
  const pedidoRotasRef = useRef(0);
  const partidaRotasRef = useRef(Date.now());
  // Vários destinos (até 5): a lista vive aqui e o ecrã da viagem (RotaVariosDestinos) calcula os troços
  const [destinosViagem, setDestinosViagem] = useState<DestinoViagem[]>([]);
  const [viagemSemente, setViagemSemente] = useState<{ opcoes: TransitRouteOption[]; escolhida: number; partida: number } | null>(null);
  const [mapaViagem, setMapaViagem] = useState<MapaViagem | null>(null);
  const viagemLayerRef = useRef<L.LayerGroup | null>(null);
  const emViagem = destinosViagem.length > 0;
  // Ecrã "Adicionar paragens" (o "+" ao lado da pesquisa): escrever as paragens e pôr por ordem
  const [editor, setEditor] = useState<{ linhas: LinhaEditor[]; ativa: number } | null>(null);
  const tituloEscolhidoRef = useRef('');

  // Map & Controls
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  // O mapa como estado: os componentes que desenham por cima (autocarros, A bordo) só arrancam quando ele existe
  const [mapaLeaflet, setMapaLeaflet] = useState<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const pintarRumoRef = useRef<((graus: number | null) => void) | null>(null);
  // Posição suave (a 60 fotogramas por segundo): círculo de precisão, rumo da viagem e se o mapa segue o ponto
  const haloRef = useRef<L.Circle | null>(null);
  const haloForteRef = useRef<boolean>(false);
  const rumoViagemRef = useRef<number | null>(null);
  const seguirRef = useRef<boolean>(true);
  const rotaLayerRef = useRef<L.LayerGroup | null>(null);
  const linhaLayerRef = useRef<L.LayerGroup | null>(null);
  const pedidoLinhaRef = useRef(0);
  const [linhaAberta, setLinhaAberta] = useState<{
    linha: string; cor?: string; destino: string; estado: 'a-carregar' | 'ok' | 'erro';
    /** Identificador da linha (o da lista de linhas) e dados para a guardar nos favoritos */
    id?: string; dados?: DadosLinhaFavorita;
    percurso?: { paragens: Array<{ id: string; nome: string; lat: number; lon: number; hora?: string }>; indice: number };
  } | null>(null);
  // O percurso (de uma linha aberta ou do autocarro em que vais) ocupa o mapa: as outras paragens saem
  const linhaNoMapa = Boolean(linhaAberta?.percurso) || aBordoNoMapa;
  const stopsMarkersRef = useRef<Map<string, { marker: L.Marker; modo: string; sel: boolean; lat: number; lon: number }>>(new Map());
  const paragensPorIdRef = useRef<Map<string, NearbyStopItem>>(new Map());
  // Paragens de outras zonas do mapa (as que se vão descobrindo ao arrastar); separadas das de perto de ti,
  // que nunca são tocadas por este mecanismo
  const extrasMarkersRef = useRef<Map<string, { marker: L.Marker; modo: string; sel: boolean; lat: number; lon: number }>>(new Map());
  const filaExtrasRef = useRef<ParagemLeve[]>([]);
  const desenhandoExtrasRef = useRef(false);
  const contextoExtrasRef = useRef<{ vista: Limites; centro: { lat: number; lng: number }; cosLat: number; selecionadaId?: string } | null>(null);
  const sincronizarExtrasRef = useRef<() => void>(() => {});
  const carregarExtrasRef = useRef<() => void>(() => {});
  const abrirParagemLeveRef = useRef<(p: ParagemLeve) => void>(() => {});
  const enriquecerRef = useRef(0);
  // Outras paragens no mesmo sítio da paragem aberta que veio do mapa (para trocar de poste sem voltar)
  const [grupoExtra, setGrupoExtra] = useState<NearbyStopItem[]>([]);
  // Passados 30 s fora do Perto volta a seguir o utilizador (pode já estar noutro sítio)
  const [followMode, setFollowMode] = useState<boolean>(
    () => ultimoSeguir || !ultimaVistaMapa || Date.now() - ultimaVistaMapa.t > 30_000,
  );
  // Se já há posição ao abrir, o mapa nasce centrado nela (não precisa de "voar" até lá)
  const hasCenteredInitiallyRef = useRef<boolean>(Boolean(userCoords));
  const isFetchingNearbyRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);

  const [favoriteLineIds, setFavoriteLineIds] = useState<Set<string>>(() => getFavoriteLineIds());
  useEffect(() => {
    setFavoriteStopIds(getFavoriteStopIds());
    setFavoriteLineIds(getFavoriteLineIds());
    // Também quando os favoritos mudam noutro sítio ou são repostos da cópia no servidor
    const reler = () => { setFavoriteStopIds(getFavoriteStopIds()); setFavoriteLineIds(getFavoriteLineIds()); };
    window.addEventListener('parou_favorites_updated', reler);
    window.addEventListener('parou_dados_repostos', reler);
    return () => {
      window.removeEventListener('parou_favorites_updated', reler);
      window.removeEventListener('parou_dados_repostos', reler);
    };
  }, []);

  // Estrela de favorito: o mesmo favorito vale com ou sem o prefixo "stop-" no identificador
  const paragemEFavorita = (stop: NearbyStopItem): boolean => {
    const limpo = stop.id.startsWith('stop-') ? stop.id.slice(5) : stop.id;
    // Só conta a lista viva: o campo isFavorite da paragem é uma fotografia de quando as paragens foram pedidas
    return favoriteStopIds.has(stop.id) || favoriteStopIds.has(limpo) || favoriteStopIds.has(`stop-${limpo}`);
  };
  const alternarParagemFavorita = (stop: NearbyStopItem) => {
    toggleFavoriteStopId(stop.id, {
      name: formatTransitName(stop.name),
      operatorId: stop.operatorId,
      operatorName: stop.operatorName,
      locality: stop.locality,
      district: stop.district,
      latitude: Number(stop.latitude),
      longitude: Number(stop.longitude),
      transportMode: stop.transportMode,
    });
    // Ler depois de gravar: o aviso de "favoritos mudaram" chega antes de a lista de paragens ficar atualizada
    setFavoriteStopIds(getFavoriteStopIds());
  };
  // Mesma estrela para paragens e linhas (mesmo tamanho, textos e estilo das estrelas dos Horários)
  const estrelaFavorito = (guardada: boolean, nome: string, aoAlternar: () => void, extra: string, teste: string) => {
    const rotulo = guardada ? t('Remover dos favoritos') : t('Guardar nos favoritos');
    return (
      <button
        type="button"
        data-teste={teste}
        onClick={(e) => { e.stopPropagation(); aoAlternar(); }}
        className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-[#6B6B6B] hover:text-[#111111] active:bg-[#F4F4F2] cursor-pointer ${extra}`}
        title={rotulo}
        aria-label={`${rotulo}: ${nome}`}
        aria-pressed={guardada}
      >
        <Star className={`w-5 h-5 stroke-[2] ${guardada ? 'fill-[#111111] text-[#111111]' : ''}`} />
      </button>
    );
  };
  const botaoFavorito = (stop: NearbyStopItem, extra: string) =>
    estrelaFavorito(paragemEFavorita(stop), formatTransitName(stop.name), () => alternarParagemFavorita(stop), extra, 'favorito-paragem');
  // Linha aberta (percurso): só quando se sabe o identificador da linha (as de outros operadores sem ele não têm estrela)
  const alternarLinhaFavorita = (id: string, dados?: DadosLinhaFavorita) => {
    toggleFavoriteLineId(id, dados);
    setFavoriteLineIds(getFavoriteLineIds());
  };

  useEffect(() => { ultimoSeguir = followMode; }, [followMode]);
  seguirRef.current = followMode;
  useEffect(() => { ultimoFiltro = activeFilterTab; }, [activeFilterTab]);

  const repetirPedidoRef = useRef<boolean>(false);
  const loadNearbyData = useCallback(async () => {
    // Sem posição não há "perto": a página mostra o convite para ativar a localização
    if (!coordsRef.current) {
      setIsLoadingNearby(false);
      return;
    }
    const lat = coordsRef.current.latitude;
    const lon = coordsRef.current.longitude;
    if (!isValidCoordinate(lat, lon)) return;
    if (isFetchingNearbyRef.current) {
      // Já há um pedido a decorrer (ex.: posição antiga): repete quando acabar
      repetirPedidoRef.current = true;
      return;
    }
    isFetchingNearbyRef.current = true;
    if (lastNearbyStops.length === 0) setIsLoadingNearby(true);

    try {
      const data = await fetchNearbyTransit(lat, lon, selectedRadius, AbortSignal.timeout(15000));
      if (data.isLoading) {
        setIsDbLoading(true);
        const msg = data.message || (data.loadedOperators ? `A carregar horários… ${data.loadedOperators}/${data.totalOperators}` : 'A carregar horários…');
        setDbLoadingMessage(msg);
      } else {
        setIsDbLoading(false);
        setFalhouCarregar(false);
        retryAttemptRef.current = 0;
        if (data.stops) {
          lastNearbyStops = data.stops;
          setStops(data.stops);
          const pendente = paragemPendenteRef.current;
          if (pendente) {
            const alvo = data.stops.find((st: NearbyStopItem) => st.id === pendente.id)
              || data.stops.find((st: NearbyStopItem) => Math.abs(st.latitude - pendente.lat) < 0.0006 && Math.abs(st.longitude - pendente.lon) < 0.0006);
            if (alvo) {
              paragemPendenteRef.current = null;
              setTimeout(() => setSelectedStop(alvo), 0);
            }
          }
        }
        if (typeof data.radiusMeters === 'number' && data.radiusMeters > 0) {
          ultimoRaioUsado = data.radiusMeters;
          setRaioUsado(data.radiusMeters);
        }
        if (data.vehicles) {
          lastNearbyVehicles = data.vehicles;
          setVehicles(data.vehicles);
        }
        if (data.alerts) {
          lastNearbyAlerts = data.alerts;
          setContextualAlerts(data.alerts);
        }
      }
    } catch (err) {
      console.warn('[PertoView] Erro ao carregar paragens:', err);
      if (lastNearbyStops.length === 0) setFalhouCarregar(true);
    } finally {
      setIsLoadingNearby(false);
      isFetchingNearbyRef.current = false;
      if (repetirPedidoRef.current) {
        repetirPedidoRef.current = false;
        setTimeout(() => loadNearbyDataRef.current?.(), 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCoords, selectedRadius]);
  const loadNearbyDataRef = useRef(loadNearbyData);
  loadNearbyDataRef.current = loadNearbyData;

  // Quando a internet volta, atualiza logo
  useEffect(() => {
    const voltou = () => { setFalhouCarregar(false); loadNearbyDataRef.current?.(); };
    window.addEventListener('online', voltou);
    return () => window.removeEventListener('online', voltou);
  }, []);

  // Pedido de localização que demora: ao fim de 12 s mostra "Tentar outra vez"
  useEffect(() => {
    if (gpsStatus !== 'requesting') {
      setPedidoLento(false);
      return;
    }
    const t = setTimeout(() => setPedidoLento(true), 12000);
    return () => clearTimeout(t);
  }, [gpsStatus]);

  // Polling e retry backoff: 5 s, depois 10 s, depois 20 s (Regra 5, 30s atualização automática)
  useEffect(() => {
    loadNearbyData();
    let timer: NodeJS.Timeout;

    const scheduleNext = () => {
      const RETRY_DELAYS = [5000, 10000, 20000];
      const delay = isDbLoading 
        ? RETRY_DELAYS[Math.min(retryAttemptRef.current++, RETRY_DELAYS.length - 1)]
        : 30000;
      timer = setTimeout(async () => {
        await loadNearbyData();
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timer);
  }, [loadNearbyData, isDbLoading]);

  // Handle Initial Destination from Favorites or Navigation
  useEffect(() => {
    if (initialDestination) {
      const destSuggestion: DestinationSuggestion = {
        id: 'initial-dest',
        title: initialDestination.title,
        subtitle: 'Destino selecionado',
        latitude: initialDestination.lat,
        longitude: initialDestination.lon,
        type: 'PLACE',
      };
      setSelectedDestination(destSuggestion);
      setDestinationQuery(initialDestination.title);
      calculateRoutesToDestination(initialDestination.lat, initialDestination.lon, initialDestination.title);
      if (onClearInitialDestination) onClearInitialDestination();
    }
  }, [initialDestination]);

  // Destination Search
  useEffect(() => {
    if (!destinationQuery.trim() || destinationQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    // O texto é o do destino que acabou de ser escolhido: não reabre a lista de sugestões
    if (destinationQuery === tituloEscolhidoRef.current) {
      setSuggestions([]);
      return;
    }
    tituloEscolhidoRef.current = '';

    // Só conta a resposta da última pesquisa (as antigas podem chegar depois e baralhar a lista)
    let atual = true;
    const timer = setTimeout(async () => {
      // Só se envia a localização quando a pessoa a tem (ou a escolheu): com ela, as paragens vêm por ordem de distância;
      // sem ela, vêm as que melhor correspondem ao que escreveu (e não as "mais perto de Lisboa", que ninguém pediu)
      try {
        const results = await searchDestinations(destinationQuery, userCoords?.latitude, userCoords?.longitude);
        if (atual) setSuggestions(results);
      } catch {}
    }, 60);

    return () => { atual = false; clearTimeout(timer); };
  }, [destinationQuery, userCoords]);

  const calculateRoutesToDestination = async (destLat: number, destLon: number, destName = 'Destino') => {
    const lat = userCoords?.latitude ?? 38.7253;
    const lon = userCoords?.longitude ?? -9.1500;
    setIsCalculatingRoutes(true);
    setCalculatedRoutes([]);
    setSelectedRoute(null);
    setRotaAbertaId(null);
    setRotasCalculadas(false);
    setLongeRota(undefined);
    setDestinosViagem([]);
    setMapaViagem(null);
    partidaRotasRef.current = Date.now();
    const pedido = ++pedidoRotasRef.current;

    const ordenar = ordenarOpcoes;

    try {
      const res = await planTransitRoute(lat, lon, destLat, destLon, destName, undefined, { nivel: 0 });
      if (pedido !== pedidoRotasRef.current) return;
      let routes = ordenar(res.routes || []);
      setLongeRota(res.longe);
      setCalculatedRoutes(routes);
      if (routes.length > 0) setSelectedRoute(routes[0]);
      // UNIR: o telemóvel pede à AMP a hora de cada ligação direta encontrada, e junta a rede normal com a UNIR
      const candidatos = (res.unir || []).slice(0, 4);
      const partidaMs = partidaRotasRef.current;
      const temCombinacoes = !!(res.hibridas?.length || res.pontes?.length || res.duplas?.length || res.cadeias?.length || res.ligacoes?.length);
      if (candidatos.length || temCombinacoes) {
        const validar = () => pedido === pedidoRotasRef.current;
        const [diretas, combinadas] = await Promise.all([
          Promise.all(candidatos.map((c) => viagemUnir(c, destName, res.originCoords, res.destCoords).catch(() => null))),
          opcoesComUnir(
            res, destName, partidaMs,
            (ponto, quandoMs) => calcularTroco(ponto, { lat: destLat, lon: destLon }, destName, quandoMs, validar, 1),
            validar,
          ).catch(() => [] as TransitRouteOption[]),
        ]);
        if (pedido !== pedidoRotasRef.current) return;
        const extra = [...(diretas.filter(Boolean) as TransitRouteOption[]), ...combinadas];
        if (extra.length) {
          routes = ordenar([...routes, ...extra]);
          setCalculatedRoutes(routes);
          setSelectedRoute(routes[0]);
        }
        const motivos = motivosFalhaUnir();
        if (!extra.length && motivos.length) {
          // Só linhas e códigos de paragens, nada que identifique quem pesquisou
          try {
            fetch('/api/diagnostico-unir', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ versao: 5, tipo: 'planeador', quando: new Date().toISOString(), motivos }),
            }).catch(() => {});
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[PertoView] Erro ao calcular rotas:', err);
    } finally {
      if (pedido === pedidoRotasRef.current) {
        setIsCalculatingRoutes(false);
        setRotasCalculadas(true);
      }
    }
  };

  const handleSelectDestination = (sug: DestinationSuggestion) => {
    // Sem GPS (ou a escolher um local): o local escolhido passa a ser o ponto de partida
    if (!localizacaoPronta || pesquisarLocal) {
      setManualLocation(sug.latitude, sug.longitude, sug.title);
      setDestinationQuery('');
      setSuggestions([]);
      setSearchFocused(false);
      setPesquisarLocal(false);
      setFollowMode(true);
      return;
    }
    setSelectedDestination(sug);
    tituloEscolhidoRef.current = sug.title;
    setDestinationQuery(sug.title);
    setSuggestions([]);
    setSearchFocused(false);
    calculateRoutesToDestination(sug.latitude, sug.longitude, sug.title);
  };

  const linhaDoDestino = (d: DestinationSuggestion, uid = novoUid(), permanencia = 0): LinhaEditor => (
    { chave: novoUid(), uid, texto: d.title, dest: d, permanencia }
  );

  /** Abre o ecrã "Adicionar paragens" com o que já há (a viagem, o destino escolhido ou o que se escreveu na pesquisa) */
  const abrirEditor = () => {
    let linhas: LinhaEditor[];
    let ativa: number;
    if (emViagem) {
      linhas = destinosViagem.map((d) => linhaDoDestino(d.dest, d.uid, d.permanencia));
      if (linhas.length < MAX_DESTINOS) linhas.push(linhaVazia());
      ativa = linhas.length < MAX_DESTINOS || destinosViagem.length < MAX_DESTINOS ? linhas.length - 1 : -1;
    } else if (selectedDestination) {
      linhas = [linhaDoDestino(selectedDestination), linhaVazia()];
      ativa = 1;
    } else {
      linhas = [linhaVazia(destinationQuery.trim())];
      ativa = 0;
    }
    setSuggestions([]);
    setSearchFocused(false);
    setEditor({ linhas, ativa });
  };

  /** "Ver rotas": uma paragem segue pelo caminho de sempre; duas ou mais abrem a viagem com vários destinos */
  const aplicarEditor = (linhas: LinhaEditor[]) => {
    setEditor(null);
    const lista = linhas.filter((l) => l.dest).slice(0, MAX_DESTINOS);
    if (lista.length === 0) return;
    setSuggestions([]);
    setSearchFocused(false);
    if (lista.length === 1) {
      const d = lista[0].dest as DestinationSuggestion;
      tituloEscolhidoRef.current = d.title;
      setSelectedDestination(d);
      setDestinationQuery(d.title);
      calculateRoutesToDestination(d.latitude, d.longitude, d.title);
      return;
    }
    // Aproveita o percurso já calculado do 1.º destino, se for recente (senão calcula-se de novo, com as horas de agora)
    const recente = Date.now() - partidaRotasRef.current < 3 * 60_000;
    const mesmoPrimeiro = !emViagem && selectedDestination?.id === lista[0].dest?.id && selectedDestination?.latitude === lista[0].dest?.latitude;
    if (mesmoPrimeiro && calculatedRoutes.length && recente) {
      setViagemSemente({ opcoes: calculatedRoutes, escolhida: Math.max(0, calculatedRoutes.findIndex((r) => r.id === selectedRoute?.id)), partida: partidaRotasRef.current });
    } else {
      setViagemSemente(null);
    }
    pedidoRotasRef.current++;
    tituloEscolhidoRef.current = '';
    setIsCalculatingRoutes(false);
    setCalculatedRoutes([]);
    setSelectedRoute(null);
    setRotaAbertaId(null);
    setRotasCalculadas(false);
    setSelectedDestination(lista[0].dest);
    setDestinationQuery('');
    setDestinosViagem(lista.map((l) => ({ uid: l.uid, dest: l.dest as DestinationSuggestion, permanencia: l.permanencia })));
  };

  const handleClearDestination = () => {
    pedidoRotasRef.current++;
    tituloEscolhidoRef.current = '';
    setEditor(null);
    setDestinosViagem([]);
    setViagemSemente(null);
    setMapaViagem(null);
    setSelectedDestination(null);
    setDestinationQuery('');
    setCalculatedRoutes([]);
    setSelectedRoute(null);
    setRotaAbertaId(null);
    setIsCalculatingRoutes(false);
    setRotasCalculadas(false);
  };

  // Paragem aberta: pede ao servidor a próxima partida de CADA linha (a lista "perto" só traz 5
  // partidas por paragem e as linhas menos frequentes ficavam de fora) e atualiza de 30 em 30 s
  useEffect(() => {
    if (!selectedStop) return;
    const id = selectedStop.id;
    let cancelado = false;
    const carregar = (silencioso: boolean) => {
      if (!silencioso) setPartidasExtra((atual) => ({ id, deps: atual?.id === id ? atual.deps : [], aCarregar: true }));
      fetch(`/api/transit/stop/${encodeURIComponent(id)}?linhas=1`, { signal: AbortSignal.timeout(15000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelado) return;
          const agora = Math.floor(Date.now() / 1000);
          const deps = (data?.departures || []).map((d: any) => ({
            lineCode: d.route_short_name || d.route_id,
            lineName: d.route_long_name || d.route_short_name || '',
            lineColor: d.route_color ? (String(d.route_color).startsWith('#') ? d.route_color : `#${d.route_color}`) : undefined,
            destination: d.headsign || 'Terminal',
            operatorName: d.operator_name,
            operatorId: d.feed_id,
            tripId: d.trip_id,
            routeId: d.route_id,
            stopId: d.stop_id,
            departureTime: d.display_text,
            displayText: d.display_text,
            scheduledTime: d.scheduled_time,
            expectedTime: d.is_realtime && d.realtime_time ? d.realtime_time : undefined,
            etaMinutes: Math.max(0, Math.round(((d.realtime_epoch_secs || d.dep_epoch_secs) - agora) / 60)),
            departureMinutes: Math.max(0, Math.round(((d.realtime_epoch_secs || d.dep_epoch_secs) - agora) / 60)),
            countdown_minutes: Math.max(0, Math.round(((d.realtime_epoch_secs || d.dep_epoch_secs) - agora) / 60)),
            isRealtime: d.state === 'TEMPO REAL',
            state: d.state,
            statusDescription: d.state_reason || d.state,
            ...(d.is_realtime && typeof d.delay_seconds === 'number' ? { delaySeconds: d.delay_seconds } : {}),
          }));
          setPartidasExtra({ id, deps, aCarregar: false });
        })
        .catch(() => { if (!cancelado) setPartidasExtra((atual) => ({ id, deps: atual?.id === id ? atual.deps : [], aCarregar: false })); });
    };
    carregar(false);
    const t = setInterval(() => carregar(true), 30_000);
    return () => { cancelado = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop?.id]);

  // A paragem aberta ocupa o lugar da lista. O "voltar" do telemóvel (gesto ou botão)
  // fecha-a em vez de sair da app: abre-se com uma entrada no histórico.
  const historicoParagemRef = useRef<boolean>(false);
  useEffect(() => {
    if (!selectedStop) return;
    if (!historicoParagemRef.current) {
      try {
        window.history.pushState({ ...(window.history.state || {}), parouParagem: true }, '');
        historicoParagemRef.current = true;
      } catch {}
    }
    const aoVoltar = () => {
      historicoParagemRef.current = false;
      setSelectedStop(null);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
  }, [selectedStop?.id]);

  const fecharParagem = () => {
    setSelectedStop(null);
    if (historicoParagemRef.current) {
      historicoParagemRef.current = false;
      try { window.history.back(); } catch {}
    }
  };

  const handleRecenterClick = () => {
    setFollowMode(true);
    void ligarBussola(); // no iPhone pede licença à primeira vez (tem de vir de um toque)
    // Sem GPS ativo: pede a localização ao browser (o mapa centra-se quando ela chegar)
    if (gpsStatus !== 'active' || !userCoords || userCoords.isManual) {
      activateLocation(true);
      return;
    }
    safeFlyTo(mapRef.current, userCoords.latitude, userCoords.longitude, 16);
  };

  // Inicializar Mapa Leaflet com Mosaicos Raster OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Volta à vista onde o utilizador deixou o mapa; senão centra na posição dele
    const vista = !followMode && ultimaVistaMapa ? ultimaVistaMapa : null;
    const lat = vista?.lat ?? userCoords?.latitude ?? 38.7253;
    const lon = vista?.lon ?? userCoords?.longitude ?? -9.1500;
    const zoomInicial = vista?.zoom ?? (userCoords ? 16 : 15);

    const map = L.map(mapContainerRef.current, {
      center: [lat, lon],
      zoom: zoomInicial,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
      // Menos trabalho por gesto: sem animar a escala de cada marcador no zoom
      markerZoomAnimation: false,
    });

    // Mosaicos raster do OpenStreetMap
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      // Os mosaicos vão chegando enquanto arrastas (em vez de só no fim), com margem extra à volta
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 3,
    }).addTo(map);

    // O filtro dos mosaicos (cinzento neutro; mais escuro ou quente nos outros temas) vem do CSS: .leaflet-tile-pane em index.css e temas.css

    // Atribuição oficial
    L.control.attribution({
      prefix: false,
      position: 'bottomright',
    }).addTo(map);

    // Menos ícones com o mapa afastado: as paragens viram pontos (ver .parou-pg em index.css)
    const ajustarEscala = () => {
      const z = map.getZoom();
      const c = map.getContainer();
      c.classList.toggle('mapa-longe', z <= 15);
      c.classList.toggle('mapa-medio', z <= 16);
    };
    ajustarEscala();
    map.on('zoomend', ajustarEscala);

    map.on('dragstart', () => setFollowMode(false));
    map.on('moveend', () => {
      const c = map.getCenter();
      ultimaVistaMapa = { lat: c.lat, lon: c.lng, zoom: map.getZoom(), t: Date.now() };
    });
    mapRef.current = map;
    setMapaLeaflet(map);

    // ResizeObserver para manter o mapa atualizado
    let ro: ResizeObserver | null = null;
    if (mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      if (ro) {
        ro.disconnect();
      }
      // Conta o tempo a partir do momento em que se sai do Perto
      if (ultimaVistaMapa) ultimaVistaMapa = { ...ultimaVistaMapa, t: Date.now() };
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      haloRef.current?.remove();
      haloRef.current = null;
      stopsMarkersRef.current.forEach((m) => m.marker.remove());
      stopsMarkersRef.current.clear();
      filaExtrasRef.current = [];
      extrasMarkersRef.current.forEach((m) => m.marker.remove());
      extrasMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapaLeaflet(null);
    };
  }, []);

  // Recenter map on user location
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    if (!isValidCoordinate(userCoords.latitude, userCoords.longitude)) return;

    // Com GPS, o mapa segue o ponto suave a cada fotograma (mais abaixo); aqui fica só o primeiro enquadramento
    // e o local escolhido à mão
    if ((followMode && userCoords.isManual) || !hasCenteredInitiallyRef.current) {
      safeFlyTo(mapRef.current, userCoords.latitude, userCoords.longitude, 16);
      hasCenteredInitiallyRef.current = true;
    }
  }, [userCoords, followMode]);

  // Render User Location
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    const { latitude, longitude } = userCoords;
    if (!isValidCoordinate(latitude, longitude)) return;

    if (userMarkerRef.current) {
      // Com o GPS a ser seguido, quem mexe no ponto é a posição suave; aqui só o local escolhido à mão (ou ainda sem GPS)
      if (userCoords.isManual || !posicaoSuaveAtiva()) userMarkerRef.current.setLatLng([latitude, longitude]);
      if (userCoords.isManual && haloRef.current) { haloRef.current.remove(); haloRef.current = null; }
    } else {
      const userIcon = L.divIcon({
        className: 'custom-user-marker-icon',
        html: `
          <div class="relative flex items-center justify-center" style="width:24px;height:24px">
            <svg data-cone viewBox="-50 -50 100 100" width="100" height="100" aria-hidden="true"
              style="position:absolute;left:50%;top:50%;margin:-50px 0 0 -50px;pointer-events:none;opacity:0;transition:opacity .25s;will-change:transform">
              <defs><radialGradient id="cone-parou" cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse">
                <stop offset="0" style="stop-color:var(--cor-destaque,#FF6B1A)" stop-opacity=".6"/><stop offset="1" style="stop-color:var(--cor-destaque,#FF6B1A)" stop-opacity="0"/>
              </radialGradient></defs>
              <path d="M0 0 L-26.4 -37.7 A46 46 0 0 1 26.4 -37.7 Z" fill="url(#cone-parou)"/>
            </svg>
            <div class="w-6 h-6 rounded-full bg-[#FF6B1A]/20 animate-ping absolute"></div>
            <div style="background-color: var(--cor-destaque,#FF6B1A); border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3);" class="w-5 h-5 rounded-full flex items-center justify-center z-10">
              <div style="background-color: #111111;" class="w-1.5 h-1.5 rounded-full"></div>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon, interactive: false, keyboard: false })
        .addTo(mapRef.current);
      pintarRumoRef.current?.(rumoAtual());
    }
  }, [userCoords]);

  // Cone de direção (para onde o telemóvel aponta), pela bússola do aparelho
  useEffect(() => {
    const pintar = (bussola: number | null) => {
      const cone = userMarkerRef.current?.getElement()?.querySelector<SVGElement>('[data-cone]');
      if (!cone) return;
      // Em andamento (autocarro, a pé depressa) manda o rumo da viagem; parado, a bússola do telemóvel
      const graus = rumoViagemRef.current ?? bussola;
      if (graus === null) { cone.style.opacity = '0'; return; }
      cone.style.opacity = '1';
      cone.style.transform = `rotate(${graus.toFixed(1)}deg)`;
    };
    pintarRumoRef.current = pintar;
    const parar = observarRumo(pintar);
    return () => { parar(); pintarRumoRef.current = null; };
  }, []);

  // Ponto da posição a deslizar: o filtro dá a posição estimada para agora, a cada fotograma, e o mapa segue-a
  useEffect(() => {
    let ultimoHalo = 0;
    let ultimoPan = 0;
    const parar = observarPosicaoSuave((q) => {
      const map = mapRef.current;
      const marcador = userMarkerRef.current;
      if (!map || !marcador || coordsRef.current?.isManual) return;
      if (!isValidCoordinate(q.lat, q.lon)) return;
      marcador.setLatLng([q.lat, q.lon]);

      if (rumoViagemRef.current !== q.rumo) {
        rumoViagemRef.current = q.rumo;
        pintarRumoRef.current?.(rumoAtual());
      }

      const agora = performance.now();
      // Círculo de precisão (só quando a incerteza se vê; com histerese para não piscar)
      if (agora - ultimoHalo >= 100) {
        ultimoHalo = agora;
        if (q.precisao >= 12) {
          // Com a posição fraca (≥ 100 m) o círculo ganha um contorno tracejado, para se ver até onde vai a dúvida
          const fraca = q.precisao >= 100;
          if (!haloRef.current) {
            haloRef.current = L.circle([q.lat, q.lon], { radius: q.precisao, stroke: fraca, color: '#FF6B1A', weight: 1.5, opacity: 0.55, dashArray: '5 5', fillColor: '#FF6B1A', fillOpacity: 0.13, interactive: false }).addTo(map);
            haloForteRef.current = fraca;
          } else {
            haloRef.current.setLatLng([q.lat, q.lon]);
            haloRef.current.setRadius(q.precisao);
            if (haloForteRef.current !== fraca && (fraca || q.precisao < 70)) {
              haloRef.current.setStyle({ stroke: fraca });
              haloForteRef.current = fraca;
            }
          }
        } else if (q.precisao < 8 && haloRef.current) {
          haloRef.current.remove();
          haloRef.current = null;
        }
      }

      // O mapa segue o ponto em passos de 1 px (sem animações a competir: voos, zoom)
      if (seguirRef.current && agora - ultimoPan >= 40) {
        try {
          const ocupado = Boolean((map as any)._animatingZoom || (map as any)._panAnim?._inProgress);
          if (!ocupado) {
            const centro = map.getSize().divideBy(2);
            const alvo = map.latLngToContainerPoint([q.lat, q.lon]);
            const dx = alvo.x - centro.x;
            const dy = alvo.y - centro.y;
            if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
              map.panBy([dx, dy], { animate: false });
              ultimoPan = agora;
            }
          }
        } catch {}
      }
    });
    return () => { parar(); };
  }, []);

  // Qualquer partida com linha e paragem (ou UNIR) abre o percurso, tenha ou não tempo real
  const podeAbrirLinha = (dep: any): boolean =>
    Boolean(dep?.tripId || (dep?.routeId && dep?.stopId) || (dep?.operatorId === 'unir' && dep?.unirLinha && dep?.unirParagem));

  // Tocar numa partida: mostra no mapa o percurso da linha e as suas paragens
  const abrirLinha = (dep: any) => {
    const pedido = ++pedidoLinhaRef.current;
    const linha = String(dep.lineCode || dep.route_short_name || '');
    // Identificador da linha na lista de linhas (Horários): o da partida; nas da UNIR (AMP) é "unir:<código>"
    const eUnir = dep.operatorId === 'unir' && Boolean(dep.unirLinha);
    const idLinha = dep.routeId ? String(dep.routeId) : (eUnir ? `unir:${dep.unirLinha}` : undefined);
    // As partidas da UNIR não trazem o nome da linha: vem da lista de linhas da paragem
    const nomeDaLinha = dep.lineName || dep.route_long_name
      || (selectedStop?.lines || []).find((l) => String(l.code) === linha)?.name || undefined;
    const base = {
      linha,
      cor: dep.lineColor as string | undefined,
      destino: destinoLegivel(dep.destination || dep.headsign, dep.lineName || dep.route_long_name),
      id: idLinha,
      dados: { name: nomeDaLinha, code: linha, color: dep.lineColor, operatorId: dep.operatorId, operatorName: eUnir ? 'UNIR' : dep.operatorName } as DadosLinhaFavorita,
    };
    let url = '';
    if (dep.tripId) {
      url = `/api/transit/percurso?trip=${encodeURIComponent(dep.tripId)}${dep.stopId ? `&stop=${encodeURIComponent(dep.stopId)}` : ''}${dep.routeId ? `&rota=${encodeURIComponent(dep.routeId)}&dest=${encodeURIComponent(dep.destination || dep.headsign || '')}` : ''}`;
    } else if (dep.operatorId === 'unir' && dep.unirLinha && dep.unirParagem) {
      url = `/api/transit/percurso?route=${encodeURIComponent(`unir:${dep.unirLinha}`)}&stop=${encodeURIComponent(`unir:${dep.unirParagem}`)}&sentido=${encodeURIComponent(dep.unirSentido || '')}&destino=${encodeURIComponent(dep.destination || '')}`;
    } else if (dep.routeId && dep.stopId) {
      // Sem viagem identificada: o servidor usa uma viagem da mesma linha que acabe neste destino
      url = `/api/transit/percurso?rota=${encodeURIComponent(dep.routeId)}&stop=${encodeURIComponent(dep.stopId)}&dest=${encodeURIComponent(dep.destination || dep.headsign || '')}`;
    }
    if (!url) { setLinhaAberta({ ...base, estado: 'erro' }); return; }
    setLinhaAberta({ ...base, estado: 'a-carregar' });
    fetch(url, { signal: AbortSignal.timeout(15000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (pedido !== pedidoLinhaRef.current) return;
        if (!p?.paragens?.length) { setLinhaAberta({ ...base, estado: 'erro' }); return; }
        setLinhaAberta({
          linha: base.linha || p.linha || '',
          cor: base.cor || p.cor,
          destino: base.destino || formatTransitName(p.destino || ''),
          // Se a partida não trazia o identificador da linha, vem com o percurso
          id: base.id || (p.rota ? String(p.rota) : undefined),
          dados: { ...base.dados, name: base.dados.name || (p.nome ? String(p.nome) : undefined) },
          estado: 'ok',
          percurso: { paragens: p.paragens, indice: Number.isFinite(p.indice) ? p.indice : -1 },
        });
      })
      .catch(() => { if (pedido === pedidoLinhaRef.current) setLinhaAberta({ ...base, estado: 'erro' }); });
  };
  const fecharLinha = () => {
    pedidoLinhaRef.current++;
    setLinhaAberta(null);
    // Volta a centrar na paragem (as outras paragens reaparecem à volta)
    const lat = Number(selectedStop?.latitude);
    const lon = Number(selectedStop?.longitude);
    if (selectedStop && isValidCoordinate(lat, lon)) safeFlyTo(mapRef.current, lat, lon, 16.5);
  };
  // Mudar de paragem fecha o percurso aberto (a não ser que se tenha tocado numa partida do cartão dessa paragem:
  // aí abre-se logo o percurso dessa linha)
  const linhaPendenteRef = useRef<{ stopId: string; dep: any } | null>(null);
  useEffect(() => {
    pedidoLinhaRef.current++;
    setLinhaAberta(null);
    const pendente = linhaPendenteRef.current;
    linhaPendenteRef.current = null;
    if (pendente && pendente.stopId === selectedStop?.id) abrirLinha(pendente.dep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop?.id]);
  // Tocar numa partida de um cartão da lista: abre a paragem e, nela, o percurso da linha
  const abrirLinhaDoCartao = (stop: NearbyStopItem, dep: any) => {
    if (selectedStop?.id === stop.id) { abrirLinha(dep); return; }
    linhaPendenteRef.current = { stopId: stop.id, dep };
    setSelectedStop(stop);
  };

  // Percurso da linha desenhado no mapa: o que falta percorrer a laranja, o que já passou esbatido
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    linhaLayerRef.current?.remove();
    linhaLayerRef.current = null;
    const percurso = linhaAberta?.percurso;
    if (!percurso) return;
    const pts = percurso.paragens.filter((p) => isValidCoordinate(p.lat, p.lon));
    if (pts.length < 2) return;
    const indice = percurso.indice >= 0 && percurso.indice < pts.length ? percurso.indice : 0;
    const todos: L.LatLngTuple[] = pts.map((p) => [p.lat, p.lon]);
    const restante = todos.slice(indice);
    const grupo = L.layerGroup();
    const nomeTip = (nome: string, extra?: string) =>
      `<span style="font:600 12px/1.2 Inter,system-ui,sans-serif">${escaparHtmlMapa(formatTransitName(nome))}${extra ? `<span style="font-weight:500;opacity:.75"> · ${escaparHtmlMapa(extra)}</span>` : ''}</span>`;

    if (indice > 0) {
      L.polyline(todos.slice(0, indice + 1), { color: '#FFFFFF', weight: 9, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(grupo);
      L.polyline(todos.slice(0, indice + 1), { color: '#FF6B1A', weight: 5, opacity: 0.35, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    }
    L.polyline(restante, { color: '#FFFFFF', weight: 11, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    L.polyline(restante, { color: '#FF6B1A', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);

    pts.forEach((p, i) => {
      if (i === indice || i === pts.length - 1) return;
      const passou = i < indice;
      L.circleMarker([p.lat, p.lon], { radius: 3.5, color: '#FF6B1A', weight: 2, opacity: passou ? 0.5 : 1, fillColor: '#FFFFFF', fillOpacity: 1 })
        .bindTooltip(nomeTip(p.nome, p.hora), { direction: 'top', offset: [0, -4], className: 'parou-rota-tip' })
        .addTo(grupo);
    });
    // Onde estou
    const aqui = pts[indice];
    L.circleMarker([aqui.lat, aqui.lon], { radius: 9, color: '#111111', weight: 3, fillColor: '#FF6B1A', fillOpacity: 1 })
      .bindTooltip(nomeTip(aqui.nome, aqui.hora), { permanent: true, direction: 'top', offset: [0, -9], className: 'parou-rota-tip' })
      .addTo(grupo);
    // Fim da linha
    const fim = pts[pts.length - 1];
    if (pts.length - 1 !== indice) {
      L.marker([fim.lat, fim.lon], {
        zIndexOffset: 900,
        icon: L.divIcon({
          className: 'parou-rota-destino',
          html: '<div style="width:26px;height:26px;border-radius:9999px;background:#111111;border:3px solid #FFFFFF;box-shadow:0 0 0 3px var(--cor-destaque,#FF6B1A),0 4px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22V4"/><path d="M5 4h13l-2.5 4.5L18 13H5"/></svg></div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).bindTooltip(nomeTip(fim.nome, fim.hora), { permanent: true, direction: 'bottom', offset: [0, 12], className: 'parou-rota-tip' }).addTo(grupo);
    }

    grupo.addTo(map);
    linhaLayerRef.current = grupo;
    setFollowMode(false);
    try {
      map.fitBounds(L.latLngBounds(restante.length > 1 ? restante : todos), { paddingTopLeft: [28, 76], paddingBottomRight: [28, 40], maxZoom: 16, animate: true });
    } catch (err) {
      console.warn('[PertoView] fitBounds da linha:', err);
    }
  }, [linhaAberta?.percurso]);

  // Ao ir a bordo, fecham-se a paragem e a linha que estavam abertas (o painel «A bordo» ocupa o seu lugar)
  useEffect(() => {
    if (aBordo.fase !== 'a-bordo') return;
    pedidoLinhaRef.current++;
    setLinhaAberta(null);
    setSelectedStop(null);
    setFollowMode(false);
  }, [aBordo.fase]);

  // Autocarros em direto no mapa: só os das linhas que estás a ver (paragem aberta, linha aberta ou paragens perto) e perto do que o mapa mostra
  const { linhasVeiculos, caixaVeiculos } = useMemo(() => {
    const redondo = (x: number) => Math.round(x / 0.005) * 0.005;
    const caixaEm = (lat: number, lon: number, dLat: number, dLon: number) => ({ sul: redondo(lat - dLat), norte: redondo(lat + dLat), oeste: redondo(lon - dLon), leste: redondo(lon + dLon) });
    if (aBordo.fase === 'a-bordo') return { linhasVeiculos: aBordo.chaveLinha ? [aBordo.chaveLinha] : [], caixaVeiculos: undefined };
    const chaves = new Set<string>();
    const dePartidas = (paragem: NearbyStopItem) => {
      for (const d of paragem.nextDepartures || []) {
        const k = chaveDaPartida({ routeId: d.routeId, operatorId: d.operatorId || paragem.operatorId, operatorName: d.operatorName || paragem.operatorName, lineCode: d.lineCode });
        if (k) chaves.add(k);
      }
      if (!(paragem.nextDepartures || []).length) {
        for (const l of paragem.lines || []) {
          const k = chaveDaPartida({ operatorId: paragem.operatorId, operatorName: paragem.operatorName, lineCode: l.code });
          if (k) chaves.add(k);
        }
      }
    };
    if (linhaAberta) {
      const k = chaveDaPartida({ routeId: linhaAberta.id, operatorId: linhaAberta.dados?.operatorId, operatorName: linhaAberta.dados?.operatorName, lineCode: linhaAberta.linha });
      if (k) chaves.add(k);
      const pts = (linhaAberta.percurso?.paragens || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (pts.length > 1) {
        const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
        const sul = Math.min(...lats) - 0.01, norte = Math.max(...lats) + 0.01, oeste = Math.min(...lons) - 0.01, leste = Math.max(...lons) + 0.01;
        if (norte - sul <= 0.28 && leste - oeste <= 0.28) return { linhasVeiculos: [...chaves], caixaVeiculos: { sul, norte, oeste, leste } };
      }
      return { linhasVeiculos: [...chaves], caixaVeiculos: undefined };
    }
    if (selectedStop) {
      dePartidas(selectedStop);
      const lat = Number(selectedStop.latitude), lon = Number(selectedStop.longitude);
      return { linhasVeiculos: [...chaves].slice(0, 30), caixaVeiculos: isValidCoordinate(lat, lon) ? caixaEm(lat, lon, 0.03, 0.04) : undefined };
    }
    if (!userCoords) return { linhasVeiculos: [], caixaVeiculos: undefined };
    stops.slice(0, 6).forEach(dePartidas);
    return { linhasVeiculos: [...chaves].slice(0, 30), caixaVeiculos: caixaEm(userCoords.latitude, userCoords.longitude, 0.008, 0.011) };
  }, [aBordo.fase, aBordo.chaveLinha, linhaAberta, selectedStop, stops, userCoords?.latitude, userCoords?.longitude]);

  // Ao abrir o percurso, a lista fica na paragem onde estou
  const paragemAquiRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (linhaAberta?.estado !== 'ok') return;
    // Desliza só a lista do percurso (scrollIntoView também deslizava o ecrã inteiro e o mapa
    // ficava meio escondido debaixo do cabeçalho)
    const t = setTimeout(() => {
      const li = paragemAquiRef.current;
      const lista = li?.closest('.overflow-y-auto') as HTMLElement | null;
      if (!li || !lista) return;
      const rLi = li.getBoundingClientRect();
      const rLista = lista.getBoundingClientRect();
      const alvo = lista.scrollTop + (rLi.top - rLista.top) - lista.clientHeight / 2 + rLi.height / 2;
      lista.scrollTo({ top: Math.max(0, alvo), behavior: 'smooth' });
    }, 80);
    return () => clearTimeout(t);
  }, [linhaAberta?.estado, linhaAberta?.percurso]);

  // Rota escolhida desenhada no mapa: linha laranja com as paragens, troços a pé a tracejado
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    rotaLayerRef.current?.remove();
    rotaLayerRef.current = null;
    if (!selectedRoute) return;

    const grupo = L.layerGroup();
    const limites: L.LatLngTuple[] = [];
    desenharPercurso(grupo, selectedRoute.legs, limites, true);

    // Destino
    if (selectedDestination && isValidCoordinate(selectedDestination.latitude, selectedDestination.longitude)) {
      limites.push([selectedDestination.latitude, selectedDestination.longitude]);
      L.marker([selectedDestination.latitude, selectedDestination.longitude], {
        zIndexOffset: 900,
        title: selectedDestination.title,
        icon: L.divIcon({
          className: 'parou-rota-destino',
          html: '<div style="width:28px;height:28px;border-radius:9999px;background:#111111;border:3px solid #FFFFFF;box-shadow:0 0 0 3px var(--cor-destaque,#FF6B1A),0 4px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22V4"/><path d="M5 4h13l-2.5 4.5L18 13H5"/></svg></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(grupo);
    }

    grupo.addTo(map);
    rotaLayerRef.current = grupo;

    if (limites.length > 1) {
      setFollowMode(false);
      try {
        map.fitBounds(L.latLngBounds(limites), { paddingTopLeft: [28, 76], paddingBottomRight: [28, 36], maxZoom: 16, animate: true });
      } catch (err) {
        console.warn('[PertoView] fitBounds da rota:', err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.id]);

  // Viagem com vários destinos no mapa: a opção escolhida de cada troço e os destinos numerados
  const mapaViagemRef = useRef<MapaViagem | null>(null);
  mapaViagemRef.current = mapaViagem;
  const chaveMapaViagem = mapaViagem
    ? `${mapaViagem.destinos.map((d) => d.uid).join(',')}|${mapaViagem.rotas.map((r) => (r ? `${r.id}@${r.departureTime}` : '-')).join(',')}|${mapaViagem.foco ?? 'todos'}`
    : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    viagemLayerRef.current?.remove();
    viagemLayerRef.current = null;
    const mv = mapaViagemRef.current;
    if (!mv) return;

    const grupo = L.layerGroup();
    const todos: L.LatLngTuple[] = [];
    const doFoco: L.LatLngTuple[] = [];
    const unicoTroco = mv.destinos.length === 1;
    mv.rotas.forEach((rota, i) => {
      if (!rota) return;
      const lim: L.LatLngTuple[] = [];
      // Etiquetas com as horas só no troço em foco (ou quando há um só): com cinco troços ficava tudo coberto
      desenharPercurso(grupo, rota.legs, lim, mv.foco === i || (mv.foco === null && unicoTroco));
      lim.forEach((p) => todos.push(p));
      if (mv.foco === i) lim.forEach((p) => doFoco.push(p));
    });

    mv.destinos.forEach((d, i) => {
      const { latitude, longitude, title } = d.dest;
      if (!isValidCoordinate(latitude, longitude)) return;
      todos.push([latitude, longitude]);
      if (mv.foco === i || mv.foco === i + 1) doFoco.push([latitude, longitude]);
      L.marker([latitude, longitude], {
        zIndexOffset: 900 + i,
        title,
        icon: L.divIcon({
          className: 'parou-rota-destino',
          html: `<div style="width:28px;height:28px;border-radius:9999px;background:#111111;border:3px solid #FFFFFF;box-shadow:0 0 0 3px var(--cor-destaque,#FF6B1A),0 4px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font:700 14px/1 'Barlow Condensed',Inter,sans-serif">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      })
        .bindTooltip(`<span style="font:600 12px/1.2 Inter,system-ui,sans-serif">${escaparHtmlMapa(title)}</span>`, { direction: 'top', offset: [0, -14], className: 'parou-rota-tip' })
        .addTo(grupo);
    });

    grupo.addTo(map);
    viagemLayerRef.current = grupo;

    const limites = mv.foco !== null && doFoco.length > 1 ? doFoco : todos;
    if (limites.length > 1) {
      setFollowMode(false);
      try {
        map.fitBounds(L.latLngBounds(limites), { paddingTopLeft: [28, 76], paddingBottomRight: [28, 36], maxZoom: 16, animate: true });
      } catch (err) {
        console.warn('[PertoView] fitBounds da viagem:', err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveMapaViagem]);

  // Filter Stops
  const filteredStops = useMemo(() => {
    return stops.filter((stop) => {
      const mode = normalizeTransportMode(stop.transportMode);
      if (activeFilterTab === 'todos') return true;
      if (activeFilterTab === 'metro') return mode === 'Metro';
      if (activeFilterTab === 'comboio') return mode === 'Comboio';
      if (activeFilterTab === 'autocarro') return mode === 'Autocarro';
      if (activeFilterTab === 'barco') return mode === 'Barco';
      // A lista viva manda: o isFavorite da paragem só reflete o momento em que foi pedida (e a estrela muda isto)
      if (activeFilterTab === 'favoritos') return favoriteStopIds.has(stop.id);
      return true;
    });
  }, [stops, activeFilterTab, favoriteStopIds]);

  // Só se desenham as paragens mais próximas; as restantes aparecem a pedido (cada cartão tem muitas partidas)
  const [maxParagens, setMaxParagens] = useState(24);
  useEffect(() => { setMaxParagens(24); }, [activeFilterTab]);

  // UNIR: pede à AMP as partidas das paragens UNIR mais próximas e da paragem aberta
  const unirPorParagemRef = useRef(unirPorParagem);
  unirPorParagemRef.current = unirPorParagem;
  const pedirUnir = useCallback((stop: NearbyStopItem) => {
    const codigos = codigosUnir(stop as any);
    if (!codigos.length) return;
    const atual = unirPorParagemRef.current[stop.id];
    if (unirPedidosRef.current.has(stop.id)) return;
    if (atual && !atual.aCarregar && Date.now() - atual.t < (atual.ok ? 5 * 60_000 : 60_000)) return;
    unirPedidosRef.current.add(stop.id);
    setUnirPorParagem((m) => ({ ...m, [stop.id]: { t: Date.now(), ok: atual?.ok ?? true, aCarregar: true, passagens: atual?.passagens || [] } }));
    passagensUnir(codigos)
      .then((r) => setUnirPorParagem((m) => ({ ...m, [stop.id]: { t: Date.now(), ok: r.ok, aCarregar: false, passagens: r.passagens } })))
      .catch(() => setUnirPorParagem((m) => ({ ...m, [stop.id]: { t: Date.now(), ok: false, aCarregar: false, passagens: [] } })))
      .finally(() => unirPedidosRef.current.delete(stop.id));
  }, []);
  useEffect(() => {
    filteredStops.slice(0, 6).forEach((st) => pedirUnir(st));
  }, [filteredStops, pedirUnir]);
  useEffect(() => {
    if (selectedStop) pedirUnir(selectedStop);
  }, [selectedStop?.id, pedirUnir]);
  const temUnir = Object.keys(unirPorParagem).length > 0;
  useEffect(() => {
    if (!temUnir) return;
    const t = setInterval(() => setTiqueUnir((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [temUnir]);
  const partidasUnirDe = (stop: NearbyStopItem | null, todas = false): any[] => {
    if (!stop) return [];
    const e = unirPorParagem[stop.id];
    if (!e?.passagens.length) return [];
    const cores = new Map<string, string>((stop.lines || []).map((l) => [String(l.code), l.color]));
    return partidasParaMostrar(e.passagens, cores, todas ? Infinity : 40);
  };

  // Os cartões vêm por distância; aqui passam a ficar por hora: primeiro a paragem onde passa algo mais cedo
  // (em empate, a mais perto; sem partidas, no fim). Assim "3 min" nunca aparece depois de "35 min".
  const paragensPorHora = useMemo(() => {
    const proxima = (stop: NearbyStopItem): number => {
      const deps = [...(stop.nextDepartures || []), ...partidasUnirDe(stop)];
      let melhor = Infinity;
      for (const d of deps) {
        const m = parseDepartureTime(d).minutesDiff;
        if (m < 999 && m < melhor) melhor = Math.max(0, m);
      }
      return melhor;
    };
    return filteredStops
      .map((stop, i) => ({ stop, i, k: proxima(stop) }))
      .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k - b.k))
      .map((x) => x.stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredStops, unirPorParagem, tiqueUnir]);
  const paragensVisiveis = useMemo(() => paragensPorHora.slice(0, maxParagens), [paragensPorHora, maxParagens]);

  // Render Stops on Map — só se mexe no que mudou (novo, saiu, mudou de estado), não em todos
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const marcadores = stopsMarkersRef.current;

    // Com o percurso de uma linha aberto, o mapa mostra só esse percurso (sem as outras paragens)
    if (linhaNoMapa) {
      marcadores.forEach((m) => m.marker.remove());
      marcadores.clear();
      return;
    }

    const selecionadaId = selectedStop?.id;
    const porId = new Map<string, NearbyStopItem>();
    filteredStops.forEach((stop) => {
      if (isValidCoordinate(Number(stop.latitude), Number(stop.longitude))) porId.set(stop.id, stop);
    });
    paragensPorIdRef.current = porId;

    // Saíram da lista
    marcadores.forEach((m, id) => {
      if (!porId.has(id)) { m.marker.remove(); marcadores.delete(id); }
    });

    porId.forEach((stop, id) => {
      const lat = Number(stop.latitude);
      const lon = Number(stop.longitude);
      const modo = normalizeTransportMode(stop.transportMode);
      const sel = selecionadaId === id;
      const atual = marcadores.get(id);
      if (atual) {
        if (atual.lat !== lat || atual.lon !== lon) { atual.marker.setLatLng([lat, lon]); atual.lat = lat; atual.lon = lon; }
        if (atual.modo !== modo || atual.sel !== sel) {
          atual.marker.setIcon(iconeParagem(modo, sel));
          atual.marker.setZIndexOffset(sel ? 1000 : 0);
          atual.modo = modo; atual.sel = sel;
        }
        return;
      }
      const estilo = ESTILO_MODO[modo] || ESTILO_MODO.Autocarro;
      const marker = L.marker([lat, lon], { icon: iconeParagem(modo, sel), zIndexOffset: sel ? 1000 : 0, title: `${estilo.plural} – ${formatTransitName(stop.name)}` }).addTo(map);
      // Lê a paragem mais recente (os dados vão sendo atualizados de 30 em 30 s)
      marker.on('click', () => {
        const maisRecente = paragensPorIdRef.current.get(id) || stop;
        setSelectedStop(maisRecente);
        setFollowMode(false);
        safeFlyTo(mapRef.current, Number(maisRecente.latitude), Number(maisRecente.longitude), 16.5);
      });
      marcadores.set(id, { marker, modo, sel, lat, lon });
    });
  }, [filteredStops, selectedStop?.id, linhaNoMapa]);

  // Ajusta o mapa quando muda de altura
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 320);
    return () => clearTimeout(timer);
  }, [mapaExpandido, Boolean(linhaAberta)]);

  // Primary short alert
  const topAlert = contextualAlerts[0] || null;

  const raio = raioUsado || selectedRadius;
  const raioTexto = raio >= 1000 ? `${(raio / 1000).toLocaleString(LOCALE)} km` : textoMetros(raio);
  const subtitulo = !localizacaoPronta
    ? (gpsStatus === 'requesting' ? t('A obter a tua localização…') : t('À espera da tua localização'))
    : isDbLoading && filteredStops.length === 0
      ? traduzirCarregamento(dbLoadingMessage || 'A carregar horários…')
      : userCoords?.isManual
        ? t('Perto de {local}', { local: userCoords.locationLabel || t('local escolhido') })
        : `${tn(filteredStops.length, '{n} paragem até {d}', '{n} paragens até {d}', { d: raioTexto })}${
            userCoords && userCoords.accuracy > 150 ? t(' · a afinar a posição…') : ''
          }`;

  const iconeModo = (modo: string) => {
    const m = normalizeTransportMode(modo);
    if (m === 'Metro') return TrainFrontTunnel;
    if (m === 'Comboio') return TrainFront;
    if (m === 'Barco') return Ship;
    return Bus;
  };

  // Ecrã próprio da rota: com um destino escolhido a lista de paragens dá lugar às opções de viagem
  const emRota = emViagem || (Boolean(selectedDestination) && (calculatedRoutes.length > 0 || isCalculatingRoutes || rotasCalculadas));

  // ── Paragens por onde se arrasta o mapa ──
  // Ao mexer no mapa carregam-se as paragens das zonas por onde se passa (células de ≈1 km, guardadas
  // em memória) e desenham-se por cima, sem tocar nas paragens de perto de ti. Só com zoom aproximado,
  // só com o mapa livre (não com a rota ou o percurso de uma linha) e com um teto de marcadores.
  const extrasAtivos = !linhaNoMapa && !emRota && localizacaoPronta;

  sincronizarExtrasRef.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const marcadores = extrasMarkersRef.current;
    const selecionadaId = selectedStop?.id;

    const removerTodos = (poupar?: string) => {
      filaExtrasRef.current = [];
      marcadores.forEach((m, id) => {
        if (id === poupar) return;
        m.marker.remove();
        marcadores.delete(id);
      });
    };
    if (!extrasAtivos) { removerTodos(); return; }
    if (map.getZoom() < ZOOM_MIN_EXTRAS) { removerTodos(selecionadaId); return; }

    const vista = limitesDoMapa(map, 0);
    const margem = limitesDoMapa(map, MARGEM_EXTRAS);
    const guardar = limitesDoMapa(map, MARGEM_EXTRAS * 2);
    const centro = map.getCenter();
    const cosLat = Math.cos((centro.lat * Math.PI) / 180);
    const distCentro = (p: { lat: number; lon: number }) => {
      const dy = p.lat - centro.lat;
      const dx = (p.lon - centro.lng) * cosLat;
      return dx * dx + dy * dy;
    };
    const dentro = (p: { lat: number; lon: number }, l: Limites) => p.lat >= l.sul && p.lat <= l.norte && p.lon >= l.oeste && p.lon <= l.este;

    // O que já vem "perto de ti" não se repete; o resto respeita o mesmo filtro (modo ou favoritos)
    const jaPerto = new Set<string>();
    stops.forEach((st) => jaPerto.add(st.id));
    const modoFiltro = activeFilterTab in MODO_DO_FILTRO ? MODO_DO_FILTRO[activeFilterTab as keyof typeof MODO_DO_FILTRO] : null;
    const passa = (p: ParagemLeve) => {
      if (jaPerto.has(p.id)) return false;
      if (activeFilterTab === 'todos') return true;
      if (activeFilterTab === 'favoritos') return favoriteStopIds.has(p.id);
      return p.modo === modoFiltro;
    };
    const candidatas = paragensNosLimites(guardar).filter(passa);
    const permitidas = new Set<string>();
    candidatas.forEach((p) => permitidas.add(p.id));

    // Saem as que ficaram longe, foram filtradas ou passaram a ser de perto de ti (a aberta fica sempre)
    marcadores.forEach((m, id) => {
      if (id !== selecionadaId && !permitidas.has(id)) { m.marker.remove(); marcadores.delete(id); }
    });

    // A aberta destaca-se; as outras voltam ao normal
    marcadores.forEach((m, id) => {
      const sel = id === selecionadaId;
      if (m.sel !== sel) {
        m.marker.setIcon(iconeParagem(normalizeTransportMode(m.modo), sel, true));
        m.marker.setZIndexOffset(sel ? 1000 : 0);
        m.sel = sel;
      }
    });

    // As do ecrã primeiro, depois as da margem, sempre das mais centrais para as mais afastadas
    filaExtrasRef.current = candidatas
      .filter((p) => !marcadores.has(p.id) && dentro(p, margem))
      .map((p) => ({ p, ecra: dentro(p, vista) ? 0 : 1, d: distCentro(p) }))
      .sort((a, b) => a.ecra - b.ecra || a.d - b.d)
      .slice(0, MAX_EXTRAS_NOVOS)
      .map((x) => x.p);
    contextoExtrasRef.current = { vista, centro: { lat: centro.lat, lng: centro.lng }, cosLat, selecionadaId };

    // Desenha aos poucos (uns 40 por imagem) para o arrastar não encravar. Um só ciclo de desenho de
    // cada vez: uma sincronização nova só troca a lista do que falta desenhar (sem recomeçar)
    if (filaExtrasRef.current.length === 0 || desenhandoExtrasRef.current) return;
    desenhandoExtrasRef.current = true;
    const passo = () => {
      const mapa = mapRef.current;
      const fila = filaExtrasRef.current;
      if (!mapa || mapa !== map || fila.length === 0) { desenhandoExtrasRef.current = false; return; }
      const ctx = contextoExtrasRef.current;
      if (!ctx) { desenhandoExtrasRef.current = false; return; }
      const dist = (lat: number, lon: number) => {
        const dy = lat - ctx.centro.lat;
        const dx = (lon - ctx.centro.lng) * ctx.cosLat;
        return dx * dx + dy * dy;
      };
      const prioridade = (lat: number, lon: number) => (dentro({ lat, lon }, ctx.vista) ? 0 : 1);
      let piores: Array<{ id: string; pr: number; d: number }> | null = null;
      let feitas = 0;
      while (fila.length > 0 && feitas < 40) {
        const p = fila.shift()!;
        if (marcadores.has(p.id)) continue;
        // No teto, cada nova só entra se trocar por uma pior (fora do ecrã ou mais afastada do centro)
        if (marcadores.size >= MAX_EXTRAS_TOTAL) {
          if (!piores) {
            piores = [];
            marcadores.forEach((m, id) => { if (id !== ctx.selecionadaId) piores!.push({ id, pr: prioridade(m.lat, m.lon), d: dist(m.lat, m.lon) }); });
            piores.sort((x, y) => x.pr - y.pr || x.d - y.d); // a pior fica no fim
          }
          const pior = piores[piores.length - 1];
          const pr = prioridade(p.lat, p.lon);
          if (!pior || pior.pr < pr || (pior.pr === pr && pior.d <= dist(p.lat, p.lon))) { fila.length = 0; break; }
          piores.pop();
          marcadores.get(pior.id)?.marker.remove();
          marcadores.delete(pior.id);
        }
        const sel = p.id === ctx.selecionadaId;
        const estilo = ESTILO_MODO[p.modo] || ESTILO_MODO.Autocarro;
        const marker = L.marker([p.lat, p.lon], {
          icon: iconeParagem(p.modo, sel, true),
          zIndexOffset: sel ? 1000 : 0,
          keyboard: false,
          title: `${estilo.plural} – ${formatTransitName(p.nome)}`,
        }).addTo(map);
        marker.on('click', () => abrirParagemLeveRef.current(p));
        marcadores.set(p.id, { marker, modo: p.modo, sel, lat: p.lat, lon: p.lon });
        feitas++;
      }
      if (fila.length > 0) requestAnimationFrame(passo);
      else desenhandoExtrasRef.current = false;
    };
    requestAnimationFrame(passo);
  };

  carregarExtrasRef.current = () => {
    const map = mapRef.current;
    if (!map || !extrasAtivos || map.getZoom() < ZOOM_MIN_EXTRAS) return;
    carregarCelulas(celulasDosLimites(limitesDoMapa(map, MARGEM_EXTRAS))).catch(() => {});
  };

  // Toque numa paragem de outra zona: abre já com o que se sabe e completa (linhas, sentido, outras
  // paragens no mesmo sítio) com um pedido pequeno àquele ponto; as partidas vêm do painel, como sempre
  abrirParagemLeveRef.current = (p: ParagemLeve) => {
    const item = itemDeParagemLeve(p, coordsRef.current);
    const pedido = ++enriquecerRef.current;
    setGrupoExtra([]);
    setSelectedStop(item);
    setFollowMode(false);
    safeFlyTo(mapRef.current, p.lat, p.lon, 16.5);
    fetchNearbyTransit(p.lat, p.lon, 60, AbortSignal.timeout(15000))
      .then((data) => {
        if (pedido !== enriquecerRef.current || data.isLoading) return;
        const lista = data.stops || [];
        const alvo = lista.find((st) => st.id === p.id);
        if (!alvo) return;
        const de = coordsRef.current;
        const comDistancia = (st: NearbyStopItem): NearbyStopItem => ({ ...st, ...distanciaParaItem(de, st.latitude, st.longitude) });
        setGrupoExtra(lista.filter((st) => st.id !== alvo.id && metrosEntre(st, alvo) <= 30).map(comDistancia));
        setSelectedStop((atual) => (atual && atual.id === p.id ? comDistancia(alvo) : atual));
      })
      .catch(() => {});
  };

  // Mexer no mapa: carrega e desenha (no máximo 4 vezes por segundo) e, ao parar, de imediato
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ultimo = 0;
    const executar = () => {
      timer = null;
      ultimo = Date.now();
      carregarExtrasRef.current();
      sincronizarExtrasRef.current();
    };
    const agendar = (imediato: boolean) => {
      if (timer !== null) {
        if (!imediato) return;
        clearTimeout(timer);
      }
      timer = setTimeout(executar, imediato ? 0 : Math.max(0, 250 - (Date.now() - ultimo)));
    };
    const aoMover = () => agendar(false);
    const aoParar = () => agendar(true);
    map.on('move', aoMover);
    map.on('moveend', aoParar);
    map.on('zoomend', aoParar);
    const deixarDeOuvir = aoChegarCelula(() => agendar(false));
    agendar(true);
    return () => {
      map.off('move', aoMover);
      map.off('moveend', aoParar);
      map.off('zoomend', aoParar);
      deixarDeOuvir();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  // Mudou o que condiciona as paragens extra (lista de perto, filtro, favoritos, paragem aberta, mapa livre):
  // redesenha de imediato com o que já está em memória...
  useEffect(() => {
    sincronizarExtrasRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, activeFilterTab, favoriteStopIds, selectedStop?.id, extrasAtivos]);
  // ...e pede o que falta daqui a pouco: ao abrir, o mapa ainda está a "voar" até à tua posição e não vale a pena
  // carregar a zona por onde ele passa (ao chegar, o fim do movimento pede a certa)
  useEffect(() => {
    const espera = setTimeout(() => carregarExtrasRef.current(), 400);
    return () => clearTimeout(espera);
  }, [activeFilterTab, extrasAtivos]);

  useEffect(() => { if (!selectedStop) { enriquecerRef.current++; setGrupoExtra([]); } }, [selectedStop]);

  // Lista de sugestões (pesquisa de destino ou de local)
  const listaSugestoes = (compacta: boolean) => (
    <div className={`bg-[#FFFFFF] border border-[#E6E6E3] rounded-[12px] shadow-lg divide-y divide-[#E6E6E3] overflow-y-auto ${compacta ? 'max-h-48' : 'max-h-56'}`}>
      {suggestions.map((sug, sIdx) => (
        <button
          key={`sug-${sug.id}-${sIdx}`}
          onClick={() => handleSelectDestination(sug)}
          className="w-full text-left px-3 py-2.5 hover:bg-[#F4F4F2] active:bg-[#F4F4F2] transition-colors flex items-center gap-2.5 cursor-pointer min-h-[44px]"
        >
          <MapPin className="w-4 h-4 text-[#6B6B6B] shrink-0 stroke-[2]" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#111111] truncate">{sug.title}</div>
            {sug.subtitle && <div className="text-[11px] text-[#6B6B6B] truncate">{sug.subtitle}</div>}
          </div>
        </button>
      ))}
    </div>
  );

  // Convite para ativar a localização (por cima do mapa desfocado)
  const conviteLocalizacao = () => {
    if (pesquisarLocal) {
      return (
        <div className="w-full max-w-[360px] rounded-[18px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-[0_16px_40px_rgba(17,17,17,0.18)] p-3.5 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-bold text-[#111111]">{t('Procurar um local')}</span>
            <button
              onClick={() => { setPesquisarLocal(false); setDestinationQuery(''); }}
              className="text-[12px] font-semibold text-[#6B6B6B] cursor-pointer px-1 py-1"
            >
              {t('Voltar')}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
            <InputPesquisa
              autoFocus
              valor={destinationQuery}
              onTexto={setDestinationQuery}
              placeholder={t('Rua, localidade ou paragem')}
              className="w-full pl-9 pr-3 h-11 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[10px] text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]"
            />
          </div>
          {suggestions.length > 0 && <div className="mt-2">{listaSugestoes(true)}</div>}
        </div>
      );
    }

    const aPedir = gpsStatus === 'requesting' && !pedidoLento;
    const bloqueada = gpsStatus === 'denied';
    const semSinal = gpsStatus === 'unavailable' || (gpsStatus === 'requesting' && pedidoLento);
    const telemovelDesligado = bloqueada && motivoBloqueio === 'sistema';
    const recusou = bloqueada && motivoBloqueio === 'recusado';

    // Sem localização: três opções — pedir outra vez, tentar outra vez (depois de ligar a
    // localização ou mudar as definições) e escolher um local à mão
    if (bloqueada || semSinal) {
      const desligada = telemovelDesligado || semSinal;
      const titulo = desligada ? 'Liga a localização' : recusou ? 'Localização não autorizada' : 'Localização bloqueada';
      const texto = desligada
        ? 'A localização do telemóvel parece estar desligada. Liga-a e a PAROU continua sozinha.'
        : recusou
          ? 'Toca em Ativar localização e escolhe Permitir quando o telemóvel perguntar.'
          : 'O browser não está a deixar a PAROU usar a localização.';
      const passos: string[] = desligada
        ? (eIphone
            ? ['Abre Definições › Privacidade e segurança › Serviços de localização e liga-os.', 'Na mesma lista, em Safari, escolhe «Durante a utilização».', 'Volta aqui: a PAROU tenta outra vez sozinha.']
            : ['Desliza o dedo de cima para baixo e liga a Localização.', 'A poupança de bateria também a pode desligar.', 'Se mesmo assim não der: ⓘ ao lado do endereço › Permissões › Localização › Permitir.'])
        : (eIphone
            ? ['No Safari, toca em «aA» (ou ⋯) ao lado do endereço › Definições do site.', 'Em Localização, escolhe «Permitir».', 'Confirma também Definições › Privacidade › Serviços de localização.']
            : ['Toca no ⓘ ou no cadeado ao lado do endereço.', 'Abre Permissões › Localização e escolhe «Permitir».', 'Confirma também que a Localização do telemóvel está ligada.']);
      return (
        <div className="w-full max-w-[340px] rounded-[18px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-[0_16px_40px_rgba(17,17,17,0.18)] px-4 pt-4 pb-2 text-center">
          <div className="flex items-center gap-3 text-left">
            <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center bg-[#F4F4F2] text-[#111111]">
              <MapPinOff className="w-5 h-5 stroke-[2.25]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[16.5px] font-bold text-[#111111] leading-tight">{t(titulo)}</h2>
              <p className="mt-0.5 text-[12.5px] text-[#6B6B6B] leading-snug">{t(texto)}</p>
            </div>
          </div>

          <button
            onClick={() => {
              activateLocation(true);
              // Se o telemóvel não chegar a perguntar, mostra como resolver
              setTimeout(() => setAjudaLocalizacao(true), 1200);
            }}
            data-teste="ativar-localizacao"
            className="mt-3.5 w-full h-11 rounded-[12px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Navigation className="w-[18px] h-[18px] stroke-[2.25]" />
            {t('Ativar localização')}
          </button>
          <button
            onClick={() => activateLocation(true)}
            data-teste="tentar-localizacao"
            className="mt-2 w-full h-10 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] text-[#111111] font-semibold text-[14px] flex items-center justify-center gap-2 active:bg-[#F4F4F2] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 stroke-[2.25]" />
            {t('Tentar outra vez')}
          </button>

          {ajudaLocalizacao && (
            <ol className="mt-2.5 text-left text-[12.5px] text-[#111111] leading-snug space-y-1 bg-[#F4F4F2] rounded-[12px] p-3 list-decimal pl-7">
              {passos.map((p) => <li key={p}>{t(p)}</li>)}
            </ol>
          )}

          <div className="mt-1 flex items-center justify-center divide-x divide-[#E6E6E3]">
            {!ajudaLocalizacao && (
              <button
                onClick={() => setAjudaLocalizacao(true)}
                className="h-10 px-3 text-[13px] font-medium text-[#6B6B6B] cursor-pointer"
              >
                {t('Como resolver?')}
              </button>
            )}
            <button
              onClick={() => { setPesquisarLocal(true); setDestinationQuery(''); }}
              className="h-10 px-3 text-[13px] font-semibold text-[#111111] cursor-pointer"
            >
              {t('Escolher um local')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[340px] rounded-[18px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-[0_16px_40px_rgba(17,17,17,0.18)] px-5 pt-5 pb-4 text-center">
        <div className="relative mx-auto w-14 h-14 flex items-center justify-center">
          {!bloqueada && !semSinal && <span className="absolute inset-0 rounded-full bg-[#FF6B1A]/25 animate-ping" />}
          <span className={`relative w-14 h-14 rounded-full flex items-center justify-center ${bloqueada || semSinal ? 'bg-[#F4F4F2] text-[#111111]' : 'bg-[#FF6B1A] text-[#111111]'}`}>
            {aPedir ? (
              <RefreshCw className="w-6 h-6 stroke-[2.25] animate-spin" />
            ) : bloqueada || semSinal ? (
              <MapPinOff className="w-6 h-6 stroke-[2.25]" />
            ) : (
              <Navigation className="w-6 h-6 stroke-[2.25]" />
            )}
          </span>
        </div>
        <h2 className="mt-3 text-[18px] font-bold text-[#111111] leading-tight">
          {t(aPedir ? 'A localizar…' : bloqueada ? 'Localização bloqueada' : semSinal ? 'Sem sinal de GPS' : 'Vê o que passa perto de ti')}
        </h2>
        <p className="mt-1.5 text-[13px] text-[#6B6B6B] leading-snug">
          {t(aPedir
            ? 'Se o telemóvel perguntar, toca em Permitir.'
            : bloqueada
              ? 'Toca no cadeado (ou no ⓘ) ao lado do endereço, permite a Localização e volta a tentar.'
              : semSinal
                ? 'Não conseguimos obter a tua posição. Confirma que a localização do telemóvel está ligada.'
                : 'Ativa a localização para veres as paragens à tua volta e quando chega o próximo autocarro, metro ou comboio, em tempo real.')}
        </p>
        {!bloqueada && !semSinal && (
          <NotaLocalizacao onAbrir={() => setDialogoLocalizacao(true)} className="mt-2.5 -mb-1" centrada />
        )}
        {!aPedir && (
          <button
            onClick={() => activateLocation(true)}
            data-teste="ativar-localizacao"
            className="mt-4 w-full h-12 rounded-[12px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <LocateFixed className="w-[18px] h-[18px] stroke-[2.25]" />
            {t(bloqueada || semSinal ? 'Tentar outra vez' : 'Ativar localização')}
          </button>
        )}
        <button
          onClick={() => { setPesquisarLocal(true); setDestinationQuery(''); }}
          className="mt-2 w-full h-10 text-[13px] font-semibold text-[#111111] underline-offset-2 hover:underline cursor-pointer"
        >
          {t('Ou escolhe um local')}
        </button>
      </div>
    );
  };

  return (
    <div
      className="relative flex flex-col lg:flex-row w-full h-full bg-[#FFFFFF] overflow-hidden"
      // O ecrã do Perto nunca desliza como um todo (só as listas lá dentro)
      onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } }}
    >
      {/* Painel: Transportes perto */}
      <aside className="relative z-10 -mt-4 lg:mt-0 flex-1 min-h-0 lg:flex-none lg:w-[460px] lg:h-full flex flex-col bg-[#FFFFFF] rounded-t-[20px] lg:rounded-none shadow-[0_-8px_24px_rgba(17,17,17,0.08)] lg:shadow-none lg:border-r lg:border-[#E6E6E3]">
        {/* Cabeçalho (telemóvel): na rota, seta para voltar aos transportes perto */}
        {emRota && (selectedDestination || emViagem) && (
          <div className="lg:hidden shrink-0 px-4 pt-1 pb-2.5 touch-none" {...gestoPainel}>
            <button
              onClick={() => setMapaExpandido((v) => !v)}
              className="flex items-center justify-center w-full h-6 cursor-pointer"
              aria-label={t(mapaExpandido ? 'Aumentar a lista' : 'Encolher a lista e ver o mapa')}
            >
              <span className="block w-10 h-1.5 rounded-full bg-[#D4D4D0]" />
            </button>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleClearDestination}
                className="shrink-0 w-10 h-10 -ml-1 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer"
                aria-label={t('Voltar aos transportes perto')}
              >
                <ArrowLeft className="w-5 h-5 stroke-[2.25]" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="font-condensada text-[22px] leading-none font-bold text-[#111111]">{t('Como chegar')}</h2>
                <p className="text-[12px] text-[#6B6B6B] mt-1 truncate">
                  {destinosViagem.length > 1 ? tn(destinosViagem.length, '{n} paragem', '{n} paragens') : t('a {d}', { d: (destinosViagem[0]?.dest ?? selectedDestination)?.title || '' })}
                </p>
              </div>
              {(emViagem || calculatedRoutes.length > 0) && (
                <button
                  onClick={abrirEditor}
                  data-teste="juntar-paragem-cabecalho"
                  className="shrink-0 w-11 h-11 rounded-full border border-[#E6E6E3] bg-[#FFFFFF] text-[#111111] flex items-center justify-center cursor-pointer active:bg-[#F4F4F2]"
                  aria-label={t('Adicionar paragens à rota')}
                  title={t('Adicionar paragens à rota')}
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        )}
        {/* Cabeçalho (telemóvel) */}
        <div className={`${emRota ? 'hidden ' : ''}lg:hidden shrink-0 px-4 pt-1 pb-2.5 touch-none`} {...gestoPainel}>
          <button
            onClick={() => setMapaExpandido((v) => !v)}
            className="flex items-center justify-center w-full h-6 cursor-pointer"
            aria-label={t(mapaExpandido ? 'Aumentar a lista' : 'Encolher a lista e ver o mapa')}
          >
            <span className="block w-10 h-1.5 rounded-full bg-[#D4D4D0]" />
          </button>
          <div className="mt-2.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-condensada text-[22px] leading-none font-bold text-[#111111]">
                {t('Transportes perto')}
              </h2>
              <p className="text-[12px] text-[#6B6B6B] mt-1 truncate">{subtitulo}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              {botaoFavoritos}
              {localizacaoPronta && (userCoords?.isManual ? (
                <button
                  onClick={() => activateLocation(true)}
                  className="shrink-0 h-8 px-3 rounded-full bg-[#111111] text-[#FFFFFF] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5 stroke-[2.25]" /> {t('Usar GPS')}
                </button>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#F4F4F2] text-[11px] font-bold uppercase tracking-wide text-[#111111]">
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-60 animate-ping" />
                    <span className="relative inline-flex w-2 h-2 rounded-full bg-[#16A34A]" />
                  </span>
                  {t('Ao vivo')}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop Header: Brand / Search / Radar Context */}
        <div className="hidden lg:flex flex-col p-4 border-b border-[#E6E6E3] bg-[#FFFFFF] gap-3">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-3">
              {botaoFavoritos}
              <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'bg-[#16A34A]' : 'bg-[#6B6B6B]'}`} />
              <span className="text-xs text-[#6B6B6B] font-medium">
                {t(gpsStatus === 'active' ? (userCoords?.isManual ? 'Local escolhido' : 'GPS ativo') : gpsStatus === 'requesting' ? 'A localizar…' : 'Localização desligada')}
              </span>
            </div>
            </div>
          </div>

          {/* Search Box */}
          <div className={`relative flex items-center gap-2 ${emViagem ? 'hidden' : ''}`}>
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
              <InputPesquisa
                valor={destinationQuery}
                onTexto={setDestinationQuery}
                onLimpar={handleClearDestination}
                placeholder={localizacaoPronta ? t('Para onde vais?') : t('Procurar um local')}
                className="w-full pl-9 pr-8 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[10px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
                classeLimpar="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111] p-1 cursor-pointer"
                rotuloLimpar={t('Limpar pesquisa')}
              />
            </div>
            {localizacaoPronta && !pesquisarLocal && (
              <button
                type="button"
                onClick={abrirEditor}
                data-teste="juntar-paragem-pc"
                className="shrink-0 w-11 h-11 rounded-full bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer hover:bg-[#E6E6E3]"
                aria-label={t('Adicionar paragens à rota')}
                title={t('Adicionar paragens à rota')}
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}
            {suggestions.length > 0 && !pesquisarLocal && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50">{listaSugestoes(false)}</div>
            )}
          </div>
        </div>

        {/* Contextual Alert Banner */}
        {!emRota && topAlert && localizacaoPronta && (
          <div className="mx-3 mb-2 lg:mx-0 lg:mb-0 px-3 py-2 bg-[#FFF7ED] border border-[#FFEDD5] lg:border-x-0 lg:border-t-0 rounded-[10px] lg:rounded-none flex items-center justify-between text-xs text-[#9A3412] shrink-0">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="w-3.5 h-3.5 text-[#C2410C] shrink-0 stroke-[2]" />
              <span className="font-semibold truncate">{topAlert.título || (topAlert as any).title}</span>
            </div>
            <span className="font-condensada text-[11px] font-bold text-[#C2410C] uppercase tracking-wide shrink-0 ml-2">
              {topAlert.severity}
            </span>
          </div>
        )}

        {/* Filtros por modo */}
        {!emRota && (
        <div className="flex items-center px-3 lg:px-4 pb-2 lg:py-2 lg:border-b lg:border-[#E6E6E3] gap-1.5 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(['todos', 'autocarro', 'metro', 'comboio', 'barco', 'favoritos'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilterTab(tab)}
              disabled={!localizacaoPronta}
              className={`shrink-0 h-8 px-3 text-[13px] font-semibold rounded-full capitalize whitespace-nowrap transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                activeFilterTab === tab
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#F4F4F2] text-[#111111]'
              }`}
            >
              {tab === 'todos' ? t('Todos') : tab === 'favoritos' ? t('Favoritas') : t(tab)}
            </button>
          ))}
        </div>
        )}

        {/* Percursos: a calcular / sem resultados */}
        {emRota && !emViagem && selectedDestination && calculatedRoutes.length === 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-6">
            <div className="hidden lg:flex items-center gap-2.5 pb-3">
              <button onClick={handleClearDestination} className="shrink-0 w-9 h-9 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer" aria-label={t('Voltar aos transportes perto')}>
                <ArrowLeft className="w-4.5 h-4.5 stroke-[2.25]" />
              </button>
              <span className="font-semibold text-[15px] text-[#111111] truncate">{t('Como chegar')} {t('a {d}', { d: selectedDestination.title })}</span>
            </div>
            {isCalculatingRoutes ? (
              <div className="rounded-[14px] border border-[#E6E6E3] p-4 flex items-center gap-3 text-[14px] text-[#6B6B6B]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2] shrink-0" />
                <span>{t('A calcular percursos com os horários de hoje…')}</span>
              </div>
            ) : (
              <div className="rounded-[14px] bg-[#F4F4F2] p-4">
                <p className="text-[14px] font-semibold text-[#111111]">{t('Sem ligações encontradas')}</p>
                <p className="text-[13px] text-[#6B6B6B] mt-1 leading-snug">
                  {textoSemLigacao(longeRota)}
                </p>
                <button onClick={handleClearDestination} className="mt-3 h-10 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold cursor-pointer">
                  {t('Voltar aos transportes perto')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Vários destinos: um troço por destino, cada um com as suas opções */}
        {emViagem && (
          <RotaVariosDestinos
            origem={{ lat: userCoords?.latitude ?? 38.7253, lon: userCoords?.longitude ?? -9.1500 }}
            origemNome={userCoords?.isManual ? userCoords.locationLabel : undefined}
            destinos={destinosViagem}
            onMudar={setDestinosViagem}
            onSair={handleClearDestination}
            onMapa={setMapaViagem}
            onAdicionar={abrirEditor}
            inicial={viagemSemente}
          />
        )}

        {/* Route Planning Result Panel (if destination active) */}
        {emRota && !emViagem && selectedDestination && calculatedRoutes.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-6 space-y-3">
            <div className="hidden lg:flex items-center gap-2.5 px-1 pb-1">
              <button onClick={handleClearDestination} className="shrink-0 w-9 h-9 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer" aria-label={t('Voltar aos transportes perto')}>
                <ArrowLeft className="w-4.5 h-4.5 stroke-[2.25]" />
              </button>
              <span className="font-semibold text-[15px] text-[#111111] truncate min-w-0 flex-1">{t('Como chegar')} {t('a {d}', { d: selectedDestination.title })}</span>
              <button
                onClick={abrirEditor}
                data-teste="juntar-paragem-cabecalho-pc"
                className="shrink-0 w-9 h-9 rounded-full border border-[#E6E6E3] bg-[#FFFFFF] text-[#111111] flex items-center justify-center cursor-pointer hover:bg-[#F4F4F2]"
                aria-label={t('Adicionar paragens à rota')}
                title={t('Adicionar paragens à rota')}
              >
                <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
              </button>
            </div>

            <div className="space-y-2">
              {calculatedRoutes.map((route) => (
                <OpcaoRota
                  key={route.id}
                  route={route}
                  selecionada={selectedRoute?.id === route.id}
                  detalhes={rotaAbertaId === route.id}
                  destinoNome={selectedDestination.title}
                  onSelecionar={() => { setSelectedRoute(route); setRotaAbertaId((aberta) => (aberta === route.id ? null : route.id)); }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Lista de paragens */}
        {!emRota && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-4 lg:px-3 lg:pt-3 space-y-2">
          {!localizacaoPronta ? (
            <div className="space-y-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-[14px] border border-[#E6E6E3] p-3.5" style={{ opacity: 1 - i * 0.28 }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className={`h-4 w-1/2 rounded bg-[#F4F4F2] ${gpsStatus === 'requesting' ? 'animate-pulse' : ''}`} />
                    <div className={`h-5 w-12 rounded-full bg-[#F4F4F2] ${gpsStatus === 'requesting' ? 'animate-pulse' : ''}`} />
                  </div>
                  <div className="mt-3 flex items-center gap-2.5">
                    <div className="h-7 w-9 rounded-[4px] bg-[#F4F4F2]" />
                    <div className="h-3.5 flex-1 rounded bg-[#F4F4F2]" />
                    <div className="h-6 w-12 rounded bg-[#F4F4F2]" />
                  </div>
                </div>
              ))}
            </div>
          ) : isDbLoading && filteredStops.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2]" />
              <span>{traduzirCarregamento(dbLoadingMessage || 'A carregar horários…')}</span>
            </div>
          ) : isLoadingNearby && filteredStops.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin stroke-[2]" />
              <span>{t('A procurar paragens próximas…')}</span>
            </div>
          ) : filteredStops.length > 0 ? (
            <>
            {paragensVisiveis.map((stop) => {
              const isSelected = selectedStop?.id === stop.id;
              const stopDeps = [...(stop.nextDepartures || []), ...partidasUnirDe(stop)];
              const IconeModo = iconeModo(stop.transportMode);

              // Detetar aviso de desatualizado uma única vez por grupo/operador
              const outdatedDeps = stopDeps.filter((d: any) => parseDepartureTime(d).isOutdated);
              const outdatedOps = Array.from(new Set(
                outdatedDeps.map((d: any) => d.agency_name || d.operator || d.operatorName || '').filter(Boolean)
              ));
              const outdatedNotice = outdatedOps.length > 0
                ? outdatedOps.join(' e ')
                : (outdatedDeps.length > 0 ? (stop.operatorName || 'STCP') : null);

              return (
                <div
                  key={stop.id}
                  data-teste="paragem-perto"
                  className={`rounded-[14px] border p-3.5 transition-colors cursor-pointer ${
                    isSelected ? 'border-[#111111] bg-[#F4F4F2]/60' : 'border-[#E6E6E3] bg-[#FFFFFF] active:bg-[#F4F4F2]'
                  }`}
                  onClick={() => {
                    setSelectedStop(stop);
                    const lat = Number(stop.latitude);
                    const lon = Number(stop.longitude);
                    if (isValidCoordinate(lat, lon)) {
                      setFollowMode(false);
                      safeFlyTo(mapRef.current, lat, lon, 16.5);
                    }
                  }}
                >
                  {/* Cabeçalho da paragem */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconeModo className="w-4 h-4 text-[#6B6B6B] stroke-[2] shrink-0" />
                      <div className="min-w-0">
                        <h2 className="text-[16px] font-semibold text-[#111111] leading-snug truncate">
                          {formatTransitName(stop.name)}
                        </h2>
                        {stop.direction && (
                          <div className={`text-[12.5px] leading-tight truncate mt-0.5 ${stop.arrivalsOnly ? 'text-[#6B6B6B]' : 'text-[#111111]/70 font-medium'}`}>
                            {textoSentido(stop)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-0.5">
                      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#F4F4F2] font-condensada text-[13px] font-bold text-[#111111] tabular-nums">
                        <Footprints className="w-3 h-3 stroke-[2.25] text-[#6B6B6B]" />
                        {distanciaViva(userCoords, stop)?.texto ?? traduzirDistancia(stop.formattedDistance)}
                      </span>
                      {/* Estrela no canto direito: alvo de toque de 40 px, mas ocupa pouco espaço (margens negativas) */}
                      {botaoFavorito(stop, '-my-2 -mr-2')}
                    </div>
                  </div>

                  {/* Partidas */}
                  {stopDeps.length > 0 ? (
                    <div className="mt-2 divide-y divide-[#E6E6E3]">
                      {outdatedNotice && (
                        <div className="py-1 px-1 mb-1 bg-[#F4F4F2] rounded-[6px] text-[11px] text-[#6B6B6B] flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                          <span>Horários {outdatedNotice} podem estar desatualizados</span>
                        </div>
                      )}

                      {sortDepartures(stopDeps).slice(0, 3).map((dep: any, dIdx: number) => {
                        const parsed = parseDepartureTime(dep);
                        const lineCode = dep.lineCode || dep.route_short_name || stop.lines?.[0]?.code || '—';
                        const lineColor = dep.lineColor || stop.lines?.[0]?.color;
                        const destination = destinoLegivel(dep.destination || dep.headsign, dep.lineName || dep.route_long_name || stop.lines?.[0]?.name) || 'Destino';

                        const podeAbrir = podeAbrirLinha(dep);
                        const abrir = () => abrirLinhaDoCartao(stop, dep);

                        return (
                          <div
                            key={dIdx}
                            data-teste="partida-perto"
                            role={podeAbrir ? 'button' : undefined}
                            tabIndex={podeAbrir ? 0 : undefined}
                            onClick={podeAbrir ? (e) => { e.stopPropagation(); abrir(); } : undefined}
                            onKeyDown={podeAbrir ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); abrir(); } } : undefined}
                            aria-label={podeAbrir ? `Ver o percurso da linha ${lineCode} para ${destination}` : undefined}
                            className={`py-2 flex items-center justify-between gap-3 ${podeAbrir ? 'cursor-pointer active:bg-[#F4F4F2]' : ''}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LineChip number={lineCode} color={lineColor} />
                              <div className="min-w-0">
                                <div className="text-[15px] font-medium text-[#111111] leading-tight truncate">
                                  {destination}
                                </div>
                                {parsed.delayMinutes != null && <EtiquetaAtraso minutos={parsed.delayMinutes} horario={dep.scheduledTime} className="mt-1" />}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1 pl-2">
                              <div className="flex flex-col items-end text-right">
                                <div className="flex items-center gap-1">
                                  {parsed.isRealtime && (
                                    <Radio 
                                      className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                                    />
                                  )}
                                  <span 
                                    className={`font-condensada text-[26px] font-bold leading-none tabular-nums ${parsed.textColorClass}`}
                                  >
                                    {parsed.bigText}
                                  </span>
                                </div>
                                {parsed.subText && (
                                  <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                    {parsed.subText}
                                  </span>
                                )}
                              </div>
                              {podeAbrir && <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2] -mr-1" aria-hidden="true" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[13px] text-[#6B6B6B] pt-2">
                      {stop.arrivalsOnly ? t('Daqui não parte nenhum autocarro. Para apanhar, usa a outra paragem com o mesmo nome.') : t('Toca para ver as próximas partidas.')}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredStops.length > paragensVisiveis.length && (
              <button
                onClick={() => setMaxParagens((n) => n + 24)}
                className="w-full h-11 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] text-[13.5px] font-semibold text-[#111111] active:bg-[#F4F4F2] cursor-pointer"
              >
                {t('Mostrar mais paragens')} ({filteredStops.length - paragensVisiveis.length})
              </button>
            )}
            {localizacaoPronta && !userCoords?.isManual && (
              <NotaLocalizacao onAbrir={() => setDialogoLocalizacao(true)} className="px-1" />
            )}
            </>
          ) : (
            falhouCarregar && !isDbLoading ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[#111111] font-semibold">{t('Não foi possível carregar os transportes.')}</p>
                <p className="text-[13px] text-[#6B6B6B]">{t('Verifica a ligação à internet e tenta outra vez.')}</p>
                <button
                  onClick={() => { setFalhouCarregar(false); loadNearbyDataRef.current?.(); }}
                  className="h-10 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold cursor-pointer"
                >
                  {t('Tentar outra vez')}
                </button>
              </div>
            ) : (
            <div className="p-8 text-center text-sm text-[#6B6B6B]">
              {isDbLoading ? traduzirCarregamento(dbLoadingMessage || 'A carregar horários…') : t('Sem paragens nesta área.')}
            </div>
            )
          )}
        </div>
        )}

        {/* Detalhe da paragem escolhida */}
        {selectedStop && (
          <div className="painel-paragem absolute inset-0 z-20 flex flex-col bg-[#FFFFFF] rounded-t-[20px] lg:rounded-none">
            <div className={`shrink-0 px-3 pt-2 border-b border-[#E6E6E3] ${linhaAberta ? 'pb-1 max-lg:border-b-0' : 'pb-3'} touch-pan-x`} {...gestoPainel}>
              {/* Pega do painel: toca ou desliza para encolher/aumentar (área de toque maior que a barrinha) */}
              <button
                onClick={() => setMapaExpandido((v) => !v)}
                className="lg:hidden flex items-center justify-center w-full h-6 -mt-1 mb-1 cursor-pointer"
                aria-label={mapaExpandido ? 'Aumentar o painel' : 'Encolher o painel'}
              >
                <span className="block w-10 h-1.5 rounded-full bg-[#D4D4D0]" />
              </button>
              <div className={`flex items-start gap-2.5 ${linhaAberta ? 'max-lg:hidden' : ''}`}>
                <button
                  onClick={fecharParagem}
                  className="shrink-0 w-10 h-10 -ml-0.5 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer"
                  aria-label={t('Voltar aos transportes perto')}
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.25]" />
                </button>
                <div className="min-w-0 flex-1 pt-0.5">
                  {(() => {
                    const estilo = ESTILO_MODO[normalizeTransportMode(selectedStop.transportMode)] || ESTILO_MODO.Autocarro;
                    return (
                      <h2 className="flex items-center gap-2 font-semibold text-[17px] text-[#111111] leading-tight min-w-0">
                        <span
                          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center [&_svg]:w-[13px] [&_svg]:h-[13px] [&_span]:!text-[12px]"
                          style={{ background: estilo.cor }}
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: estilo.simbolo }}
                        />
                        <span className="truncate">{estilo.plural} – {formatTransitName(selectedStop.name)}</span>
                      </h2>
                    );
                  })()}
                  {selectedStop.direction && (
                    <div className="text-[13px] font-medium text-[#111111]/75 mt-0.5 truncate">
                      {textoSentido(selectedStop)}
                    </div>
                  )}
                  <div className="text-xs text-[#6B6B6B] mt-0.5">
                    {selectedStop.operatorName || normalizeTransportMode(selectedStop.transportMode)} · {distanciaViva(userCoords, selectedStop)?.texto ?? traduzirDistancia(selectedStop.formattedDistance)}
                    {(distanciaViva(userCoords, selectedStop)?.minutos ?? selectedStop.walkingMinutes) ? ` · ${t('{n} min a pé', { n: distanciaViva(userCoords, selectedStop)?.minutos ?? selectedStop.walkingMinutes })}` : ''}
                  </div>
                </div>
                {botaoFavorito(selectedStop, '-mr-1')}
              </div>
              {/* Outras paragens no mesmo sítio (ex.: STCP e UNIR no mesmo poste): trocar sem voltar à lista */}
              {(() => {
                const comExtra = [...filteredStops];
                [...grupoExtra, selectedStop].forEach((g) => { if (!comExtra.some((f) => f.id === g.id)) comExtra.push(g); });
                const grupo = comExtra
                  .filter((s) => s.id === selectedStop.id || metrosEntre(s, selectedStop) <= 30)
                  .sort((x, y) => String(x.operatorName || '').localeCompare(String(y.operatorName || '')) || String(x.id).localeCompare(String(y.id)));
                if (grupo.length < 2 || linhaAberta) return null;
                // Etiqueta de cada poste. Se dois ficam iguais (mesmo operador e sem sentido), distingue-os
                // pela distância e, em último caso, por um número, para nunca haver dois botões "STCP" iguais.
                const baseEtiqueta = (s: typeof grupo[number]) => {
                  const sentido = s.direction && !s.arrivalsOnly ? ` · ${formatTransitName(s.direction.split(' · ')[0])}` : '';
                  return `${s.operatorName || 'Paragem'}${sentido}`;
                };
                const contagem = new Map<string, number>();
                grupo.forEach((s) => contagem.set(baseEtiqueta(s), (contagem.get(baseEtiqueta(s)) || 0) + 1));
                const vistas = new Map<string, number>();
                const etiquetas = new Map<string, string>();
                grupo.forEach((s) => {
                  const b = baseEtiqueta(s);
                  if ((contagem.get(b) || 0) < 2) { etiquetas.set(s.id, b); return; }
                  const n = (vistas.get(b) || 0) + 1;
                  vistas.set(b, n);
                  etiquetas.set(s.id, `${b} · ${t('poste')} ${n}`);
                });
                return (
                  <div className="mt-2.5 -mx-3 px-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-teste="paragens-mesmo-sitio">
                    {grupo.map((s) => {
                      const ativa = s.id === selectedStop.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => { if (!ativa) setSelectedStop(s); }}
                          aria-pressed={ativa}
                          className={`shrink-0 max-w-[230px] h-9 px-3 rounded-full border text-[13px] font-semibold truncate cursor-pointer ${
                            ativa ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#E6E6E3] text-[#111111] active:bg-[#F4F4F2]'
                          }`}
                        >
                          {etiquetas.get(s.id)}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Percurso da linha escolhida (também desenhado no mapa) */}
            {linhaAberta && (
              <div className="flex-1 min-h-0 flex flex-col" data-teste="percurso-linha">
                <div className="shrink-0 px-4 py-2.5 flex items-center gap-2.5 border-b border-[#E6E6E3] touch-none" {...gestoPainel}>
                  <button
                    onClick={fecharLinha}
                    className="shrink-0 h-9 pl-2 pr-3 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[13px] font-semibold text-[#111111] flex items-center gap-1 cursor-pointer"
                    aria-label={t('Voltar às partidas da paragem')}
                  >
                    <ArrowLeft className="w-4 h-4 stroke-[2.25]" />
                    {/* Em ecrãs estreitos fica só a seta (o espaço faz falta ao destino e à estrela) */}
                    <span className="max-[379px]:hidden">{t('Partidas')}</span>
                  </button>
                  <LineChip number={linhaAberta.linha || '—'} color={linhaAberta.cor} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-[#111111] truncate">{linhaAberta.destino || 'Percurso'}</div>
                    {linhaAberta.estado === 'ok' && linhaAberta.percurso && (() => {
                      const { paragens, indice } = linhaAberta.percurso;
                      const faltam = indice >= 0 ? paragens.length - 1 - indice : paragens.length;
                      return (
                        <div className="text-xs text-[#6B6B6B]">
                          {faltam > 0 ? tn(faltam, '{n} paragem até ao fim', '{n} paragens até ao fim') : t('Fim de linha')}
                        </div>
                      );
                    })()}
                  </div>
                  {linhaAberta.id && estrelaFavorito(
                    favoriteLineIds.has(linhaAberta.id),
                    `${linhaAberta.linha || ''} ${linhaAberta.destino || ''}`.trim(),
                    () => alternarLinhaFavorita(linhaAberta.id!, linhaAberta.dados),
                    '-mx-1',
                    'favorito-linha',
                  )}
                  <button
                    onClick={() => setMapaExpandido((v) => !v)}
                    className="lg:hidden shrink-0 w-10 h-10 -mr-1.5 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer"
                    aria-label={t(mapaExpandido ? 'Aumentar a lista de paragens' : 'Encolher a lista e ver o mapa')}
                    aria-expanded={!mapaExpandido}
                    data-teste="encolher-percurso"
                  >
                    {mapaExpandido ? <ChevronUp className="w-5 h-5 stroke-[2.25]" /> : <ChevronDown className="w-5 h-5 stroke-[2.25]" />}
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">
                  {linhaAberta.estado === 'a-carregar' && (
                    <div className="py-4 text-sm text-[#6B6B6B]">{t('A carregar percurso…')}</div>
                  )}
                  {linhaAberta.estado === 'erro' && (
                    <div className="py-4 text-sm text-[#6B6B6B]">{t('Percurso indisponível para esta linha.')}</div>
                  )}
                  {linhaAberta.estado === 'ok' && linhaAberta.percurso && (
                    <ol className="py-2">
                      {linhaAberta.percurso.paragens.map((p, i, todas) => {
                        const indice = linhaAberta.percurso!.indice;
                        const aqui = i === indice;
                        const passou = indice >= 0 && i < indice;
                        const primeira = i === 0;
                        const ultima = i === todas.length - 1;
                        return (
                          <li key={`${p.id}-${i}`} ref={aqui ? paragemAquiRef : undefined}>
                            <button
                              onClick={() => safeFlyTo(mapRef.current, p.lat, p.lon, 16.5)}
                              className="w-full flex items-stretch gap-3 text-left cursor-pointer active:bg-[#F4F4F2] rounded-[8px]"
                            >
                              <span className="relative w-5 shrink-0 flex justify-center" aria-hidden="true">
                                <span
                                  className={`absolute left-1/2 -translate-x-1/2 w-[4px] ${primeira ? 'top-1/2' : 'top-0'} ${ultima ? 'bottom-1/2' : 'bottom-0'} ${passou ? 'bg-[#FF6B1A]/35' : 'bg-[#FF6B1A]'}`}
                                />
                                <span
                                  className={`relative self-center rounded-full border-2 ${
                                    aqui ? 'w-4 h-4 bg-[#FF6B1A] border-[#111111]'
                                    : ultima ? 'w-4 h-4 bg-[#111111] border-[#FF6B1A]'
                                    : `w-2.5 h-2.5 bg-[#FFFFFF] ${passou ? 'border-[#FF6B1A]/50' : 'border-[#FF6B1A]'}`
                                  }`}
                                />
                              </span>
                              <span className="min-w-0 flex-1 py-2.5 flex items-center justify-between gap-2">
                                <span className="min-w-0">
                                  <span className={`block truncate text-[14px] ${aqui ? 'font-bold text-[#111111]' : passou ? 'font-medium text-[#6B6B6B]' : 'font-medium text-[#111111]'}`}>
                                    {formatTransitName(p.nome)}
                                  </span>
                                  {aqui && <span className="block text-[11px] font-semibold text-[#C2410C]">{t('Estás aqui')}</span>}
                                  {!aqui && ultima && <span className="block text-[11px] font-semibold text-[#6B6B6B]">{t('Fim de linha')}</span>}
                                </span>
                                {p.hora && (
                                  <span className={`shrink-0 font-condensada text-[15px] font-semibold tabular-nums ${passou ? 'text-[#6B6B6B]' : 'text-[#111111]'}`}>
                                    {p.hora}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {linhaAberta.estado === 'ok' && linhaAberta.percurso && !linhaAberta.percurso.paragens.some((p) => p.hora) && (
                    <p className="pb-2 text-[11px] text-[#6B6B6B]">{t('Mostra as paragens por ordem; as horas de passagem não estão disponíveis para esta linha.')}</p>
                  )}
                </div>
              </div>
            )}

            {/* Partidas da paragem */}
            <div className={`flex-1 min-h-0 px-4 pb-4 divide-y divide-[#E6E6E3] overflow-y-auto overscroll-contain ${linhaAberta ? 'hidden' : ''}`}>
              {(() => {
                const proprias = selectedStop.nextDepartures || [];
                const extra = partidasExtra?.id === selectedStop.id ? partidasExtra : null;
                const unir = codigosUnir(selectedStop as any).length ? unirPorParagem[selectedStop.id] : undefined;
                const deps = [...((extra && extra.deps.length > 0) ? extra.deps : proprias), ...partidasUnirDe(selectedStop, true)];
                const sorted = escolherPartidas(sortDepartures(deps));
                if (sorted.length === 0) {
                  const aCarregarUnir = Boolean(unir?.aCarregar) || (codigosUnir(selectedStop as any).length > 0 && !unir);
                  const aCarregarPartidas = !selectedStop.arrivalsOnly && Boolean(extra?.aCarregar || aCarregarUnir || (!extra && proprias.length === 0 && !unir));
                  if (aCarregarPartidas) {
                    // Esqueleto com a forma das partidas: a lista parece já a chegar, em vez de uma frase solta
                    return (
                      <div role="status" aria-live="polite" className="divide-y divide-[#E6E6E3]" data-teste="partidas-a-carregar">
                        <span className="sr-only">{t('A carregar partidas…')}</span>
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="py-3 flex items-center justify-between gap-3" aria-hidden="true">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="parou-esqueleto w-8 h-7 shrink-0" />
                              <span className="parou-esqueleto h-4 flex-1 max-w-[190px]" />
                            </div>
                            <span className="parou-esqueleto h-6 w-12 shrink-0" />
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="py-4 text-sm text-[#6B6B6B]">
                      {selectedStop.arrivalsOnly
                        ? t('Fim de linha: daqui não parte nenhum autocarro. Para apanhar, usa a outra paragem com o mesmo nome.')
                        : unir && !unir.ok ? t('Não foi possível obter agora os horários da UNIR (vêm da AMP). Tenta outra vez daqui a pouco.')
                        : t('Sem partidas nas próximas horas.')}
                    </div>
                  );
                }
                const outdatedDeps = sorted.filter((d: any) => parseDepartureTime(d).isOutdated);
                const outdatedOps = Array.from(new Set(
                  outdatedDeps.map((d: any) => d.agency_name || d.operator || d.operatorName || '').filter(Boolean)
                ));
                const outdatedNotice = outdatedOps.length > 0
                  ? outdatedOps.join(' e ')
                  : (outdatedDeps.length > 0 ? (selectedStop.operatorName || 'STCP') : null);

                return (
                  <>
                    {outdatedNotice && (
                      <div className="py-1 px-1 mt-2 bg-[#F4F4F2] rounded-[6px] text-[11px] text-[#6B6B6B] flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                        <span>Horários {outdatedNotice} podem estar desatualizados</span>
                      </div>
                    )}
                    {sorted.map((dep: any, dIdx: number) => {
                      const parsed = parseDepartureTime(dep);
                      const destination = destinoLegivel(dep.destination || dep.headsign, dep.lineName || dep.route_long_name) || 'Destino';
                      const podeAbrir = podeAbrirLinha(dep);
                      return (
                        <div
                          key={dIdx}
                          role={podeAbrir ? 'button' : undefined}
                          tabIndex={podeAbrir ? 0 : undefined}
                          onClick={podeAbrir ? () => abrirLinha(dep) : undefined}
                          onKeyDown={podeAbrir ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirLinha(dep); } } : undefined}
                          aria-label={podeAbrir ? `Ver o percurso da linha ${dep.lineCode || ''} para ${destination}` : undefined}
                          className={`py-2.5 flex items-center justify-between gap-2 ${podeAbrir ? 'cursor-pointer active:bg-[#F4F4F2]' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <LineChip number={dep.lineCode || dep.route_short_name || '—'} color={dep.lineColor} />
                            <div className="min-w-0">
                              <div className="text-[15px] font-medium text-[#111111] truncate">
                                {destination}
                              </div>
                              {(dep.operatorName || parsed.delayMinutes != null) && (
                                <div className="flex items-center gap-1.5 min-w-0 text-xs text-[#6B6B6B]">
                                  {parsed.delayMinutes != null && <EtiquetaAtraso minutos={parsed.delayMinutes} horario={dep.scheduledTime} className="my-0.5" />}
                                  {dep.operatorName && <span className="truncate">{dep.operatorName}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <div className="flex flex-col items-end text-right">
                              <div className="flex items-center gap-1">
                                {parsed.isRealtime && (
                                  <Radio
                                    className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`}
                                  />
                                )}
                                <span
                                  className={`font-condensada text-[22px] font-bold tabular-nums leading-none ${parsed.textColorClass}`}
                                >
                                  {parsed.bigText}
                                </span>
                              </div>
                              {parsed.subText && (
                                <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                  {parsed.subText}
                                </span>
                              )}
                            </div>
                            {podeAbrir && <ChevronRight className="w-4 h-4 text-[#6B6B6B] stroke-[2] -mr-1" aria-hidden="true" />}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
        )}
        {/* A bordo: ocupa o painel enquanto vais num autocarro */}
        <PainelABordo controlo={aBordo} aoVerNoMapa={(lat, lon) => safeFlyTo(mapRef.current, lat, lon, 16.5)} />
      </aside>

      {/* Autocarros em direto e percurso do autocarro em que vais (desenham-se no mapa) */}
      {localizacaoPronta && !emRota && (
        <VeiculosNoMapa
          mapa={mapaLeaflet}
          linhas={linhasVeiculos}
          caixa={caixaVeiculos}
          meu={aBordo.alvo?.id ?? null}
          aoEstarABordo={(v) => { mapaLeaflet?.closePopup(); aBordo.confirmar(v, 'manual'); }}
        />
      )}
      <ABordoNoMapa mapa={mapaLeaflet} controlo={aBordo} />

      {/* Mapa */}
      <section
        aria-label={t('Mapa')}
        ref={mapaElRef}
        className={`perto-mapa relative order-first lg:order-none w-full shrink-0 lg:shrink lg:flex-1 lg:h-full lg:max-h-none bg-[#F4F4F2] overflow-hidden select-none transition-[height] duration-300 ${
          !localizacaoPronta
            ? (gpsStatus === 'denied' || gpsStatus === 'unavailable' || pedidoLento
                ? (ajudaLocalizacao ? 'h-[84%]' : 'h-[62%] min-h-[340px]')
                : 'h-[52%] min-h-[320px] max-h-[460px]')
            : mapaExpandido ? (linhaAberta ? 'h-[78%]' : 'h-[68%]') : 'h-[42%] min-h-[230px] max-h-[400px]'
        }`}
      >
        {/* Pesquisa por cima do mapa (telemóvel), com o "+" para juntar paragens à rota */}
        {localizacaoPronta && !emViagem && (
          <div className="lg:hidden absolute top-3 left-3 right-[60px] z-20">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0 flex items-center bg-[#FFFFFF] rounded-[12px] shadow-[0_4px_14px_rgba(17,17,17,0.12)]">
                <Search className="absolute left-3 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
                <InputPesquisa
                  valor={destinationQuery}
                  onTexto={setDestinationQuery}
                  onLimpar={handleClearDestination}
                  onFocus={() => setSearchFocused(true)}
                  placeholder={t('Para onde vais?')}
                  className="w-full pl-9 pr-8 bg-transparent text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none h-11"
                  classeLimpar="absolute right-2 text-[#6B6B6B] hover:text-[#111111] p-1.5 cursor-pointer"
                  rotuloLimpar={t('Limpar pesquisa')}
                />
              </div>
              <button
                type="button"
                onClick={abrirEditor}
                data-teste="juntar-paragem"
                className="shrink-0 w-11 h-11 rounded-full bg-[#FFFFFF] text-[#111111] flex items-center justify-center shadow-[0_4px_14px_rgba(17,17,17,0.12)] cursor-pointer active:bg-[#F4F4F2]"
                aria-label={t('Adicionar paragens à rota')}
                title={t('Adicionar paragens à rota')}
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
            {searchFocused && suggestions.length > 0 && <div className="mt-1">{listaSugestoes(true)}</div>}
          </div>
        )}

        {/* Mapa Leaflet. O desfoque fica num invólucro: a className do contentor do Leaflet não
            pode mudar depois de criado (o React apagaria as classes "leaflet-*" e os mosaicos
            ficavam com largura 0). */}
        <div className={`absolute inset-0 z-0 transition-[filter] duration-500 ${localizacaoPronta ? '' : 'blur-[5px] scale-[1.04]'}`}>
          <div 
            ref={mapContainerRef} 
            className="absolute inset-0 w-full h-full"
          />
        </div>

        {/* Controlos do mapa */}
        {localizacaoPronta && (
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
            <button
              onClick={handleRecenterClick}
              className={`w-11 h-11 rounded-[12px] flex items-center justify-center shadow-[0_4px_14px_rgba(17,17,17,0.12)] cursor-pointer transition-colors ${
                followMode ? 'bg-[#FF6B1A] text-[#111111]' : 'bg-[#FFFFFF] text-[#111111]'
              }`}
              title={t('Centrar na minha posição')}
              aria-label={t('Centrar na minha posição')}
            >
              <LocateFixed className="w-[18px] h-[18px] stroke-[2.25]" />
            </button>
            <div className="hidden sm:flex flex-col bg-[#FFFFFF] rounded-[12px] shadow-[0_4px_14px_rgba(17,17,17,0.12)] overflow-hidden">
              <button
                onClick={() => mapRef.current?.zoomIn()}
                className="w-11 h-11 hover:bg-[#F4F4F2] text-[#111111] flex items-center justify-center cursor-pointer border-b border-[#E6E6E3]"
                title={t('Aproximar mapa')}
                aria-label={t('Aproximar mapa')}
              >
                <ZoomIn className="w-4 h-4 stroke-[2]" />
              </button>
              <button
                onClick={() => mapRef.current?.zoomOut()}
                className="w-11 h-11 hover:bg-[#F4F4F2] text-[#111111] flex items-center justify-center cursor-pointer"
                title={t('Afastar mapa')}
                aria-label={t('Afastar mapa')}
              >
                <ZoomOut className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
            <button
              onClick={() => setMapaExpandido((v) => !v)}
              className="lg:hidden w-11 h-11 rounded-[12px] bg-[#FFFFFF] text-[#111111] flex items-center justify-center shadow-[0_4px_14px_rgba(17,17,17,0.12)] cursor-pointer"
              title={mapaExpandido ? t('Reduzir o mapa') : t('Aumentar o mapa')}
              aria-label={mapaExpandido ? t('Reduzir o mapa') : t('Aumentar o mapa')}
            >
              {mapaExpandido ? <Minimize2 className="w-4 h-4 stroke-[2]" /> : <Maximize2 className="w-4 h-4 stroke-[2]" />}
            </button>
          </div>
        )}

        {/* «Estás no autocarro 801?» */}
        <PerguntaABordo controlo={aBordo} />

        {/* Aviso de precisão da posição (só quando está fraca ou sem sinal) */}
        {localizacaoPronta && !userCoords?.isManual && (
          <AvisoPrecisaoMapa nivel={qualidadeGps.nivel} precisao={qualidadeGps.precisao} aTentar={aAfinarGps} onTentar={tentarOutraVezGps} />
        )}

        {/* Convite para ativar a localização (mapa desfocado por trás) */}
        {!localizacaoPronta && (
          <div className="absolute inset-0 z-[25] bg-[#FFFFFF]/35 flex flex-col items-center px-4 pb-8 pt-3 overflow-y-auto overscroll-contain">
            {/* my-auto: ao centro quando cabe; se não couber (passos de ajuda), desliza */}
            <div className="my-auto w-full flex justify-center">{conviteLocalizacao()}</div>
          </div>
        )}
      </section>

      {editor && (
        <EditorParagens
          origem={{ lat: userCoords?.latitude ?? 38.7253, lon: userCoords?.longitude ?? -9.1500 }}
          origemNome={userCoords?.isManual ? userCoords.locationLabel : undefined}
          linhas={editor.linhas}
          ativaInicial={editor.ativa}
          onFechar={() => setEditor(null)}
          onConfirmar={aplicarEditor}
        />
      )}

      <FolhaLocalizacao
        aberta={dialogoLocalizacao}
        onFechar={() => setDialogoLocalizacao(false)}
        ativa={gpsStatus === 'active' && Boolean(userCoords) && !userCoords?.isManual}
        onDesligar={() => { stopLocation(); setSelectedStop(null); }}
        onPrivacidade={onAbrirPrivacidade}
      />
    </div>
  );
};

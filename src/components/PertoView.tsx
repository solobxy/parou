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
  ArrowLeft
} from 'lucide-react';
import { useUserLocation } from '../hooks/useUserLocation';
import { 
  fetchNearbyTransit, 
  searchDestinations, 
  planTransitRoute, 
  getFavoriteStopIds 
} from '../services/pertoApi';
import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  TransitRouteOption, 
  DestinationSuggestion,
} from '../types/perto';
import { CentralAlert } from '../types/alerts';
import { LineChip } from './LineChip';
import { Logo } from './Logo';
import { formatTransitName, sortDepartures, parseDepartureTime } from '../utils/transitFormatter';

interface PertoViewProps {
  onSelectLineInSchedules?: (lineCode: string) => void;
  initialDestination?: { title: string; lat: number; lon: number } | null;
  onClearInitialDestination?: () => void;
}

// Normalize transport mode
// Símbolo e cor de cada tipo de transporte (mapa e cabeçalho da paragem)
const SVG_BUS = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>';
const SVG_COMBOIO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>';
const SVG_BARCO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10.2V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.4 20A11.6 11.6 0 0 0 21 14l-8.2-3.6a2 2 0 0 0-1.6 0L3 14a11.6 11.6 0 0 0 2.8 7.8"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>';
const SVG_METRO = '<span style="font:800 14px/1 Barlow, system-ui, sans-serif;color:#fff;letter-spacing:-.02em">M</span>';
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
function textoSentido(stop: NearbyStopItem): string {
  if (!stop.direction) return '';
  if (stop.arrivalsOnly) return stop.direction;
  return `Sentido ${stop.direction.split(' · ').map((d) => formatTransitName(d)).join(' · ')}`;
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
}) => {
  const { coords: userCoords, status: gpsStatus, activateLocation, setManualLocation, motivoBloqueio } = useUserLocation();
  // Passos para desbloquear (aparecem quando "Ativar localização" não chega)
  const [ajudaLocalizacao, setAjudaLocalizacao] = useState<boolean>(false);
  const eIphone = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  useEffect(() => { if (gpsStatus === 'active') setAjudaLocalizacao(false); }, [gpsStatus]);
  // O Perto só mostra paragens quando há uma posição (GPS ou local escolhido)
  const localizacaoPronta = Boolean(userCoords) && gpsStatus === 'active';
  const [mapaExpandido, setMapaExpandido] = useState<boolean>(false);
  const [pesquisarLocal, setPesquisarLocal] = useState<boolean>(false);
  const [pedidoLento, setPedidoLento] = useState<boolean>(false);
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

  // Search & Navigation
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [selectedDestination, setSelectedDestination] = useState<DestinationSuggestion | null>(null);
  const [calculatedRoutes, setCalculatedRoutes] = useState<TransitRouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<TransitRouteOption | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState<boolean>(false);

  // Map & Controls
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const stopsMarkersRef = useRef<L.Marker[]>([]);
  // Passados 30 s fora do Perto volta a seguir o utilizador (pode já estar noutro sítio)
  const [followMode, setFollowMode] = useState<boolean>(
    () => ultimoSeguir || !ultimaVistaMapa || Date.now() - ultimaVistaMapa.t > 30_000,
  );
  // Se já há posição ao abrir, o mapa nasce centrado nela (não precisa de "voar" até lá)
  const hasCenteredInitiallyRef = useRef<boolean>(Boolean(userCoords));
  const isFetchingNearbyRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);

  useEffect(() => {
    setFavoriteStopIds(getFavoriteStopIds());
    // Também quando os favoritos mudam noutro sítio ou são repostos da cópia no servidor
    const reler = () => setFavoriteStopIds(getFavoriteStopIds());
    window.addEventListener('parou_favorites_updated', reler);
    window.addEventListener('parou_dados_repostos', reler);
    return () => {
      window.removeEventListener('parou_favorites_updated', reler);
      window.removeEventListener('parou_dados_repostos', reler);
    };
  }, []);

  useEffect(() => { ultimoSeguir = followMode; }, [followMode]);
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

    const timer = setTimeout(async () => {
      const lat = userCoords?.latitude ?? 38.7253;
      const lon = userCoords?.longitude ?? -9.1500;
      const results = await searchDestinations(destinationQuery, lat, lon);
      setSuggestions(results);
    }, 250);

    return () => clearTimeout(timer);
  }, [destinationQuery, userCoords]);

  const calculateRoutesToDestination = async (destLat: number, destLon: number, destName = 'Destino') => {
    const lat = userCoords?.latitude ?? 38.7253;
    const lon = userCoords?.longitude ?? -9.1500;
    setIsCalculatingRoutes(true);

    try {
      const res = await planTransitRoute(lat, lon, destLat, destLon, destName);
      const routes = res.routes || [];
      setCalculatedRoutes(routes);
      if (routes.length > 0) {
        setSelectedRoute(routes[0]);
      }
    } catch (err) {
      console.warn('[PertoView] Erro ao calcular rotas:', err);
    } finally {
      setIsCalculatingRoutes(false);
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
    setDestinationQuery(sug.title);
    setSuggestions([]);
    setSearchFocused(false);
    calculateRoutesToDestination(sug.latitude, sug.longitude, sug.title);
  };

  const handleClearDestination = () => {
    setSelectedDestination(null);
    setDestinationQuery('');
    setCalculatedRoutes([]);
    setSelectedRoute(null);
  };

  useEffect(() => {
    if (!selectedStop) return;
    if ((selectedStop.nextDepartures || []).length > 0) return;
    if (partidasExtra?.id === selectedStop.id && !partidasExtra.aCarregar) return;
    let cancelado = false;
    setPartidasExtra({ id: selectedStop.id, deps: [], aCarregar: true });
    fetch(`/api/transit/stop/${encodeURIComponent(selectedStop.id)}`, { signal: AbortSignal.timeout(15000) })
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
          departureTime: d.display_text,
          displayText: d.display_text,
          scheduledTime: d.scheduled_time,
          expectedTime: d.is_realtime && d.realtime_time ? d.realtime_time : undefined,
          etaMinutes: Math.max(0, Math.round(((d.realtime_epoch_secs || d.dep_epoch_secs) - agora) / 60)),
          departureMinutes: Math.max(0, Math.round(((d.realtime_epoch_secs || d.dep_epoch_secs) - agora) / 60)),
          isRealtime: d.state === 'TEMPO REAL',
          state: d.state,
          statusDescription: d.state_reason || d.state,
        }));
        setPartidasExtra({ id: selectedStop.id, deps, aCarregar: false });
      })
      .catch(() => { if (!cancelado) setPartidasExtra({ id: selectedStop.id, deps: [], aCarregar: false }); });
    return () => { cancelado = true; };
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
    });

    // Mosaicos raster do OpenStreetMap
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    // Filtro CSS aplicado estritamente ao painel de mosaicos (não aos marcadores)
    const tilePane = map.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = 'grayscale(1) brightness(1.06) contrast(0.92)';
      tilePane.style.webkitFilter = 'grayscale(1) brightness(1.06) contrast(0.92)';
    }

    // Atribuição oficial
    L.control.attribution({
      prefix: false,
      position: 'bottomright',
    }).addTo(map);

    map.on('dragstart', () => setFollowMode(false));
    map.on('moveend', () => {
      const c = map.getCenter();
      ultimaVistaMapa = { lat: c.lat, lon: c.lng, zoom: map.getZoom(), t: Date.now() };
    });
    mapRef.current = map;

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
      stopsMarkersRef.current.forEach((m) => m.remove());
      stopsMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recenter map on user location
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    if (!isValidCoordinate(userCoords.latitude, userCoords.longitude)) return;

    if (followMode || !hasCenteredInitiallyRef.current) {
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
      userMarkerRef.current.setLatLng([latitude, longitude]);
    } else {
      const userIcon = L.divIcon({
        className: 'custom-user-marker-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="w-6 h-6 rounded-full bg-[#FF6B1A]/20 animate-ping absolute"></div>
            <div style="background-color: #FF6B1A; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3);" class="w-5 h-5 rounded-full flex items-center justify-center z-10">
              <div style="background-color: #111111;" class="w-1.5 h-1.5 rounded-full"></div>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon, interactive: false })
        .addTo(mapRef.current);
    }
  }, [userCoords]);

  // Filter Stops
  const filteredStops = useMemo(() => {
    return stops.filter((stop) => {
      const mode = normalizeTransportMode(stop.transportMode);
      if (activeFilterTab === 'todos') return true;
      if (activeFilterTab === 'metro') return mode === 'Metro';
      if (activeFilterTab === 'comboio') return mode === 'Comboio';
      if (activeFilterTab === 'autocarro') return mode === 'Autocarro';
      if (activeFilterTab === 'barco') return mode === 'Barco';
      if (activeFilterTab === 'favoritos') return stop.isFavorite || favoriteStopIds.has(stop.id);
      return true;
    });
  }, [stops, activeFilterTab, favoriteStopIds]);

  // Render Stops on Map
  useEffect(() => {
    if (!mapRef.current) return;

    stopsMarkersRef.current.forEach((m) => m.remove());
    stopsMarkersRef.current = [];

    filteredStops.forEach((stop) => {
      const lat = Number(stop.latitude);
      const lon = Number(stop.longitude);
      if (!isValidCoordinate(lat, lon)) return;

      const isSelected = selectedStop?.id === stop.id;

      const estilo = ESTILO_MODO[normalizeTransportMode(stop.transportMode)] || ESTILO_MODO.Autocarro;
      const tamanho = isSelected ? 34 : 26;
      const stopIcon = L.divIcon({
        className: 'custom-stop-marker-icon',
        html: `
          <div title="${estilo.plural}" style="width:${tamanho}px;height:${tamanho}px;background:${estilo.cor};border:2px solid #FFFFFF;border-radius:9999px;display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? '0 0 0 3px #FF6B1A, 0 4px 10px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.28)'};cursor:pointer;transition:transform .15s">
            ${estilo.simbolo}
          </div>
        `,
        iconSize: [tamanho, tamanho],
        iconAnchor: [tamanho / 2, tamanho / 2],
      });

      const marker = L.marker([lat, lon], { icon: stopIcon, zIndexOffset: isSelected ? 1000 : 0, title: `${estilo.plural} – ${formatTransitName(stop.name)}` }).addTo(mapRef.current!);
      marker.on('click', () => {
        setSelectedStop(stop);
        setFollowMode(false);
        safeFlyTo(mapRef.current, lat, lon, 16.5);
      });

      stopsMarkersRef.current.push(marker);
    });
  }, [filteredStops, selectedStop]);

  // Ajusta o mapa quando muda de altura
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 320);
    return () => clearTimeout(timer);
  }, [mapaExpandido]);

  // Primary short alert
  const topAlert = contextualAlerts[0] || null;

  const raio = raioUsado || selectedRadius;
  const raioTexto = raio >= 1000 ? `${(raio / 1000).toLocaleString('pt-PT')} km` : `${raio} m`;
  const subtitulo = !localizacaoPronta
    ? (gpsStatus === 'requesting' ? 'A obter a tua localização…' : 'À espera da tua localização')
    : isDbLoading && filteredStops.length === 0
      ? (dbLoadingMessage || 'A carregar horários…')
      : userCoords?.isManual
        ? `Perto de ${userCoords.locationLabel || 'local escolhido'}`
        : `${filteredStops.length} ${filteredStops.length === 1 ? 'paragem' : 'paragens'} até ${raioTexto}${
            userCoords && userCoords.accuracy > 150 ? ' · a afinar a posição…' : ''
          }`;

  const iconeModo = (modo: string) => {
    const m = normalizeTransportMode(modo);
    if (m === 'Metro') return TrainFrontTunnel;
    if (m === 'Comboio') return TrainFront;
    if (m === 'Barco') return Ship;
    return Bus;
  };

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
            <span className="text-[13px] font-bold text-[#111111]">Procurar um local</span>
            <button
              onClick={() => { setPesquisarLocal(false); setDestinationQuery(''); }}
              className="text-[12px] font-semibold text-[#6B6B6B] cursor-pointer px-1 py-1"
            >
              Voltar
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder="Rua, localidade ou paragem"
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
              <h3 className="text-[16.5px] font-bold text-[#111111] leading-tight">{titulo}</h3>
              <p className="mt-0.5 text-[12.5px] text-[#6B6B6B] leading-snug">{texto}</p>
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
            Ativar localização
          </button>
          <button
            onClick={() => activateLocation(true)}
            data-teste="tentar-localizacao"
            className="mt-2 w-full h-10 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] text-[#111111] font-semibold text-[14px] flex items-center justify-center gap-2 active:bg-[#F4F4F2] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 stroke-[2.25]" />
            Tentar outra vez
          </button>

          {ajudaLocalizacao && (
            <ol className="mt-2.5 text-left text-[12.5px] text-[#111111] leading-snug space-y-1 bg-[#F4F4F2] rounded-[12px] p-3 list-decimal pl-7">
              {passos.map((p) => <li key={p}>{p}</li>)}
            </ol>
          )}

          <div className="mt-1 flex items-center justify-center divide-x divide-[#E6E6E3]">
            {!ajudaLocalizacao && (
              <button
                onClick={() => setAjudaLocalizacao(true)}
                className="h-10 px-3 text-[13px] font-medium text-[#6B6B6B] cursor-pointer"
              >
                Como resolver?
              </button>
            )}
            <button
              onClick={() => { setPesquisarLocal(true); setDestinationQuery(''); }}
              className="h-10 px-3 text-[13px] font-semibold text-[#111111] cursor-pointer"
            >
              Escolher um local
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
        <h3 className="mt-3 text-[18px] font-bold text-[#111111] leading-tight">
          {aPedir ? 'A localizar…' : bloqueada ? 'Localização bloqueada' : semSinal ? 'Sem sinal de GPS' : 'Vê o que passa perto de ti'}
        </h3>
        <p className="mt-1.5 text-[13px] text-[#6B6B6B] leading-snug">
          {aPedir
            ? 'Se o telemóvel perguntar, toca em Permitir.'
            : bloqueada
              ? 'Toca no cadeado (ou no ⓘ) ao lado do endereço, permite a Localização e volta a tentar.'
              : semSinal
                ? 'Não conseguimos obter a tua posição. Confirma que a localização do telemóvel está ligada.'
                : 'Ativa a localização para veres as paragens à tua volta e quando chega o próximo autocarro, metro ou comboio, em tempo real.'}
        </p>
        {!aPedir && (
          <button
            onClick={() => activateLocation(true)}
            data-teste="ativar-localizacao"
            className="mt-4 w-full h-12 rounded-[12px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <LocateFixed className="w-[18px] h-[18px] stroke-[2.25]" />
            {bloqueada || semSinal ? 'Tentar outra vez' : 'Ativar localização'}
          </button>
        )}
        <button
          onClick={() => { setPesquisarLocal(true); setDestinationQuery(''); }}
          className="mt-2 w-full h-10 text-[13px] font-semibold text-[#111111] underline-offset-2 hover:underline cursor-pointer"
        >
          Ou escolhe um local
        </button>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col lg:flex-row w-full h-full bg-[#FFFFFF] overflow-hidden">
      {/* Painel: Transportes perto */}
      <aside className="relative z-10 -mt-4 lg:mt-0 flex-1 min-h-0 lg:flex-none lg:w-[460px] lg:h-full flex flex-col bg-[#FFFFFF] rounded-t-[20px] lg:rounded-none shadow-[0_-8px_24px_rgba(17,17,17,0.08)] lg:shadow-none lg:border-r lg:border-[#E6E6E3]">
        {/* Cabeçalho (telemóvel) */}
        <div className="lg:hidden shrink-0 px-4 pt-2 pb-2.5">
          <button
            onClick={() => setMapaExpandido((v) => !v)}
            className="block mx-auto w-10 h-1.5 rounded-full bg-[#E6E6E3] cursor-pointer"
            aria-label={mapaExpandido ? 'Reduzir o mapa' : 'Aumentar o mapa'}
          />
          <div className="mt-2.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-['Barlow_Condensed'] text-[22px] leading-none font-bold uppercase tracking-[0.03em] text-[#111111]">
                Transportes perto
              </h2>
              <p className="text-[12px] text-[#6B6B6B] mt-1 truncate">{subtitulo}</p>
            </div>
            {localizacaoPronta && (userCoords?.isManual ? (
              <button
                onClick={() => activateLocation(true)}
                className="shrink-0 h-8 px-3 rounded-full bg-[#111111] text-[#FFFFFF] text-[12px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5 stroke-[2.25]" /> Usar GPS
              </button>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#F4F4F2] text-[11px] font-bold uppercase tracking-wide text-[#111111]">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-60 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-[#16A34A]" />
                </span>
                Ao vivo
              </span>
            ))}
          </div>
        </div>

        {/* Desktop Header: Brand / Search / Radar Context */}
        <div className="hidden lg:flex flex-col p-4 border-b border-[#E6E6E3] bg-[#FFFFFF] gap-3">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'bg-[#16A34A]' : 'bg-[#6B6B6B]'}`} />
              <span className="text-xs text-[#6B6B6B] font-medium">
                {gpsStatus === 'active' ? (userCoords?.isManual ? 'Local escolhido' : 'GPS ativo') : gpsStatus === 'requesting' ? 'A localizar…' : 'Localização desligada'}
              </span>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
            <input
              type="text"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              placeholder={localizacaoPronta ? 'Para onde vais?' : 'Procurar um local'}
              className="w-full pl-9 pr-8 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[10px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
            />
            {destinationQuery && (
              <button
                onClick={handleClearDestination}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111] p-1 cursor-pointer"
                aria-label="Limpar pesquisa"
              >
                <X className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            )}
            {suggestions.length > 0 && !pesquisarLocal && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50">{listaSugestoes(false)}</div>
            )}
          </div>
        </div>

        {/* Contextual Alert Banner */}
        {topAlert && localizacaoPronta && (
          <div className="mx-3 mb-2 lg:mx-0 lg:mb-0 px-3 py-2 bg-[#FFF7ED] border border-[#FFEDD5] lg:border-x-0 lg:border-t-0 rounded-[10px] lg:rounded-none flex items-center justify-between text-xs text-[#9A3412] shrink-0">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="w-3.5 h-3.5 text-[#EA580C] shrink-0 stroke-[2]" />
              <span className="font-semibold truncate">{topAlert.título || (topAlert as any).title}</span>
            </div>
            <span className="font-['Barlow_Condensed'] text-[11px] font-bold text-[#EA580C] uppercase tracking-wide shrink-0 ml-2">
              {topAlert.severity}
            </span>
          </div>
        )}

        {/* Filtros por modo */}
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
              {tab === 'todos' ? 'Todos' : tab === 'favoritos' ? 'Favoritas' : tab}
            </button>
          ))}
        </div>

        {/* Route Planning Result Panel (if destination active) */}
        {selectedDestination && calculatedRoutes.length > 0 && (
          <div className="p-4 border-y border-[#E6E6E3] bg-[#F4F4F2]/50 space-y-3 shrink-0 max-h-[45%] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <CornerDownRight className="w-4 h-4 text-[#FF6B1A] stroke-[2] shrink-0" />
                <span className="font-semibold text-xs text-[#111111] uppercase tracking-wide truncate">
                  Como chegar a {selectedDestination.title}
                </span>
              </div>
              <button 
                onClick={handleClearDestination}
                className="text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer shrink-0"
              >
                Cancelar
              </button>
            </div>

            <div className="space-y-2">
              {calculatedRoutes.map((route) => {
                const isSel = selectedRoute?.id === route.id;
                return (
                  <div
                    key={route.id}
                    onClick={() => setSelectedRoute(route)}
                    className={`p-3 rounded-[12px] border transition-all cursor-pointer ${
                      isSel 
                        ? 'bg-[#FFFFFF] border-[#111111] shadow-xs' 
                        : 'bg-[#FFFFFF] border-[#E6E6E3] hover:border-[#6B6B6B]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-['Barlow_Condensed'] text-xl font-bold text-[#111111] tabular-nums">
                          {route.totalDurationMinutes} min
                        </span>
                        <span className="text-xs text-[#6B6B6B]">· Chegada ~{route.arrivalTime}</span>
                      </div>
                      <span className="text-xs font-bold font-['Barlow_Condensed'] text-[#C2410C] uppercase tracking-wide">
                        {route.walkingDistanceMeters}m a pé
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {route.legs.map((leg, lIdx) => (
                        <React.Fragment key={lIdx}>
                          {lIdx > 0 && <span className="text-[#6B6B6B] text-xs">→</span>}
                          {leg.mode === 'WALK' ? (
                            <div className="flex items-center gap-1 text-xs text-[#6B6B6B]">
                              <Footprints className="w-3.5 h-3.5 stroke-[2]" />
                              <span>{leg.durationMinutes}m</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <LineChip number={leg.lineCode || '—'} color={leg.lineColor} />
                              <span className="text-xs text-[#111111] font-medium truncate max-w-[120px]">
                                {formatTransitName(leg.toStopName || leg.instruction || '')}
                              </span>
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Lista de paragens */}
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
              <span>{dbLoadingMessage || 'A carregar horários…'}</span>
            </div>
          ) : isLoadingNearby && filteredStops.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin stroke-[2]" />
              <span>A procurar paragens próximas…</span>
            </div>
          ) : filteredStops.length > 0 ? (
            filteredStops.map((stop) => {
              const isSelected = selectedStop?.id === stop.id;
              const stopDeps = stop.nextDepartures || [];
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
                        <h3 className="text-[16px] font-semibold text-[#111111] leading-snug truncate">
                          {formatTransitName(stop.name)}
                        </h3>
                        {stop.direction && (
                          <div className={`text-[12.5px] leading-tight truncate mt-0.5 ${stop.arrivalsOnly ? 'text-[#6B6B6B]' : 'text-[#111111]/70 font-medium'}`}>
                            {textoSentido(stop)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#F4F4F2] font-['Barlow_Condensed'] text-[13px] font-bold text-[#111111] tabular-nums">
                      <Footprints className="w-3 h-3 stroke-[2.25] text-[#6B6B6B]" />
                      {stop.formattedDistance}
                    </span>
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
                        const destination = formatTransitName(dep.destination || dep.headsign || 'Destino');

                        return (
                          <div key={dIdx} className="py-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LineChip number={lineCode} color={lineColor} />
                              <div className="text-[15px] font-medium text-[#111111] leading-tight truncate">
                                {destination}
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end text-right pl-2">
                              <div className="flex items-center gap-1">
                                {parsed.isRealtime && (
                                  <Radio 
                                    className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                                    style={{ color: parsed.textColor }}
                                  />
                                )}
                                <span 
                                  className={`font-['Barlow_Condensed'] text-[22px] font-bold leading-none tabular-nums ${parsed.textColorClass}`}
                                  style={{ color: parsed.textColor }}
                                >
                                  {parsed.bigText}
                                </span>
                              </div>
                              {parsed.subText && (
                                <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                  {parsed.subText}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[13px] text-[#6B6B6B] pt-2">
                      {stop.arrivalsOnly ? 'Daqui não parte nenhum autocarro. Para apanhar, usa a outra paragem com o mesmo nome.' : 'Toca para ver as próximas partidas.'}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            falhouCarregar && !isDbLoading ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[#111111] font-semibold">Não foi possível carregar os transportes.</p>
                <p className="text-[13px] text-[#6B6B6B]">Verifica a ligação à internet e tenta outra vez.</p>
                <button
                  onClick={() => { setFalhouCarregar(false); loadNearbyDataRef.current?.(); }}
                  className="h-10 px-4 rounded-[12px] bg-[#111111] text-[#FFFFFF] text-[13.5px] font-semibold cursor-pointer"
                >
                  Tentar outra vez
                </button>
              </div>
            ) : (
            <div className="p-8 text-center text-sm text-[#6B6B6B]">
              {isDbLoading ? (dbLoadingMessage || 'A carregar horários…') : 'Sem paragens nesta área.'}
            </div>
            )
          )}
        </div>

        {/* Detalhe da paragem escolhida */}
        {selectedStop && (
          <div className="painel-paragem absolute inset-0 z-20 flex flex-col bg-[#FFFFFF] rounded-t-[20px] lg:rounded-none">
            <div className="shrink-0 px-3 pt-2 pb-3 border-b border-[#E6E6E3]">
              <button
                onClick={() => setMapaExpandido((v) => !v)}
                className="lg:hidden block mx-auto w-10 h-1.5 rounded-full bg-[#E6E6E3] mb-2 cursor-pointer"
                aria-label={mapaExpandido ? 'Reduzir o mapa' : 'Aumentar o mapa'}
              />
              <div className="flex items-start gap-2.5">
                <button
                  onClick={fecharParagem}
                  className="shrink-0 w-10 h-10 -ml-0.5 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer"
                  aria-label="Voltar aos transportes perto"
                >
                  <ArrowLeft className="w-5 h-5 stroke-[2.25]" />
                </button>
                <div className="min-w-0 flex-1 pt-0.5">
                  {(() => {
                    const estilo = ESTILO_MODO[normalizeTransportMode(selectedStop.transportMode)] || ESTILO_MODO.Autocarro;
                    return (
                      <h4 className="flex items-center gap-2 font-semibold text-[17px] text-[#111111] leading-tight min-w-0">
                        <span
                          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center [&_svg]:w-[13px] [&_svg]:h-[13px] [&_span]:!text-[12px]"
                          style={{ background: estilo.cor }}
                          aria-hidden="true"
                          dangerouslySetInnerHTML={{ __html: estilo.simbolo }}
                        />
                        <span className="truncate">{estilo.plural} – {formatTransitName(selectedStop.name)}</span>
                      </h4>
                    );
                  })()}
                  {selectedStop.direction && (
                    <div className="text-[13px] font-medium text-[#111111]/75 mt-0.5 truncate">
                      {textoSentido(selectedStop)}
                    </div>
                  )}
                  <div className="text-xs text-[#6B6B6B] mt-0.5">
                    {selectedStop.operatorName || normalizeTransportMode(selectedStop.transportMode)} · {selectedStop.formattedDistance}
                    {selectedStop.walkingMinutes ? ` · ${selectedStop.walkingMinutes} min a pé` : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Partidas da paragem */}
            <div className="flex-1 min-h-0 px-4 pb-4 divide-y divide-[#E6E6E3] overflow-y-auto overscroll-contain">
              {(() => {
                const proprias = selectedStop.nextDepartures || [];
                const extra = partidasExtra?.id === selectedStop.id ? partidasExtra : null;
                const deps = proprias.length > 0 ? proprias : (extra?.deps || []);
                const sorted = sortDepartures(deps).slice(0, 12);
                if (sorted.length === 0) {
                  return (
                    <div className="py-4 text-sm text-[#6B6B6B]">
                      {selectedStop.arrivalsOnly
                        ? 'Fim de linha: daqui não parte nenhum autocarro. Para apanhar, usa a outra paragem com o mesmo nome.'
                        : extra?.aCarregar || (!extra && proprias.length === 0) ? 'A carregar partidas…' : 'Sem partidas nas próximas horas.'}
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
                      const destination = formatTransitName(dep.destination || dep.headsign || 'Destino');
                      return (
                        <div key={dIdx} className="py-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <LineChip number={dep.lineCode || dep.route_short_name || '—'} color={dep.lineColor} />
                            <div className="min-w-0">
                              <div className="text-[15px] font-medium text-[#111111] truncate">
                                {destination}
                              </div>
                              {dep.operatorName && (
                                <div className="text-xs text-[#6B6B6B] truncate">{dep.operatorName}</div>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end text-right">
                            <div className="flex items-center gap-1">
                              {parsed.isRealtime && (
                                <Radio 
                                  className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                                  style={{ color: parsed.textColor }}
                                />
                              )}
                              <span 
                                className={`font-['Barlow_Condensed'] text-[22px] font-bold tabular-nums leading-none ${parsed.textColorClass}`}
                                style={{ color: parsed.textColor }}
                              >
                                {parsed.bigText}
                              </span>
                            </div>
                            {parsed.subText && (
                              <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                {parsed.subText}
                              </span>
                            )}
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
      </aside>

      {/* Mapa */}
      <main
        className={`perto-mapa relative order-first lg:order-none w-full shrink-0 lg:shrink lg:flex-1 lg:h-full lg:max-h-none bg-[#F4F4F2] overflow-hidden select-none transition-[height] duration-300 ${
          !localizacaoPronta
            ? (gpsStatus === 'denied' || gpsStatus === 'unavailable' || pedidoLento
                ? (ajudaLocalizacao ? 'h-[84%]' : 'h-[62%] min-h-[340px]')
                : 'h-[52%] min-h-[320px] max-h-[460px]')
            : mapaExpandido ? 'h-[68%]' : 'h-[42%] min-h-[230px] max-h-[400px]'
        }`}
      >
        {/* Pesquisa por cima do mapa (telemóvel) */}
        {localizacaoPronta && (
          <div className="lg:hidden absolute top-3 left-3 right-[60px] z-20">
            <div className="relative flex items-center bg-[#FFFFFF] rounded-[12px] shadow-[0_4px_14px_rgba(17,17,17,0.12)]">
              <Search className="absolute left-3 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
              <input
                type="text"
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Para onde vais?"
                className="w-full pl-9 pr-8 bg-transparent text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none h-11"
              />
              {destinationQuery && (
                <button
                  onClick={handleClearDestination}
                  className="absolute right-2 text-[#6B6B6B] hover:text-[#111111] p-1.5 cursor-pointer"
                  aria-label="Limpar pesquisa"
                >
                  <X className="w-3.5 h-3.5 stroke-[2]" />
                </button>
              )}
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
              title="Centrar na minha posição"
              aria-label="Centrar na minha posição"
            >
              <LocateFixed className="w-[18px] h-[18px] stroke-[2.25]" />
            </button>
            <div className="hidden sm:flex flex-col bg-[#FFFFFF] rounded-[12px] shadow-[0_4px_14px_rgba(17,17,17,0.12)] overflow-hidden">
              <button
                onClick={() => mapRef.current?.zoomIn()}
                className="w-11 h-11 hover:bg-[#F4F4F2] text-[#111111] flex items-center justify-center cursor-pointer border-b border-[#E6E6E3]"
                title="Aproximar mapa"
                aria-label="Aproximar mapa"
              >
                <ZoomIn className="w-4 h-4 stroke-[2]" />
              </button>
              <button
                onClick={() => mapRef.current?.zoomOut()}
                className="w-11 h-11 hover:bg-[#F4F4F2] text-[#111111] flex items-center justify-center cursor-pointer"
                title="Afastar mapa"
                aria-label="Afastar mapa"
              >
                <ZoomOut className="w-4 h-4 stroke-[2]" />
              </button>
            </div>
            <button
              onClick={() => setMapaExpandido((v) => !v)}
              className="lg:hidden w-11 h-11 rounded-[12px] bg-[#FFFFFF] text-[#111111] flex items-center justify-center shadow-[0_4px_14px_rgba(17,17,17,0.12)] cursor-pointer"
              title={mapaExpandido ? 'Reduzir o mapa' : 'Aumentar o mapa'}
              aria-label={mapaExpandido ? 'Reduzir o mapa' : 'Aumentar o mapa'}
            >
              {mapaExpandido ? <Minimize2 className="w-4 h-4 stroke-[2]" /> : <Maximize2 className="w-4 h-4 stroke-[2]" />}
            </button>
          </div>
        )}

        {/* Convite para ativar a localização (mapa desfocado por trás) */}
        {!localizacaoPronta && (
          <div className="absolute inset-0 z-[25] bg-[#FFFFFF]/35 flex flex-col items-center px-4 pb-8 pt-3 overflow-y-auto overscroll-contain">
            {/* my-auto: ao centro quando cabe; se não couber (passos de ajuda), desliza */}
            <div className="my-auto w-full flex justify-center">{conviteLocalizacao()}</div>
          </div>
        )}
      </main>

    </div>
  );
};

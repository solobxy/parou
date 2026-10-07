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
  MapPin
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
    map.flyTo([lat, lon], targetZoom);
  } catch (err) {
    console.warn('[PertoView] safeFlyTo error:', err);
  }
}

// Cache ao nível do módulo para manter os últimos dados ao trocar de aba
let lastNearbyStops: NearbyStopItem[] = [];
let lastNearbyVehicles: NearbyVehicleItem[] = [];
let lastNearbyAlerts: CentralAlert[] = [];

export const PertoView: React.FC<PertoViewProps> = ({
  initialDestination,
  onClearInitialDestination,
}) => {
  const { coords: userCoords, status: gpsStatus, activateLocation } = useUserLocation();
  const [stops, setStops] = useState<NearbyStopItem[]>(lastNearbyStops);
  const [vehicles, setVehicles] = useState<NearbyVehicleItem[]>(lastNearbyVehicles);
  const [contextualAlerts, setContextualAlerts] = useState<CentralAlert[]>(lastNearbyAlerts);
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(lastNearbyStops.length === 0);
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [dbLoadingMessage, setDbLoadingMessage] = useState<string>('A carregar horários…');
  const [selectedRadius, setSelectedRadius] = useState<number>(1000);
  const [activeFilterTab, setActiveFilterTab] = useState<'todos' | 'autocarro' | 'metro' | 'comboio' | 'barco' | 'favoritos'>('todos');
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
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [bottomSheetState, setBottomSheetState] = useState<'collapsed' | 'half' | 'full'>('collapsed');
  const hasCenteredInitiallyRef = useRef<boolean>(false);
  const isFetchingNearbyRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);

  useEffect(() => {
    setFavoriteStopIds(getFavoriteStopIds());
  }, []);

  const loadNearbyData = useCallback(async () => {
    const lat = userCoords?.latitude ?? 38.7253;
    const lon = userCoords?.longitude ?? -9.1500;
    if (!isValidCoordinate(lat, lon)) return;
    if (isFetchingNearbyRef.current) return;
    isFetchingNearbyRef.current = true;

    try {
      const data = await fetchNearbyTransit(lat, lon, selectedRadius, AbortSignal.timeout(15000));
      if (data.isLoading) {
        setIsDbLoading(true);
        const msg = data.message || (data.loadedOperators ? `A carregar horários… ${data.loadedOperators}/${data.totalOperators}` : 'A carregar horários…');
        setDbLoadingMessage(msg);
      } else {
        setIsDbLoading(false);
        retryAttemptRef.current = 0;
        if (data.stops) {
          lastNearbyStops = data.stops;
          setStops(data.stops);
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
    } finally {
      setIsLoadingNearby(false);
      isFetchingNearbyRef.current = false;
    }
  }, [userCoords, selectedRadius]);

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
        setBottomSheetState('half');
      }
    } catch (err) {
      console.warn('[PertoView] Erro ao calcular rotas:', err);
    } finally {
      setIsCalculatingRoutes(false);
    }
  };

  const handleSelectDestination = (sug: DestinationSuggestion) => {
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

    const lat = userCoords?.latitude ?? 38.7253;
    const lon = userCoords?.longitude ?? -9.1500;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lon],
      zoom: 15,
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

      const stopIcon = L.divIcon({
        className: 'custom-stop-marker-icon',
        html: `
          <div style="background-color: ${isSelected ? '#111111' : '#FFFFFF'}; border: 2px solid #111111; box-shadow: 0 2px 5px rgba(0,0,0,0.2);" class="w-4 h-4 rounded-full flex items-center justify-center hover:scale-125 transition-transform cursor-pointer">
            <div style="background-color: ${isSelected ? '#FFFFFF' : '#111111'};" class="w-1.5 h-1.5 rounded-full"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([lat, lon], { icon: stopIcon }).addTo(mapRef.current!);
      marker.on('click', () => {
        setSelectedStop(stop);
        safeFlyTo(mapRef.current, lat, lon, 16.5);
      });

      stopsMarkersRef.current.push(marker);
    });
  }, [filteredStops, selectedStop]);

  // Resize map when bottom sheet changes
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [bottomSheetState]);

  // Primary short alert
  const topAlert = contextualAlerts[0] || null;

  return (
    <div className="relative flex flex-col lg:flex-row w-full h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] lg:h-[calc(100vh-3.5rem)] bg-[#FFFFFF] overflow-hidden">
      {/* Side Panel: Stops & Departures */}
      <aside className={`
        z-30 flex flex-col bg-[#FFFFFF] border-r border-[#E6E6E3]
        transition-all duration-200 ease-in-out
        w-full lg:w-[460px] shrink-0
        ${
          bottomSheetState === 'collapsed'
            ? 'h-14 overflow-hidden'
            : bottomSheetState === 'half'
            ? 'h-[50vh] lg:h-full'
            : 'h-[85vh] lg:h-full'
        }
        absolute lg:relative bottom-0 lg:bottom-auto left-0 right-0 lg:right-auto
        shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:shadow-none
      `}>
        {/* Mobile Header / Drag Toggle */}
        <div 
          onClick={() => {
            setBottomSheetState((prev) => (prev === 'collapsed' ? 'half' : prev === 'half' ? 'full' : 'collapsed'));
          }}
          className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-[#E6E6E3] bg-[#FFFFFF] cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#FF6B1A] stroke-[2]" />
            <span className="font-['Barlow_Condensed'] font-bold text-sm tracking-wide uppercase text-[#111111]">
              {isDbLoading && filteredStops.length === 0
                ? (dbLoadingMessage || 'A carregar horários…')
                : `${filteredStops.length} próximas paragens`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#6B6B6B]">
            <span>{bottomSheetState === 'collapsed' ? 'Expandir' : 'Recolher'}</span>
            {bottomSheetState === 'collapsed' ? (
              <ChevronUp className="w-4 h-4 stroke-[2]" />
            ) : (
              <ChevronDown className="w-4 h-4 stroke-[2]" />
            )}
          </div>
        </div>

        {/* Desktop Header: Brand / Search / Radar Context */}
        <div className="hidden lg:flex flex-col p-4 border-b border-[#E6E6E3] bg-[#FFFFFF] gap-3">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${gpsStatus === 'active' ? 'bg-[#FF6B1A]' : 'bg-[#6B6B6B]'}`} />
              <span className="text-xs text-[#6B6B6B] font-medium">
                {gpsStatus === 'active' ? 'GPS Ativo' : 'A localizar...'}
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
              placeholder="Para onde vais?"
              className="w-full pl-9 pr-8 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
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

            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] shadow-lg z-50 divide-y divide-[#E6E6E3] max-h-60 overflow-y-auto">
                {suggestions.map((sug, idx) => (
                  <button
                    key={`${sug.id}-${idx}`}
                    onClick={() => handleSelectDestination(sug)}
                    className="w-full text-left p-3 hover:bg-[#F4F4F2] transition-colors flex items-center gap-2.5 cursor-pointer min-h-[44px]"
                  >
                    <MapPin className="w-4 h-4 text-[#6B6B6B] shrink-0 stroke-[2]" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#111111] truncate">{sug.title}</div>
                      {sug.subtitle && (
                        <div className="text-xs text-[#6B6B6B] truncate">{sug.subtitle}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Contextual Alert Banner */}
        {topAlert && (
          <div className="px-4 py-2 bg-[#FFF7ED] border-b border-[#FFEDD5] flex items-center justify-between text-xs text-[#9A3412]">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="w-3.5 h-3.5 text-[#EA580C] shrink-0 stroke-[2]" />
              <span className="font-semibold truncate">{topAlert.título || (topAlert as any).title}</span>
            </div>
            <span className="font-['Barlow_Condensed'] text-[11px] font-bold text-[#EA580C] uppercase tracking-wide shrink-0 ml-2">
              {topAlert.severity}
            </span>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex items-center px-4 py-2 border-b border-[#E6E6E3] gap-1.5 overflow-x-auto bg-[#FFFFFF] shrink-0">
          {(['todos', 'autocarro', 'metro', 'comboio', 'barco', 'favoritos'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilterTab(tab)}
              className={`px-3 py-1 text-xs font-semibold rounded-[6px] capitalize whitespace-nowrap transition-colors cursor-pointer min-h-[32px] ${
                activeFilterTab === tab
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              {tab === 'todos' ? 'Todos' : tab === 'favoritos' ? 'Favoritas' : tab}
            </button>
          ))}
        </div>

        {/* Route Planning Result Panel (if destination active) */}
        {selectedDestination && calculatedRoutes.length > 0 && (
          <div className="p-4 border-b border-[#E6E6E3] bg-[#F4F4F2]/50 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CornerDownRight className="w-4 h-4 text-[#FF6B1A] stroke-[2]" />
                <span className="font-semibold text-xs text-[#111111] uppercase tracking-wide">
                  Opções de Rota para {selectedDestination.title}
                </span>
              </div>
              <button 
                onClick={handleClearDestination}
                className="text-xs text-[#6B6B6B] hover:text-[#111111] cursor-pointer"
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
                    className={`p-3 rounded-[8px] border transition-all cursor-pointer ${
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
                      <span className="text-xs font-bold font-['Barlow_Condensed'] text-[#FF6B1A] uppercase tracking-wide">
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

        {/* Stops List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#E6E6E3]">
          {isDbLoading && filteredStops.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2]" />
              <span>{dbLoadingMessage || 'A carregar horários…'}</span>
            </div>
          ) : isLoadingNearby ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin stroke-[2]" />
              <span>A procurar paragens próximas...</span>
            </div>
          ) : filteredStops.length > 0 ? (
            filteredStops.map((stop) => {
              const normMode = normalizeTransportMode(stop.transportMode);
              const isSelected = selectedStop?.id === stop.id;
              const stopDeps = stop.nextDepartures || [];

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
                  className={`p-4 transition-colors ${
                    isSelected ? 'bg-[#F4F4F2]' : 'bg-[#FFFFFF] hover:bg-[#F4F4F2]/50'
                  }`}
                  onClick={() => {
                    setSelectedStop(stop);
                    const lat = Number(stop.latitude);
                    const lon = Number(stop.longitude);
                    if (isValidCoordinate(lat, lon)) {
                      safeFlyTo(mapRef.current, lat, lon, 16.5);
                    }
                  }}
                >
                  {/* Stop Header */}
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h3 className="text-[18px] font-semibold text-[#111111] leading-snug truncate">
                      {formatTransitName(stop.name)}
                    </h3>
                    <div className="text-sm text-[#6B6B6B] font-medium shrink-0">
                      {normMode} · {stop.formattedDistance}
                    </div>
                  </div>

                  {/* Departures List */}
                  {stopDeps.length > 0 ? (
                    <div className="divide-y divide-[#E6E6E3] border-t border-[#E6E6E3]">
                      {/* Aviso discreto por operador uma só vez no topo do grupo */}
                      {outdatedNotice && (
                        <div className="py-1 px-1 bg-[#F4F4F2] text-[11px] text-[#6B6B6B] flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                          <span>Horários {outdatedNotice} podem estar desatualizados</span>
                        </div>
                      )}

                      {sortDepartures(stopDeps).slice(0, 5).map((dep: any, dIdx: number) => {
                        const parsed = parseDepartureTime(dep);
                        const lineCode = dep.lineCode || dep.route_short_name || stop.lines?.[0]?.code || '—';
                        const lineColor = dep.lineColor || stop.lines?.[0]?.color;
                        const destination = formatTransitName(dep.destination || dep.headsign || 'Destino');
                        const stopName = formatTransitName(stop.name);

                        return (
                          <div
                            key={dIdx}
                            className="py-2.5 flex items-center justify-between gap-3"
                          >
                            {/* Left: Line Chip + Destination & stop name */}
                            <div className="flex items-center gap-2.5 min-w-0">
                              <LineChip number={lineCode} color={lineColor} />
                              <div className="min-w-0">
                                <div className="text-[16px] font-medium text-[#111111] leading-tight truncate">
                                  {destination}
                                </div>
                                <div className="text-xs text-[#6B6B6B] truncate mt-0.5">
                                  {stopName}
                                </div>
                              </div>
                            </div>

                            {/* Right: Minutos em grande e hora exata por baixo */}
                            <div className="shrink-0 flex flex-col items-end text-right pl-2">
                              <div className="flex items-center gap-1">
                                {parsed.isRealtime && (
                                  <Radio 
                                    className={`w-3.5 h-3.5 stroke-[2] ${parsed.textColorClass}`} 
                                    style={{ color: parsed.textColor }}
                                  />
                                )}
                                <span 
                                  className={`font-['Barlow_Condensed'] text-[24px] font-bold leading-none tabular-nums ${parsed.textColorClass}`}
                                  style={{ color: parsed.textColor }}
                                >
                                  {parsed.bigText}
                                </span>
                              </div>
                              {parsed.exactTime && (
                                <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                  {parsed.exactTime}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-[#6B6B6B] pt-1">
                      Sem partidas previstas.
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-[#6B6B6B]">
              {isDbLoading ? (dbLoadingMessage || 'A carregar horários…') : 'Sem paragens nesta área.'}
            </div>
          )}
        </div>
      </aside>

      {/* Main Map Canvas */}
      <main className="relative flex-1 h-full min-h-[360px] bg-[#F4F4F2] overflow-hidden select-none">
        {/* Mobile Top Floating Search Bar */}
        <div className="lg:hidden absolute top-3 left-3 right-16 z-20">
          <div className="relative flex items-center bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] shadow-sm">
            <Search className="absolute left-3 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" />
            <input
              type="text"
              value={destinationQuery}
              onChange={(e) => setDestinationQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              placeholder="Para onde vais?"
              className="w-full pl-9 pr-8 py-2 bg-transparent text-xs sm:text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
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
          {/* Mobile Suggestions Dropdown */}
          {searchFocused && suggestions.length > 0 && (
            <div className="mt-1 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] shadow-lg divide-y divide-[#E6E6E3] max-h-56 overflow-y-auto">
              {suggestions.map((sug, sIdx) => (
                <button
                  key={`mob-${sug.id}-${sIdx}`}
                  onClick={() => handleSelectDestination(sug)}
                  className="w-full text-left p-2.5 hover:bg-[#F4F4F2] transition-colors flex items-center gap-2 cursor-pointer min-h-[44px]"
                >
                  <MapPin className="w-4 h-4 text-[#6B6B6B] shrink-0 stroke-[2]" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#111111] truncate">{sug.title}</div>
                    {sug.subtitle && (
                      <div className="text-[10px] text-[#6B6B6B] truncate">{sug.subtitle}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Aviso quando não há localização (recusada ou GPS sem sinal) */}
        {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
          <div className="absolute left-4 right-4 bottom-28 z-20 mx-auto max-w-md bg-[#111111] text-[#FFFFFF] rounded-[8px] px-4 py-3 flex items-center gap-3 shadow-md">
            <span className="text-xs leading-snug flex-1">
              {gpsStatus === 'denied'
                ? 'A localização está bloqueada. Permite-a nas definições do browser para este site.'
                : 'Não foi possível obter a tua localização.'}
            </span>
            <button
              onClick={() => activateLocation(true)}
              className="shrink-0 px-3 py-2 rounded-[8px] bg-[#FF6B1A] text-[#111111] text-xs font-bold min-h-[40px]"
            >
              Tentar outra vez
            </button>
          </div>
        )}

        {/* Leaflet OSM Tile Container */}
        <div 
          ref={mapContainerRef} 
          className="absolute inset-0 w-full h-full z-0"
        />

        {/* Map Controls */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          {/* Recenter Primary Button */}
          <button
            onClick={handleRecenterClick}
            className="px-3 py-2 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-xs flex items-center gap-1.5 min-h-[44px] shadow-sm cursor-pointer"
            title="Centrar posição"
          >
            <LocateFixed className="w-4 h-4 stroke-[2]" />
            <span className="hidden sm:inline">Centrar</span>
          </button>

          {/* Zoom In / Out Controls */}
          <div className="flex flex-col bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] shadow-sm overflow-hidden">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="p-2 hover:bg-[#F4F4F2] text-[#111111] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer border-b border-[#E6E6E3]"
              title="Aproximar mapa"
              aria-label="Aproximar mapa"
            >
              <ZoomIn className="w-4 h-4 stroke-[2]" />
            </button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="p-2 hover:bg-[#F4F4F2] text-[#111111] min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              title="Afastar mapa"
              aria-label="Afastar mapa"
            >
              <ZoomOut className="w-4 h-4 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Stop Detail Floating Drawer (if stop selected) */}
        {selectedStop && (
          <div className="absolute bottom-[4.5rem] lg:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[35] bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-[#E6E6E3] pb-2">
              <div>
                <h4 className="font-semibold text-base text-[#111111] leading-tight">
                  {formatTransitName(selectedStop.name)}
                </h4>
                <div className="text-xs text-[#6B6B6B] mt-0.5">
                  {normalizeTransportMode(selectedStop.transportMode)} · {selectedStop.formattedDistance}
                </div>
              </div>
              <button
                onClick={() => setSelectedStop(null)}
                className="text-[#6B6B6B] hover:text-[#111111] p-1 cursor-pointer"
                aria-label="Fechar detalhes da paragem"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            {/* Departures in selected stop modal */}
            <div className="mt-2 divide-y divide-[#E6E6E3] max-h-56 overflow-y-auto">
              {(() => {
                const proprias = selectedStop.nextDepartures || [];
                const extra = partidasExtra?.id === selectedStop.id ? partidasExtra : null;
                const deps = proprias.length > 0 ? proprias : (extra?.deps || []);
                const sorted = sortDepartures(deps).slice(0, 6);
                if (sorted.length === 0) {
                  return (
                    <div className="py-3 text-sm text-[#6B6B6B]">
                      {extra?.aCarregar || (!extra && proprias.length === 0) ? 'A carregar partidas…' : 'Sem partidas nas próximas horas.'}
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
                      <div className="py-1 px-1 bg-[#F4F4F2] text-[11px] text-[#6B6B6B] flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3 h-3 text-[#6B6B6B] stroke-[2] shrink-0" />
                        <span>Horários {outdatedNotice} podem estar desatualizados</span>
                      </div>
                    )}
                    {sorted.map((dep: any, dIdx: number) => {
                      const parsed = parseDepartureTime(dep);
                      const destination = formatTransitName(dep.destination || dep.headsign || 'Destino');
                      const stopName = formatTransitName(selectedStop.name);
                      return (
                        <div key={dIdx} className="py-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <LineChip number={dep.lineCode || dep.route_short_name || '—'} color={dep.lineColor} />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#111111] truncate">
                                {destination}
                              </div>
                              <div className="text-xs text-[#6B6B6B] truncate">
                                {stopName}
                              </div>
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
                                className={`font-['Barlow_Condensed'] text-xl font-bold tabular-nums leading-none ${parsed.textColorClass}`}
                                style={{ color: parsed.textColor }}
                              >
                                {parsed.bigText}
                              </span>
                            </div>
                            {parsed.exactTime && (
                              <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums mt-0.5">
                                {parsed.exactTime}
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
      </main>
    </div>
  );
};

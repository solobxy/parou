import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Navigation, 
  MapPin, 
  Compass, 
  Search, 
  X, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Layers, 
  Clock, 
  AlertTriangle, 
  Star, 
  ChevronRight, 
  ChevronUp, 
  ChevronDown, 
  Activity, 
  ArrowRight, 
  Bus, 
  Train, 
  Ship, 
  Footprints, 
  Radio, 
  Gauge, 
  CornerDownRight, 
  RefreshCw, 
  ShieldCheck, 
  Crosshair,
  SlidersHorizontal,
  LocateFixed
} from 'lucide-react';
import { useUserLocation, UserCoords } from '../hooks/useUserLocation';
import { 
  fetchNearbyTransit, 
  searchDestinations, 
  planTransitRoute, 
  toggleFavoriteStopId, 
  getFavoriteStopIds 
} from '../services/pertoApi';
import { 
  addFavorite, 
  removeFavorite, 
  isItemFavorited 
} from '../services/favoritesService';
import { calculateDistanceMeters } from '../data/portugalTransitStopsGeo';
import { 
  NearbyStopItem, 
  NearbyVehicleItem, 
  TransitRouteOption, 
  DestinationSuggestion,
} from '../types/perto';
import { CentralAlert } from '../types/alerts';

interface PertoViewProps {
  onOpenReportModal?: () => void;
  onSelectLineInSchedules?: (lineCode: string) => void;
  initialDestination?: { title: string; lat: number; lon: number } | null;
  onClearInitialDestination?: () => void;
}

// Global safeguard to catch and prevent unhandled Leaflet LatLng errors from bubbling
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (
      event.message &&
      (event.message.includes('Invalid LatLng object') || event.message.includes('LatLng'))
    ) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Leaflet Safeguard] Suppressed invalid LatLng uncaught error:', event.message);
    }
  }, true);
}

// Normalize mode across GTFS feeds to exact standard categories
export function normalizeTransportMode(modeStr: string = ''): 'Autocarro' | 'Metro' | 'Comboio' | 'Barco' {
  const m = String(modeStr || '').toLowerCase();
  if (m.includes('metro') || m.includes('subway') || m.includes('tram') || m.includes('mst')) return 'Metro';
  if (m.includes('comboio') || m.includes('train') || m.includes('rail') || m.includes('fertagus') || m.includes('cp')) return 'Comboio';
  if (m.includes('barco') || m.includes('ferry') || m.includes('fluvial') || m.includes('navio')) return 'Barco';
  return 'Autocarro';
}

// Strict validation to completely prevent Leaflet "Invalid LatLng object: (NaN, NaN)" exceptions
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

// Global comprehensive safeguards for Leaflet LatLng construction and class
if (typeof L !== 'undefined') {
  // 1. Monkeypatch L.LatLng class constructor so internal Leaflet calls never throw
  // @ts-ignore
  const _OrigLatLngClass = L.LatLng;
  if (_OrigLatLngClass) {
    // @ts-ignore
    L.LatLng = function (lat: any, lng: any, alt?: any) {
      let nLat = Number(lat);
      let nLng = Number(lng);
      if (!Number.isFinite(nLat) || isNaN(nLat) || nLat < -90 || nLat > 90) {
        nLat = 38.7253; // Default Lisbon latitude
      }
      if (!Number.isFinite(nLng) || isNaN(nLng) || nLng < -180 || nLng > 180) {
        nLng = -9.1500; // Default Lisbon longitude
      }
      // @ts-ignore
      return new _OrigLatLngClass(nLat, nLng, alt);
    };
    // Preserve prototype so `instanceof L.LatLng` continues to work seamlessly
    // @ts-ignore
    L.LatLng.prototype = _OrigLatLngClass.prototype;
  }

  // 2. Monkeypatch L.latLng factory function
  if (L.latLng) {
    const _origLatLng = L.latLng;
    // @ts-ignore
    L.latLng = function (a: any, b?: any, c?: any) {
      try {
        if (Array.isArray(a)) {
          const pLat = Number(a[0]);
          const pLon = Number(a[1]);
          if (!isValidCoordinate(pLat, pLon)) {
            return _origLatLng(38.7253, -9.1500);
          }
          return _origLatLng(pLat, pLon, a[2]);
        }
        if (typeof a === 'object' && a !== null) {
          const pLat = Number(a.lat !== undefined ? a.lat : a.latitude);
          const pLon = Number(a.lng !== undefined ? a.lng : (a.lon !== undefined ? a.lon : a.longitude));
          if (!isValidCoordinate(pLat, pLon)) {
            return _origLatLng(38.7253, -9.1500);
          }
          return _origLatLng(pLat, pLon, a.alt);
        }
        const pLat = Number(a);
        const pLon = Number(b);
        if (!isValidCoordinate(pLat, pLon)) {
          return _origLatLng(38.7253, -9.1500);
        }
        return _origLatLng(pLat, pLon, c);
      } catch {
        return _origLatLng(38.7253, -9.1500);
      }
    };
  }

  // 3. Monkeypatch L.latLngBounds to safely filter out any invalid points
  if (L.latLngBounds) {
    const _origBounds = L.latLngBounds;
    // @ts-ignore
    L.latLngBounds = function (a: any, b?: any) {
      try {
        if (Array.isArray(a)) {
          const cleanPoints = a
            .map((pt: any) => {
              if (Array.isArray(pt) && isValidCoordinate(pt[0], pt[1])) {
                return [Number(pt[0]), Number(pt[1])];
              }
              if (typeof pt === 'object' && pt !== null) {
                const lat = pt.lat !== undefined ? pt.lat : pt.latitude;
                const lon = pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt.longitude);
                if (isValidCoordinate(lat, lon)) {
                  return [Number(lat), Number(lon)];
                }
              }
              return null;
            })
            .filter(Boolean);

          if (cleanPoints.length === 0) {
            return _origBounds([[38.7253, -9.1500], [38.7254, -9.1501]]);
          }
          return _origBounds(cleanPoints as L.LatLngExpression[]);
        }
        return _origBounds(a, b);
      } catch {
        return _origBounds([[38.7253, -9.1500], [38.7254, -9.1501]]);
      }
    };
  }

  // 4. Monkeypatch L.Marker to validate coordinates before instantiation
  if (L.marker) {
    const _origMarker = L.marker;
    // @ts-ignore
    L.marker = function (latlng: any, options?: any) {
      try {
        let safeLatLng = latlng;
        if (Array.isArray(latlng)) {
          const lat = Number(latlng[0]);
          const lon = Number(latlng[1]);
          if (!isValidCoordinate(lat, lon)) {
            safeLatLng = [38.7253, -9.1500];
          }
        } else if (typeof latlng === 'object' && latlng !== null) {
          const lat = latlng.lat !== undefined ? latlng.lat : latlng.latitude;
          const lon = latlng.lng !== undefined ? latlng.lng : (latlng.lon !== undefined ? latlng.lon : latlng.longitude);
          if (!isValidCoordinate(lat, lon)) {
            safeLatLng = { lat: 38.7253, lng: -9.1500 };
          }
        } else {
          safeLatLng = [38.7253, -9.1500];
        }
        return _origMarker(safeLatLng, options);
      } catch {
        return _origMarker([38.7253, -9.1500], options);
      }
    };
  }

  // 5. Monkeypatch L.circle to validate coordinates before instantiation
  if (L.circle) {
    const _origCircle = L.circle;
    // @ts-ignore
    L.circle = function (latlng: any, options?: any) {
      try {
        let safeLatLng = latlng;
        if (Array.isArray(latlng)) {
          const lat = Number(latlng[0]);
          const lon = Number(latlng[1]);
          if (!isValidCoordinate(lat, lon)) {
            safeLatLng = [38.7253, -9.1500];
          }
        } else if (typeof latlng === 'object' && latlng !== null) {
          const lat = latlng.lat !== undefined ? latlng.lat : latlng.latitude;
          const lon = latlng.lng !== undefined ? latlng.lng : (latlng.lon !== undefined ? latlng.lon : latlng.longitude);
          if (!isValidCoordinate(lat, lon)) {
            safeLatLng = { lat: 38.7253, lng: -9.1500 };
          }
        } else {
          safeLatLng = [38.7253, -9.1500];
        }
        return _origCircle(safeLatLng, options);
      } catch {
        return _origCircle([38.7253, -9.1500], options);
      }
    };
  }

  // 6. Monkeypatch L.polyline to validate coordinates before instantiation
  if (L.polyline) {
    const _origPolyline = L.polyline;
    // @ts-ignore
    L.polyline = function (latlngs: any, options?: any) {
      try {
        let clean = Array.isArray(latlngs)
          ? latlngs.filter((pt: any) => {
              if (Array.isArray(pt)) return isValidCoordinate(pt[0], pt[1]);
              if (typeof pt === 'object' && pt !== null) {
                const lat = pt.lat !== undefined ? pt.lat : pt.latitude;
                const lon = pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt.longitude);
                return isValidCoordinate(lat, lon);
              }
              return false;
            })
          : [];
        if (clean.length < 2) {
          clean = [[38.7253, -9.1500], [38.7254, -9.1501]];
        }
        return _origPolyline(clean, options);
      } catch {
        return _origPolyline([[38.7253, -9.1500], [38.7254, -9.1501]], options);
      }
    };
  }

  // 7. Monkeypatch L.Map.prototype.flyTo to prevent division by 0 when container is unpainted or 0px
  if (L.Map && L.Map.prototype) {
    const _origMapFlyTo = L.Map.prototype.flyTo;
    L.Map.prototype.flyTo = function (targetCenter: any, targetZoom?: any, options?: any) {
      try {
        const container = this.getContainer();
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
          return this.setView(targetCenter, targetZoom);
        }
        return _origMapFlyTo.call(this, targetCenter, targetZoom, options);
      } catch {
        try {
          return this.setView(targetCenter, targetZoom);
        } catch {
          return this;
        }
      }
    };

    const _origMapPanTo = L.Map.prototype.panTo;
    L.Map.prototype.panTo = function (targetCenter: any, options?: any) {
      try {
        const container = this.getContainer();
        if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
          return this.setView(targetCenter);
        }
        return _origMapPanTo.call(this, targetCenter, options);
      } catch {
        try {
          return this.setView(targetCenter);
        } catch {
          return this;
        }
      }
    };
  }
}

function safeFlyTo(
  map: L.Map | null,
  lat: unknown,
  lon: unknown,
  targetZoom?: number,
  options?: L.ZoomPanOptions
) {
  if (!map) return;
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (!isValidCoordinate(nLat, nLon)) return;

  try {
    const container = typeof map.getContainer === 'function' ? map.getContainer() : null;
    if (!container || container.clientWidth <= 0 || container.clientHeight <= 0) {
      if (typeof map.setView === 'function') {
        map.setView([nLat, nLon], targetZoom || 15);
      }
      return;
    }

    const currentZoom = typeof map.getZoom === 'function' ? map.getZoom() : 15;
    const safeZoom = Number.isFinite(targetZoom)
      ? targetZoom!
      : (Number.isFinite(currentZoom) ? currentZoom : 15);

    const center = typeof map.getCenter === 'function' ? map.getCenter() : null;
    if (center && Math.abs(center.lat - nLat) < 0.00005 && Math.abs(center.lng - nLon) < 0.00005) {
      return;
    }

    map.flyTo([nLat, nLon], safeZoom, options || { animate: true });
  } catch (err) {
    console.warn('[PertoView] safeFlyTo catch:', err);
    try {
      map.setView([nLat, nLon], targetZoom || 15);
    } catch {}
  }
}

function safeFitBounds(
  map: L.Map | null,
  latlngs: L.LatLngTuple[],
  options?: L.FitBoundsOptions
) {
  if (!map || !Array.isArray(latlngs) || latlngs.length === 0) return;
  const validPoints = latlngs.filter(pt => isValidCoordinate(pt[0], pt[1]));
  if (validPoints.length === 0) return;

  try {
    const container = map.getContainer();
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }
    const bounds = L.latLngBounds(validPoints);
    if (!bounds.isValid()) return;
    if (bounds.getSouthWest().equals(bounds.getNorthEast())) {
      map.setView(bounds.getCenter(), 15);
      return;
    }
    map.fitBounds(bounds, options || { padding: [50, 50] });
  } catch (err) {
    console.warn('[PertoView] safeFitBounds catch:', err);
  }
}

export const PertoView: React.FC<PertoViewProps> = ({
  onOpenReportModal,
  onSelectLineInSchedules,
  initialDestination,
  onClearInitialDestination,
}) => {
  // 1. User Location Hook
  const {
    status: gpsStatus,
    coords: userCoords,
    errorMessage: gpsError,
    followMode,
    isRefreshingGps,
    setFollowMode,
    activateLocation,
    refreshHighAccuracyLocation,
    setManualLocation,
    recenter,
    handleMapInteraction,
  } = useUserLocation();

  // 2. Data State
  const [stops, setStops] = useState<NearbyStopItem[]>([]);
  const [vehicles, setVehicles] = useState<NearbyVehicleItem[]>([]);
  const [contextualAlerts, setContextualAlerts] = useState<CentralAlert[]>([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');
  const [selectedRadius, setSelectedRadius] = useState<number>(500);

  // 3. Selection & Modal State
  const [selectedStop, setSelectedStop] = useState<NearbyStopItem | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<NearbyVehicleItem | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<'todos' | 'metro' | 'comboio' | 'autocarro' | 'barco' | 'favoritos' | 'alertas'>('todos');
  const [favoriteStopIds, setFavoriteStopIds] = useState<Set<string>>(new Set());

  // 4. "Para onde?" Destination Search & Routing State
  const [destinationQuery, setDestinationQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState<boolean>(false);
  const [selectedDestination, setSelectedDestination] = useState<DestinationSuggestion | null>(null);
  const [calculatedRoutes, setCalculatedRoutes] = useState<TransitRouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<TransitRouteOption | null>(null);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState<boolean>(false);
  const [searchFocused, setSearchFocused] = useState<boolean>(false);

  // 5. Mobile Bottom Sheet State
  const [bottomSheetState, setBottomSheetState] = useState<'collapsed' | 'half' | 'full'>('half');

  // Leaflet references
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const vehiclesLayerRef = useRef<L.LayerGroup | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);

  const lastQueriedCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const hasCenteredInitiallyRef = useRef<boolean>(false);

  // Refresh favorite IDs on mount
  useEffect(() => {
    setFavoriteStopIds(getFavoriteStopIds());
  }, []);

  // Auto-activate location on mount
  useEffect(() => {
    if (gpsStatus === 'idle') {
      activateLocation(true);
    }
  }, [gpsStatus, activateLocation]);

  // Load nearby transit data
  const loadNearbyData = useCallback(async (lat: number, lon: number, radius: number = selectedRadius) => {
    if (!isValidCoordinate(lat, lon)) return;
    setIsLoadingNearby(true);
    try {
      const data = await fetchNearbyTransit(lat, lon, radius);
      const rawStops = Array.isArray(data?.stops) ? data.stops : [];
      const favSet = favoriteStopIds;

      const cleanStops: NearbyStopItem[] = rawStops.map((s: any) => {
        const pLat = Number(s.latitude ?? s.lat);
        const pLon = Number(s.longitude ?? s.lon);
        const validCoords = isValidCoordinate(pLat, pLon);
        const rawLines = Array.isArray(s.lines) ? s.lines : [];
        const rawDeps = Array.isArray(s.nextDepartures) ? s.nextDepartures : (Array.isArray(s.departures) ? s.departures : []);

        const mappedDeps = rawDeps.map((d: any) => ({
          lineCode: String(d.lineCode || d.route_short_name || d.route || 'LINHA'),
          lineName: String(d.lineName || d.route_long_name || d.headsign || ''),
          lineColor: d.lineColor || d.route_color || '#3b82f6',
          destination: String(d.destination || d.headsign || 'Terminal'),
          operatorName: String(d.operatorName || d.operator_name || d.operator || 'Operador'),
          operatorId: String(d.operatorId || d.feed_id || d.feed || 'transporte'),
          transportMode: (d.transportMode || s.transportMode || 'Autocarro') as any,
          departureTime: String(d.departureTime || d.display_text || d.scheduled_time || 'sem horário'),
          displayText: String(d.displayText || d.display_text || d.departureTime || 'sem horário'),
          scheduledTime: d.scheduledTime || d.scheduled_time,
          etaMinutes: Number(d.etaMinutes ?? d.departureMinutes ?? 0),
          departureMinutes: Number(d.departureMinutes ?? d.etaMinutes ?? 0),
          isRealtime: Boolean(d.isRealtime || d.is_realtime || d.state === 'TEMPO REAL'),
          state: d.state || (d.isRealtime ? 'TEMPO REAL' : 'PROGRAMADO'),
          statusDescription: d.statusDescription || d.state_reason || '',
          isDelayed: Boolean(d.isDelayed || d.is_delayed),
        }));

        const mappedLines = rawLines.length > 0
          ? rawLines.map((l: any) => ({
              code: String(l.code || l.route_short_name || l.route_id || 'LINHA'),
              name: String(l.name || l.route_long_name || ''),
              color: l.color || l.route_color || '#3b82f6',
              destination: String(l.destination || ''),
              frequencyMinutes: Number(l.frequencyMinutes || 10),
            }))
          : mappedDeps.map((d: any) => ({
              code: d.lineCode,
              name: d.lineName,
              color: d.lineColor,
              destination: d.destination,
              frequencyMinutes: 10,
            }));

        const distVal = Number(s.distanceMeters ?? s.distance_meters ?? 0);
        return {
          id: String(s.id || ''),
          name: String(s.name || 'Paragem'),
          operatorId: String(s.operatorId || s.feed_ids?.[0] || 'transportes'),
          operatorName: String(s.operatorName || s.operators?.[0] || 'Transportes'),
          transportMode: (s.transportMode || s.modes?.[0] || 'Autocarro') as any,
          latitude: pLat,
          longitude: pLon,
          locality: s.locality || 'Portugal',
          district: s.district || 'Portugal',
          distanceMeters: distVal,
          formattedDistance: s.formattedDistance || (distVal >= 1000 ? `${(distVal / 1000).toFixed(1)} km` : `${distVal} m`),
          walkingMinutes: Number(s.walkingMinutes || Math.max(1, Math.round(distVal / 80))),
          lines: mappedLines,
          nextDepartures: mappedDeps,
          activeAlerts: Array.isArray(s.activeAlerts) ? s.activeAlerts : [],
          isFavorite: favSet.has(s.id),
        };
      })
      .filter((s) => isValidCoordinate(s.latitude, s.longitude))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

      const rawVehicles = Array.isArray(data?.vehicles) ? data.vehicles : [];
      const cleanVehicles: NearbyVehicleItem[] = rawVehicles.map((v: any) => {
        const vLat = Number(v.latitude ?? v.lat);
        const vLon = Number(v.longitude ?? v.lon);
        const validCoords = isValidCoordinate(vLat, vLon);
        return {
          id: String(v.id || ''),
          vehicleId: String(v.vehicleId || v.id || ''),
          agencyId: String(v.agencyId || v.operator || ''),
          agencyName: String(v.agencyName || v.operator || 'Operador'),
          lineCode: String(v.lineCode || v.line_id || 'BUS'),
          lineName: String(v.lineName || ''),
          lineColor: v.lineColor || '#0284c7',
          destination: v.destination ? String(v.destination) : undefined,
          latitude: validCoords ? vLat : 38.7253,
          longitude: validCoords ? vLon : -9.1500,
          distanceMeters: Number(v.distanceMeters || 0),
          formattedDistance: String(v.formattedDistance || `${Number(v.distanceMeters || 0)} m`),
          bearing: v.bearing !== undefined && Number.isFinite(Number(v.bearing)) ? Number(v.bearing) : undefined,
          speed: v.speed !== undefined && Number.isFinite(Number(v.speed)) ? Number(v.speed) : undefined,
          currentStatus: String(v.currentStatus || 'Em circulação'),
          statusLabel: String(v.statusLabel || v.currentStatus || 'Em circulação'),
          etaDescription: v.etaDescription || '',
          hasLiveEta: Boolean(v.hasLiveEta),
          lastUpdated: v.lastUpdated || v.timestamp || '',
          isRealtime: true as const,
        };
      }).filter((v) => isValidCoordinate(v.latitude, v.longitude));

      setStops(cleanStops);
      setVehicles(cleanVehicles);
      setContextualAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
      setLastRefreshedAt(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      lastQueriedCoordsRef.current = { lat, lon };
    } catch (err) {
      console.warn('[PERTO] Erro ao carregar transportes próximos:', err);
    } finally {
      setIsLoadingNearby(false);
    }
  }, [selectedRadius, favoriteStopIds]);

  // Trigger load when coordinates change (Rule 4: Quando a localização mudar mais de 50 m, refaz a pesquisa)
  useEffect(() => {
    if (!userCoords || !isValidCoordinate(userCoords.latitude, userCoords.longitude)) return;

    const prev = lastQueriedCoordsRef.current;
    if (!prev) {
      loadNearbyData(userCoords.latitude, userCoords.longitude, selectedRadius);
      return;
    }

    const distMoved = calculateDistanceMeters(prev.lat, prev.lon, userCoords.latitude, userCoords.longitude);
    if (distMoved >= 50) {
      loadNearbyData(userCoords.latitude, userCoords.longitude, selectedRadius);
    }
  }, [userCoords, selectedRadius, loadNearbyData]);

  // Auto-refresh live transit data every 20 seconds, strictly only while the screen is visible (Rule 4)
  useEffect(() => {
    if (!userCoords || !isValidCoordinate(userCoords.latitude, userCoords.longitude)) return;

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return; // Do not poll in background tabs
      }
      loadNearbyData(userCoords.latitude, userCoords.longitude, selectedRadius);
    }, 20000);

    return () => clearInterval(interval);
  }, [userCoords, selectedRadius, loadNearbyData]);

  // 3. Enquanto a janela do selectedStop está aberta, atualiza-a a cada 30 segundos
  useEffect(() => {
    if (!selectedStop?.id) return;

    const refreshStop = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      try {
        const res = await fetch(`/api/stops/${encodeURIComponent(selectedStop.id)}/departures?limit=10`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.departures)) {
            setSelectedStop((prev) => {
              if (!prev || prev.id !== selectedStop.id) return prev;
              const mapped = data.departures.map((d: any) => ({
                lineCode: d.line_code,
                lineName: d.line_name,
                lineColor: d.color,
                destination: d.destination,
                operatorName: d.operator,
                departureTime: d.time || d.scheduled_time,
                scheduledTime: d.scheduled_time || d.time,
                displayText: d.displayText,
                etaMinutes: d.countdown_minutes,
                departureMinutes: d.countdown_minutes,
                isRealtime: d.state === 'Tempo Real',
                state: d.state,
              }));
              return {
                ...prev,
                nextDepartures: mapped,
              };
            });
          }
        }
      } catch {
        // silent
      }
    };

    const interval = setInterval(refreshStop, 30000);
    return () => clearInterval(interval);
  }, [selectedStop?.id]);

  // ========================================================
  // LEAFLET MAP INITIALIZATION & TILE HANDLING
  // ========================================================
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const userLat = Number(userCoords?.latitude);
    const userLon = Number(userCoords?.longitude);
    const hasValidUserCoords = isValidCoordinate(userLat, userLon);
    const defaultLat = hasValidUserCoords ? userLat : 38.7253; // Marquês de Pombal, Lisboa default
    const defaultLon = hasValidUserCoords ? userLon : -9.1500;
    const initialZoom = hasValidUserCoords ? 15 : 12;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLon],
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false,
    });

    // Exclusively OpenStreetMap tile layer
    const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Layer groups for clean updates
    userLayerRef.current = L.layerGroup().addTo(map);
    stopsLayerRef.current = L.layerGroup().addTo(map);
    vehiclesLayerRef.current = L.layerGroup().addTo(map);
    routesLayerRef.current = L.layerGroup().addTo(map);

    // Map drag / interaction turns off follow mode
    map.on('dragstart', () => {
      handleMapInteraction();
    });

    mapRef.current = map;

    // Ensure proper sizing after layout paint
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recenter map on user location whenever coords arrive or followMode is true
  useEffect(() => {
    if (!mapRef.current || !userCoords) return;
    if (!isValidCoordinate(userCoords.latitude, userCoords.longitude)) return;

    if (followMode || !hasCenteredInitiallyRef.current) {
      const curZoom = typeof mapRef.current.getZoom === 'function' ? mapRef.current.getZoom() : 15;
      const targetZoom = Number.isFinite(curZoom) ? Math.max(curZoom, 15) : 15;
      safeFlyTo(
        mapRef.current,
        userCoords.latitude,
        userCoords.longitude,
        targetZoom,
        { animate: true, duration: 0.8 }
      );
      hasCenteredInitiallyRef.current = true;
    }
  }, [userCoords, followMode]);

  // Invalidate map size on window resize or bottomSheet toggle
  useEffect(() => {
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [bottomSheetState]);

  // ========================================================
  // RENDER USER LOCATION PIN & ACCURACY CIRCLE
  // ========================================================
  useEffect(() => {
    if (!userLayerRef.current || !userCoords) return;
    userLayerRef.current.clearLayers();

    const { latitude, longitude, accuracy, isManual } = userCoords;
    if (!isValidCoordinate(latitude, longitude)) return;

    // Accuracy Circle
    const accuracyRadius = Math.max(accuracy || 10, 8);
    const circle = L.circle([latitude, longitude], {
      radius: accuracyRadius,
      color: isManual ? '#8b5cf6' : '#06b6d4',
      fillColor: isManual ? '#8b5cf6' : '#06b6d4',
      fillOpacity: 0.15,
      weight: 1.5,
      dashArray: accuracy > 40 ? '4 4' : undefined,
    });
    circle.addTo(userLayerRef.current);

    // Glowing User Pin HTML Icon
    const userIconHtml = `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <span class="absolute w-8 h-8 rounded-full ${isManual ? 'bg-purple-500/30' : 'bg-cyan-500/30'} animate-ping"></span>
        <span class="relative flex items-center justify-center w-6 h-6 rounded-full ${isManual ? 'bg-purple-500' : 'bg-cyan-500'} border-2 border-white shadow-xl shadow-cyan-500/50">
          <span class="w-2 h-2 rounded-full bg-white"></span>
        </span>
      </div>
    `;

    const userMarkerIcon = L.divIcon({
      html: userIconHtml,
      className: 'parou-user-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([latitude, longitude], { icon: userMarkerIcon });
    marker.bindPopup(`
      <div style="background: #0f172a; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-family: sans-serif; border: 1px solid #06b6d4;">
        <div style="font-weight: bold; color: #38bdf8; display: flex; items-center; gap: 4px;">
          ${isManual ? '📍 Posição Personalizada' : '📍 A Sua Localização Atual'}
        </div>
        <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">
          ${isManual ? 'Definida manualmente no mapa' : `Precisão do GPS: ±${accuracy}m`}
        </div>
      </div>
    `, { className: 'parou-custom-popup', closeButton: false });

    marker.addTo(userLayerRef.current);
  }, [userCoords]);

  // ========================================================
  // RENDER TRANSIT STOPS ON LEAFLET MAP
  // ========================================================
  const filteredStops = useMemo(() => {
    return stops.filter((stop) => {
      const mode = normalizeTransportMode(stop.transportMode);
      if (activeFilterTab === 'todos') return true;
      if (activeFilterTab === 'metro') return mode === 'Metro';
      if (activeFilterTab === 'comboio') return mode === 'Comboio';
      if (activeFilterTab === 'autocarro') return mode === 'Autocarro';
      if (activeFilterTab === 'barco') return mode === 'Barco';
      if (activeFilterTab === 'favoritos') return stop.isFavorite || favoriteStopIds.has(stop.id);
      if (activeFilterTab === 'alertas') return (stop.activeAlerts?.length ?? 0) > 0;
      return true;
    });
  }, [stops, activeFilterTab, favoriteStopIds]);

  useEffect(() => {
    if (!stopsLayerRef.current) return;
    stopsLayerRef.current.clearLayers();

    filteredStops.forEach((stop) => {
      const lat = Number(stop.latitude);
      const lon = Number(stop.longitude);
      if (!isValidCoordinate(lat, lon)) return;

      const isSelected = selectedStop?.id === stop.id;
      const isFav = stop.isFavorite || favoriteStopIds.has(stop.id);

      const normMode = normalizeTransportMode(stop.transportMode);
      let modeBg = '#2563eb'; // Blue for Bus
      let modeText = '#ffffff';
      let modeLetter = 'BUS';
      if (normMode === 'Metro') {
        modeBg = '#eab308'; // Yellow for Metro
        modeText = '#000000';
        modeLetter = 'M';
      } else if (normMode === 'Comboio') {
        modeBg = '#16a34a'; // Green for Trains
        modeText = '#ffffff';
        modeLetter = 'CP';
      } else if (normMode === 'Barco') {
        modeBg = '#06b6d4'; // Cyan for Ferry/Boat
        modeText = '#ffffff';
        modeLetter = 'BAR';
      }

      const stopIconHtml = `
        <div class="cursor-pointer transition-transform hover:scale-110 flex flex-col items-center" style="width: 36px; height: 30px; pointer-events: auto; z-index: ${isSelected ? 999 : 50};">
          <div style="background-color: ${modeBg}; color: ${modeText};" class="px-1.5 py-0.5 rounded-md border border-white shadow-md flex items-center justify-center gap-1 text-[10px] font-black leading-none whitespace-nowrap ${isSelected ? 'ring-2 ring-cyan-400 scale-110' : ''}">
            <span>${modeLetter}</span>
            ${isFav ? '<span style="color: #fbbf24;">★</span>' : ''}
          </div>
          <div style="width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid ${modeBg}; margin-top: -1px;"></div>
        </div>
      `;

      const stopIcon = L.divIcon({
        html: stopIconHtml,
        className: 'parou-stop-marker',
        iconSize: [36, 30],
        iconAnchor: [18, 29], // Bottom tip of the pointer
      });

      // Ponto exato da paragem na coordenada geográfica real
      const exactDot = L.circleMarker([lat, lon], {
        radius: 3.5,
        fillColor: modeBg,
        color: '#ffffff',
        weight: 1.5,
        fillOpacity: 1,
        interactive: false,
      });
      exactDot.addTo(stopsLayerRef.current!);

      const marker = L.marker([lat, lon], { icon: stopIcon });

      // Click handler on marker
      marker.on('click', () => {
        setSelectedStop(stop);
        const curZoom = typeof mapRef.current?.getZoom === 'function' ? mapRef.current.getZoom() : 16;
        const targetZoom = Number.isFinite(curZoom) ? Math.max(curZoom, 16) : 16;
        safeFlyTo(mapRef.current, lat, lon, targetZoom, { animate: true });
      });

      // Quick popup preview
      const nextDep = stop.nextDepartures[0];
      const depInfo = nextDep ? `• Próx: ${nextDep.lineCode} (${nextDep.departureTime})` : '';

      marker.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px; font-weight: bold; color: white; background: #0f172a; padding: 4px 8px; border-radius: 6px; border: 1px solid #334155;">
          ${stop.name} <span style="color: #38bdf8;">${stop.formattedDistance}</span>
          <div style="font-size: 10px; color: #94a3b8; font-weight: normal;">${stop.operatorName} ${depInfo}</div>
        </div>
      `, { direction: 'top', offset: [0, -32], className: 'parou-tooltip', opacity: 0.95 });

      marker.addTo(stopsLayerRef.current!);
    });
  }, [filteredStops, selectedStop, favoriteStopIds]);

  // ========================================================
  // RENDER REALTIME VEHICLES ON MAP
  // ========================================================
  useEffect(() => {
    if (!vehiclesLayerRef.current) return;
    vehiclesLayerRef.current.clearLayers();

    vehicles.forEach((v) => {
      const lat = Number(v.latitude);
      const lon = Number(v.longitude);
      if (!isValidCoordinate(lat, lon)) return;

      const isSelected = selectedVehicle?.id === v.id;
      const vColor = v.lineColor || '#0284c7';
      const rotation = v.bearing !== undefined ? `transform: rotate(${v.bearing}deg);` : '';

      const vehicleHtml = `
        <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform hover:scale-125" style="z-index: 60;">
          <div style="background-color: ${vColor}; border: 1.5px solid white;" class="w-6 h-6 rounded-full flex items-center justify-center shadow-lg text-[9px] font-black text-white ${isSelected ? 'ring-2 ring-yellow-400' : ''}">
            ${v.lineCode.slice(0, 3)}
          </div>
          ${v.bearing !== undefined ? `
            <div style="position: absolute; top: -6px; ${rotation}" class="text-[10px] text-white pointer-events-none">
              ▲
            </div>
          ` : ''}
        </div>
      `;

      const vehicleIcon = L.divIcon({
        html: vehicleHtml,
        className: 'parou-vehicle-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([lat, lon], { icon: vehicleIcon });

      marker.on('click', () => {
        setSelectedVehicle(v);
        const curZoom = typeof mapRef.current?.getZoom === 'function' ? mapRef.current.getZoom() : 16;
        const targetZoom = Number.isFinite(curZoom) ? Math.max(curZoom, 16) : 16;
        safeFlyTo(mapRef.current, lat, lon, targetZoom, { animate: true });
      });

      marker.bindTooltip(`
        <div style="font-family: sans-serif; font-size: 11px; font-weight: bold; color: white; background: #0f172a; padding: 4px 8px; border-radius: 6px; border: 1px solid #38bdf8;">
          Veículo Linha ${v.lineCode} • ${v.agencyName}
          <div style="font-size: 10px; color: #94a3b8; font-weight: normal;">${v.speed ? `${v.speed} km/h` : 'Parado'} • ${v.statusLabel}</div>
        </div>
      `, { direction: 'top', offset: [0, -10], className: 'parou-tooltip', opacity: 0.95 });

      marker.addTo(vehiclesLayerRef.current!);
    });
  }, [vehicles, selectedVehicle]);

  // ========================================================
  // RENDER ROUTE POLYLINES ON LEAFLET MAP
  // ========================================================
  useEffect(() => {
    if (!routesLayerRef.current) return;
    routesLayerRef.current.clearLayers();

    if (!selectedRoute || !selectedDestination || !userCoords) return;

    const uLat = Number(userCoords.latitude);
    const uLon = Number(userCoords.longitude);
    const dLat = Number(selectedDestination.latitude);
    const dLon = Number(selectedDestination.longitude);

    if (!isValidCoordinate(uLat, uLon) || !isValidCoordinate(dLat, dLon)) return;

    // Draw direct connecting route line
    const latlngs: L.LatLngTuple[] = [
      [uLat, uLon],
      [dLat, dLon],
    ];

    const polyline = L.polyline(latlngs, {
      color: '#06b6d4',
      weight: 4,
      dashArray: '8, 8',
      opacity: 0.85,
    });
    polyline.addTo(routesLayerRef.current);

    // Destination Pin
    const destIconHtml = `
      <div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
        <div class="w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-xs font-bold animate-bounce">
          🏁
        </div>
      </div>
    `;

    const destIcon = L.divIcon({
      html: destIconHtml,
      className: 'parou-dest-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const destMarker = L.marker([dLat, dLon], { icon: destIcon });
    destMarker.bindPopup(`
      <div style="background: #0f172a; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px; font-family: sans-serif; border: 1px solid #ef4444;">
        <div style="font-weight: bold; color: #f87171;">Destino: ${selectedDestination.title}</div>
        <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">Tempo estimado: ~${selectedRoute.totalDurationMinutes} min</div>
      </div>
    `);
    destMarker.addTo(routesLayerRef.current);

    // Fit bounds to see entire route
    safeFitBounds(mapRef.current, latlngs, { padding: [50, 50] });
  }, [selectedRoute, selectedDestination, userCoords]);

  // Handle "Centrar no Meu Ponto"
  const handleRecenterClick = async () => {
    recenter();
    const fresh = await refreshHighAccuracyLocation();
    if (fresh && mapRef.current && isValidCoordinate(fresh.latitude, fresh.longitude)) {
      safeFlyTo(mapRef.current, fresh.latitude, fresh.longitude, 16, { animate: true, duration: 0.8 });
    } else if (userCoords && mapRef.current && isValidCoordinate(userCoords.latitude, userCoords.longitude)) {
      safeFlyTo(mapRef.current, userCoords.latitude, userCoords.longitude, 16, { animate: true, duration: 0.8 });
    }
  };

  // Debounced Destination Search
  useEffect(() => {
    if (!destinationQuery.trim() || destinationQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingDest(true);
      try {
        const list = await searchDestinations(
          destinationQuery,
          userCoords?.latitude,
          userCoords?.longitude
        );
        setSuggestions(list);
      } catch (err) {
        console.warn('[PERTO] Erro na pesquisa de destino:', err);
      } finally {
        setIsSearchingDest(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [destinationQuery, userCoords]);

  // Handle Destination Select & Route Calculation
  const handleSelectDestination = async (dest: DestinationSuggestion) => {
    setSelectedDestination(dest);
    setDestinationQuery(dest.title);
    setSuggestions([]);
    setSearchFocused(false);

    if (!userCoords) {
      activateLocation(true);
      return;
    }

    setIsCalculatingRoutes(true);
    setCalculatedRoutes([]);
    setSelectedRoute(null);

    try {
      const result = await planTransitRoute(
        userCoords.latitude,
        userCoords.longitude,
        dest.latitude,
        dest.longitude,
        dest.title
      );
      setCalculatedRoutes(result.routes || []);
      if (result.routes && result.routes.length > 0) {
        setSelectedRoute(result.routes[0]);
      }
    } catch (err) {
      console.warn('[PERTO] Erro ao planear rota:', err);
    } finally {
      setIsCalculatingRoutes(false);
    }
  };

  // Clear Destination
  const handleClearDestination = () => {
    setSelectedDestination(null);
    setDestinationQuery('');
    setSuggestions([]);
    setCalculatedRoutes([]);
    setSelectedRoute(null);
  };

  // Handle Initial Destination from Favoritos
  useEffect(() => {
    if (initialDestination && isValidCoordinate(initialDestination.lat, initialDestination.lon)) {
      handleSelectDestination({
        id: `dest_fav_${Date.now()}`,
        title: initialDestination.title,
        subtitle: 'Destino a partir dos favoritos',
        latitude: Number(initialDestination.lat),
        longitude: Number(initialDestination.lon),
        type: 'PLACE',
      });
      onClearInitialDestination?.();
    }
  }, [initialDestination]);

  // Toggle Favorite Stop
  const handleToggleFavorite = (stopId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const stopItem = stops.find((s) => s.id === stopId);
    const isNowFav = toggleFavoriteStopId(stopId, stopItem);
    setFavoriteStopIds((prev) => {
      const next = new Set(prev);
      if (isNowFav) {
        next.add(stopId);
        next.add(`stop-${stopId}`);
      } else {
        next.delete(stopId);
        next.delete(`stop-${stopId}`);
      }
      return next;
    });
    setStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, isFavorite: isNowFav } : s))
    );
  };

  // Helper mode icon renderer
  const renderModeIcon = (rawMode: string, className: string = 'w-4 h-4') => {
    const mode = normalizeTransportMode(rawMode);
    switch (mode) {
      case 'Metro':
        return <Activity className={className} />;
      case 'Comboio':
        return <Train className={className} />;
      case 'Autocarro':
        return <Bus className={className} />;
      case 'Barco':
        return <Ship className={className} />;
      default:
        return <MapPin className={className} />;
    }
  };

  const getModeColor = (rawMode: string) => {
    const mode = normalizeTransportMode(rawMode);
    switch (mode) {
      case 'Autocarro':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'Metro':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'Comboio':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'Barco':
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
      default:
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-8.5rem)] min-h-[580px] flex flex-col lg:flex-row bg-[#080c14] overflow-hidden rounded-2xl border border-slate-800 shadow-2xl">
      
      {/* ======================================================== */}
      {/* LEFT / SIDE PANEL: SEARCH, DEPARTURES & FILTERS */}
      {/* ======================================================== */}
      <aside className={`
        z-30 flex flex-col bg-[#0b0f19]/95 backdrop-blur-xl border-r border-slate-800/80
        transition-all duration-300 ease-in-out
        w-full lg:w-[420px] xl:w-[460px] shrink-0
        ${
          bottomSheetState === 'collapsed'
            ? 'h-14 overflow-hidden'
            : bottomSheetState === 'half'
            ? 'h-[45vh] lg:h-full'
            : 'h-[80vh] lg:h-full'
        }
        absolute lg:relative bottom-0 lg:bottom-auto left-0 right-0 lg:right-auto
        rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none
      `}>
        {/* Mobile Drag / Expand Handle */}
        <div 
          onClick={() => {
            setBottomSheetState((prev) => 
              prev === 'collapsed' ? 'half' : prev === 'half' ? 'full' : 'collapsed'
            );
          }}
          className="lg:hidden flex items-center justify-between px-4 py-2.5 cursor-pointer bg-slate-900/80 border-b border-slate-800"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
            <span className="text-xs font-bold text-white">
              {stops.length} Paragens próximas {userCoords ? `(±${userCoords.accuracy}m)` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[10px]">
              {bottomSheetState === 'collapsed' ? 'Expandir' : bottomSheetState === 'half' ? 'Mais' : 'Fechar'}
            </span>
            {bottomSheetState === 'collapsed' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* 1. Header: PERTO Branding & GPS Telemetry */}
        <div className="p-3 sm:p-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm shadow-cyan-500/20">
                <Compass className="w-4 h-4 animate-spin-slow" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>PERTO</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    GPS Tempo Real
                  </span>
                </h2>
                <p className="text-[11px] text-slate-400">Paragens e partidas à sua volta</p>
              </div>
            </div>

            {/* GPS Telemetry Pill */}
            {userCoords && (
              <div className="flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${userCoords.accuracy <= 30 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span 
                  className={`text-[11px] font-mono font-semibold ${userCoords.accuracy <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}
                  title={userCoords.isManual ? 'Localização manual' : `Precisão do GPS: ±${userCoords.accuracy}m`}
                >
                  {userCoords.isManual ? 'Manual' : `±${userCoords.accuracy}m`}
                </span>
                <button
                  onClick={handleRecenterClick}
                  disabled={isRefreshingGps}
                  className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40 transition-all cursor-pointer"
                  title="Centrar mapa na minha posição GPS"
                >
                  <Crosshair className={`w-3.5 h-3.5 ${isRefreshingGps ? 'animate-spin' : ''}`} />
                </button>
              </div>
            )}
          </div>

          {/* 2. "Para onde?" Destination Search Bar */}
          <div className="mt-3 relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={destinationQuery}
                onChange={(e) => setDestinationQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder="Para onde quer ir? (Morada, estação, paragem...)"
                className="w-full pl-9 pr-9 py-2 bg-slate-950/80 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
              />
              {destinationQuery && (
                <button
                  onClick={handleClearDestination}
                  className="absolute right-2.5 text-slate-400 hover:text-white p-1"
                  aria-label="Limpar pesquisa"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Suggestions Dropdown */}
            {searchFocused && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-800/60 max-h-60 overflow-y-auto">
                {suggestions.map((sug, sIdx) => (
                  <button
                    key={`${sug.id}-${sIdx}`}
                    onClick={() => handleSelectDestination(sug)}
                    className="w-full text-left p-2.5 hover:bg-slate-800/70 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1 rounded bg-slate-800 text-cyan-400">
                        {renderModeIcon(sug.transportMode || 'Lugar', 'w-3.5 h-3.5')}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{sug.title}</div>
                        <div className="text-[10px] text-slate-400 truncate">{sug.subtitle}</div>
                      </div>
                    </div>
                    {sug.distanceFromUserMeters !== undefined && (
                      <span className="text-[10px] font-mono text-cyan-400 shrink-0">
                        {sug.distanceFromUserMeters < 1000
                          ? `${sug.distanceFromUserMeters} m`
                          : `${(sug.distanceFromUserMeters / 1000).toFixed(1)} km`}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. CALCULATED ROUTES PANEL (if destination selected) */}
        {selectedDestination && (
          <div className="p-3 bg-cyan-950/20 border-b border-cyan-800/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wider">
                <CornerDownRight className="w-3.5 h-3.5" />
                <span>Rotas para {selectedDestination.title}</span>
              </span>
              <button
                onClick={handleClearDestination}
                className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            {isCalculatingRoutes ? (
              <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>A calcular melhores itinerários...</span>
              </div>
            ) : calculatedRoutes.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {calculatedRoutes.map((route) => {
                  const isSelected = selectedRoute?.id === route.id;
                  return (
                    <div
                      key={route.id}
                      onClick={() => setSelectedRoute(route)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-900/90 border-cyan-500 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            route.type === 'fastest'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}>
                            {route.badgeLabel}
                          </span>
                          <span className="text-xs font-bold text-white">
                            {route.totalDurationMinutes} min
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {route.departureTime} ➔ {route.arrivalTime}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300 overflow-x-auto py-1">
                        {route.legs.map((leg, idx) => (
                          <React.Fragment key={idx}>
                            {leg.mode === 'WALK' ? (
                              <span className="flex items-center gap-1 text-slate-400 shrink-0">
                                <Footprints className="w-3 h-3" />
                                <span>{leg.durationMinutes}m</span>
                              </span>
                            ) : (
                              <span 
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0 shadow-sm"
                                style={{ backgroundColor: leg.lineColor || '#0072CE' }}
                              >
                                {leg.lineCode}
                              </span>
                            )}
                            {idx < route.legs.length - 1 && (
                              <span className="text-slate-600 shrink-0">›</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-center text-xs text-slate-400">
                Nenhuma rota direta encontrada.
              </div>
            )}
          </div>
        )}

        {/* 4. Filter Chips */}
        <div className="p-2 sm:px-4 border-b border-slate-800/60 bg-slate-900/30 overflow-x-auto flex items-center gap-1.5 scrollbar-none shrink-0">
          <button
            onClick={() => setActiveFilterTab('todos')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all ${
              activeFilterTab === 'todos'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            Todas ({stops.length})
          </button>
          <button
            onClick={() => setActiveFilterTab('autocarro')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1 ${
              activeFilterTab === 'autocarro'
                ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20'
                : 'bg-slate-800/60 text-blue-400 hover:text-white'
            }`}
          >
            <Bus className="w-3 h-3" />
            <span>Autocarro</span>
          </button>
          <button
            onClick={() => setActiveFilterTab('metro')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1 ${
              activeFilterTab === 'metro'
                ? 'bg-yellow-500 text-black font-bold shadow-lg shadow-yellow-500/20'
                : 'bg-slate-800/60 text-yellow-400 hover:text-white'
            }`}
          >
            <Activity className="w-3 h-3" />
            <span>Metro</span>
          </button>
          <button
            onClick={() => setActiveFilterTab('comboio')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1 ${
              activeFilterTab === 'comboio'
                ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800/60 text-emerald-400 hover:text-white'
            }`}
          >
            <Train className="w-3 h-3" />
            <span>Comboio</span>
          </button>
          <button
            onClick={() => setActiveFilterTab('barco')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1 ${
              activeFilterTab === 'barco'
                ? 'bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800/60 text-cyan-400 hover:text-white'
            }`}
          >
            <Ship className="w-3 h-3" />
            <span>Barco</span>
          </button>
          <button
            onClick={() => setActiveFilterTab('favoritos')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0 transition-all flex items-center gap-1 ${
              activeFilterTab === 'favoritos'
                ? 'bg-yellow-500 text-black font-bold'
                : 'bg-slate-800/60 text-slate-400 hover:text-white'
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>Favoritos</span>
          </button>
        </div>

        {/* 5. NEARBY STOPS LIST */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
          {isLoadingNearby ? (
            <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
              <span>A carregar transportes e paragens próximas...</span>
            </div>
          ) : filteredStops.length > 0 ? (
            filteredStops.map((stop, sIdx) => {
              const isSelected = selectedStop?.id === stop.id;
              const hasAlerts = (stop.activeAlerts?.length ?? 0) > 0;
              const isFav = stop.isFavorite || favoriteStopIds.has(stop.id);
              const stopLines = stop.lines || [];
              const stopDeps = stop.nextDepartures || [];

              return (
                <div
                  key={`${stop.id}-${sIdx}`}
                  onClick={() => {
                    setSelectedStop(stop);
                    const lat = Number(stop.latitude ?? (stop as any).lat);
                    const lon = Number(stop.longitude ?? (stop as any).lon);
                    if (isValidCoordinate(lat, lon)) {
                      safeFlyTo(mapRef.current, lat, lon, 16.5, { animate: true });
                    }
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 border-cyan-500 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500'
                      : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg border shrink-0 ${getModeColor(stop.transportMode)}`}>
                        {renderModeIcon(stop.transportMode, 'w-4 h-4')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-white truncate">{stop.name}</h4>
                          {hasAlerts && (
                            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                              <AlertTriangle className="w-2.5 h-2.5" /> Alerta
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {stop.operatorName} • {stop.locality}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={(e) => handleToggleFavorite(stop.id, e)}
                        className={`p-1.5 rounded-lg border transition-all ${
                          isFav
                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                            : 'bg-slate-800/80 text-slate-500 border-slate-700 hover:text-slate-300'
                        }`}
                        title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-yellow-400' : ''}`} />
                      </button>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-cyan-400">
                          {stop.formattedDistance}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-end gap-0.5">
                          <Footprints className="w-2.5 h-2.5" />
                          <span>{stop.walkingMinutes} min</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Lines serving this stop */}
                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {stopLines.slice(0, 4).map((line, lIdx) => (
                        <span
                          key={lIdx}
                          className="px-1.5 py-0.5 text-[10px] font-bold rounded text-white shadow-xs"
                          style={{ backgroundColor: line.color || '#3B82F6' }}
                          title={`${line.code} ➔ ${line.destination}`}
                        >
                          {line.code}
                        </span>
                      ))}
                      {stopLines.length > 4 && (
                        <span className="text-[9px] text-slate-500 font-semibold">
                          +{stopLines.length - 4}
                        </span>
                      )}
                    </div>

                    {/* Next immediate departure */}
                    {stopDeps.length > 0 && (
                      <div className="text-right">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          stopDeps[0].isRealtime
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {stopDeps[0].isRealtime ? '● ' : ''}
                          {stopDeps[0].departureTime}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 space-y-2">
              <Compass className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="font-semibold text-slate-300">Sem paragens registadas nesta área</div>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                Aumente o raio de pesquisa ou ative o GPS para centrar a sua localização.
              </p>
              {gpsStatus !== 'active' && (
                <button
                  onClick={() => activateLocation(true)}
                  className="mt-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
                >
                  Ativar GPS
                </button>
              )}
            </div>
          )}
        </div>

        {/* 6. Contextual Alerts Footer */}
        {(contextualAlerts?.length ?? 0) > 0 && (
          <div className="p-2 sm:p-3 border-t border-slate-800/80 bg-red-950/20 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-400 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{contextualAlerts.length} Alertas Relevantes na Proximidade</span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">
              {contextualAlerts[0]?.operador}: {contextualAlerts[0]?.título}
            </p>
          </div>
        )}
      </aside>

      {/* ======================================================== */}
      {/* RIGHT: REAL LEAFLET INTERACTIVE MAP VIEW */}
      {/* ======================================================== */}
      <main className="relative flex-1 h-full min-h-[360px] bg-[#070b13] overflow-hidden select-none">
        
        {/* LEAFLET MAP DOM CONTAINER */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-full z-0 cursor-grab active:cursor-grabbing"
          style={{ minHeight: '360px' }}
        />

        {/* MAP FLOATING CONTROLS (TOP RIGHT) */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          {/* Centrar no Meu Ponto Button */}
          <button
            onClick={handleRecenterClick}
            className={`p-2.5 rounded-xl border shadow-xl flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
              followMode
                ? 'bg-cyan-500 text-white border-cyan-400 shadow-cyan-500/25 ring-2 ring-cyan-400/40'
                : 'bg-slate-900/90 text-cyan-400 border-slate-700 hover:bg-slate-800 hover:text-white'
            }`}
            title="Centrar na minha localização atual com alta precisão"
          >
            <LocateFixed className={`w-4 h-4 ${isRefreshingGps ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Centrar no Meu Ponto</span>
          </button>

          {/* Zoom Buttons */}
          <div className="bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-xl flex flex-col">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Aproximar (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="h-px bg-slate-800" />
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="p-2.5 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Afastar (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* GPS ACCURACY BADGE & RADIUS FILTER (BOTTOM LEFT OF MAP) */}
        <div className="absolute bottom-6 left-4 z-20 hidden sm:flex items-center gap-2 bg-slate-950/85 backdrop-blur-md border border-slate-800 p-1.5 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 px-2 text-slate-300">
            <span className={`w-2 h-2 rounded-full ${userCoords ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>
              {userCoords
                ? `${userCoords.isManual ? 'Ponto manual' : `GPS: ±${userCoords.accuracy}m`}`
                : 'GPS a inicializar...'}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Radius selector */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-500">Raio:</span>
            {[500, 1000, 2500, 5000].map((r) => (
              <button
                key={r}
                onClick={() => setSelectedRadius(r)}
                className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                  selectedRadius === r
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {r < 1000 ? `${r}m` : `${r / 1000}km`}
              </button>
            ))}
          </div>
        </div>

        {/* SELECTED STOP POPUP OVERLAY */}
        {selectedStop && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 bg-[#0b0f19]/95 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-4 shadow-2xl z-30">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg border ${getModeColor(selectedStop.transportMode)}`}>
                  {renderModeIcon(selectedStop.transportMode, 'w-4 h-4')}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{selectedStop.name}</h3>
                  <p className="text-[11px] text-slate-400">
                    {selectedStop.operatorName} • {selectedStop.formattedDistance} a pé (~{selectedStop.walkingMinutes} min)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStop(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Departures (Rule 4 formatting) */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Próximas Partidas</span>
                <a
                  href={`/debug/stop/${encodeURIComponent(selectedStop.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:underline font-mono lowercase"
                  title="Abrir página de diagnóstico GTFS e tempo real desta paragem"
                >
                  debug/stop ↗
                </a>
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {(() => {
                  const nowSecs = Math.floor(Date.now() / 1000);
                  const activeDepartures = (selectedStop.nextDepartures || []).filter((dep: any) => {
                    // Retira partidas que já passaram
                    if (dep.dep_epoch_secs && dep.dep_epoch_secs < nowSecs - 60) return false;
                    if (typeof dep.etaMinutes === 'number' && dep.etaMinutes < 0) return false;
                    if (typeof dep.departureMinutes === 'number' && dep.departureMinutes < 0) return false;
                    if (typeof dep.countdown_minutes === 'number' && dep.countdown_minutes < 0) return false;
                    return true;
                  });

                  if (activeDepartures.length === 0) {
                    return (
                      <div className="p-3 text-center text-xs text-slate-500 bg-slate-900/40 rounded-lg">
                        sem horário
                      </div>
                    );
                  }

                  return activeDepartures.map((dep: any, dIdx: number) => {
                    const isRt = dep.isRealtime || dep.state === 'TEMPO REAL' || dep.state === 'Tempo Real';
                    const isDelayed = dep.isDelayed || (dep.delay_seconds && dep.delay_seconds > 90);
                    const displayText = dep.displayText || dep.display_text;
                    const timeStr = dep.scheduledTime || dep.departureTime || dep.scheduled_time || 'sem horário';

                    return (
                      <div
                        key={dIdx}
                        className="flex flex-col p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs gap-1.5"
                      >
                        {/* Linha 1: Linha + Destino completo (nunca fica por cima da hora) */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: dep.lineColor || '#0072CE' }}
                          >
                            {dep.lineCode || dep.route_short_name}
                          </span>
                          <span className="text-white font-semibold text-xs leading-snug break-words">
                            {dep.destination || dep.headsign || 'Destino'}
                          </span>
                        </div>

                        {/* Linha 2: Hora e "daqui a X min" */}
                        <div className="flex items-center justify-between pl-7 text-[11px] pt-1 border-t border-slate-800/40">
                          <div className="flex items-center gap-1.5">
                            {isDelayed && dep.scheduledTime && (
                              <span className="line-through text-slate-500 font-normal text-[10px]">
                                {dep.scheduledTime}
                              </span>
                            )}
                            <span className="font-mono font-bold text-slate-200">
                              {timeStr}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              • {isRt ? 'Tempo Real' : 'Programado'}
                            </span>
                          </div>
                          <span
                            className={`font-semibold text-[10px] ${
                              isRt
                                ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.2 rounded'
                                : 'text-slate-400'
                            }`}
                          >
                            {displayText || 'sem horário'}
                          </span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                onClick={() => handleToggleFavorite(selectedStop.id)}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                  selectedStop.isFavorite || favoriteStopIds.has(selectedStop.id)
                    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                }`}
              >
                <Star className="w-3.5 h-3.5 fill-current" />
                <span>{selectedStop.isFavorite || favoriteStopIds.has(selectedStop.id) ? 'Favorita' : 'Favoritar'}</span>
              </button>
              <button
                onClick={() => {
                  setDestinationQuery(selectedStop.name);
                  handleSelectDestination({
                    id: selectedStop.id,
                    title: selectedStop.name,
                    subtitle: selectedStop.operatorName,
                    latitude: selectedStop.latitude,
                    longitude: selectedStop.longitude,
                    type: 'STOP',
                  });
                }}
                className="py-1.5 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Rota até aqui</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SELECTED VEHICLE TELEMETRY OVERLAY */}
        {selectedVehicle && (
          <div className="absolute top-16 right-4 w-80 bg-[#0b0f19]/95 backdrop-blur-2xl border border-cyan-500/40 rounded-2xl p-4 shadow-2xl z-30">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-md"
                  style={{ backgroundColor: selectedVehicle.lineColor || '#0284c7' }}
                >
                  {selectedVehicle.lineCode}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Veículo {selectedVehicle.vehicleId}</h4>
                  <p className="text-[10px] text-slate-400">{selectedVehicle.agencyName}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVehicle(null)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Velocidade:
                </span>
                <span className="font-mono font-bold text-white">
                  {selectedVehicle.speed !== undefined ? `${selectedVehicle.speed} km/h` : 'Parado'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" /> Estado:
                </span>
                <span className="font-semibold text-emerald-400">
                  {selectedVehicle.statusLabel}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Previsão (ETA):
                </span>
                <span className={`font-semibold ${selectedVehicle.hasLiveEta ? 'text-amber-400' : 'text-slate-500'}`}>
                  {selectedVehicle.etaDescription}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* NON-BLOCKING SOFT BANNER IF GPS NOT YET ACTIVE */}
        {gpsStatus !== 'active' && !userCoords && (
          <div className="absolute top-4 left-4 right-16 sm:right-auto sm:max-w-md z-30 bg-slate-900/90 border border-cyan-500/50 rounded-xl p-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-cyan-400 shrink-0 animate-pulse" />
              <div className="text-xs text-slate-300">
                <span className="font-bold text-white block">Ativar Localização GPS</span>
                {gpsError || 'Descubra transportes e paragens à sua volta em tempo real.'}
              </div>
            </div>
            <button
              onClick={() => activateLocation(true)}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg shadow-md transition-colors cursor-pointer shrink-0"
            >
              Ativar
            </button>
          </div>
        )}

      </main>
    </div>
  );
};

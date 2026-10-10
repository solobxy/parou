import React, { useState, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  LocateFixed,
  Loader2,
  Maximize2, 
  Minimize2, 
  X,
  Plus
} from 'lucide-react';
import { Occurrence, SeverityLevel } from '../types';
import { ACCURATE_PORTUGAL_DISTRICTS } from '../data/portugalDistrictsGeo';
import { normalizeGeoString } from '../utils/mapClustering';
import { ClusterDetailModal } from './ClusterDetailModal';
import { PontoMapa, TipoPontoMapa, GrupoCamada, grupoDoPonto } from '../types/mapa';
import { formatarQuando } from '../utils/quando';

// Símbolos (desenhos dos ícones Lucide) para os pontos do mapa
const SVG_ICONES: Record<TipoPontoMapa, string> = {
  incendio: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  acidente: '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>',
  inundacao: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  protecao_civil: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  aviso_tempo: '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  greve: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  perturbacao: '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
  obras: '<path d="M9.3 6.2a4.55 4.55 0 0 0 5.4 0"/><path d="M7.9 10.7c.9.8 2.4 1.3 4.1 1.3s3.2-.5 4.1-1.3"/><path d="M13.9 3.5a1.93 1.93 0 0 0-3.8-.1l-3 10c-.1.2-.1.4-.1.6 0 1.7 2.2 3 5 3s5-1.3 5-3c0-.2 0-.4-.1-.5Z"/><path d="m7.5 12.2-4.7 2.7c-.5.3-.8.7-.8 1.1s.3.8.8 1.1l7.6 4.5c.9.5 2.1.5 3 0l7.6-4.5c.7-.3 1-.7 1-1.1s-.3-.8-.8-1.1l-4.7-2.8"/>',
};

const GRUPOS_CAMADAS: Array<{ id: GrupoCamada; rotulo: string; cor: string }> = [
  { id: 'incendios', rotulo: 'Incêndios', cor: '#D92D20' },
  { id: 'tempo', rotulo: 'Tempo', cor: '#EAB308' },
  { id: 'estrada', rotulo: 'Estrada', cor: '#FF6B1A' },
  { id: 'transportes', rotulo: 'Transportes', cor: '#111111' },
  { id: 'comunidade', rotulo: 'Comunidade', cor: '#6B6B6B' },
];

function escaparHtml(t: string): string {
  return String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export const PORTUGAL_DISTRICT_LOCATIONS: Record<string, { lat: number; lon: number; code: string; name: string }> = {
  viseu: { lat: 40.6575, lon: -7.9143, code: 'VIS', name: 'Viseu' },
  santarem: { lat: 39.2369, lon: -8.6855, code: 'SAN', name: 'Santarém' },
  evora: { lat: 38.5714, lon: -7.9070, code: 'EVO', name: 'Évora' },
  lisboa: { lat: 38.7223, lon: -9.1393, code: 'LIS', name: 'Lisboa' },
  beja: { lat: 38.0151, lon: -7.8632, code: 'BEJ', name: 'Beja' },
  faro: { lat: 37.0194, lon: -7.9322, code: 'FAR', name: 'Faro' },
  setubal: { lat: 38.5244, lon: -8.8882, code: 'SET', name: 'Setúbal' },
  portalegre: { lat: 39.2938, lon: -7.4312, code: 'PTG', name: 'Portalegre' },
  castelobranco: { lat: 39.8222, lon: -7.4932, code: 'CTB', name: 'Castelo Branco' },
  guarda: { lat: 40.5373, lon: -7.2658, code: 'GUA', name: 'Guarda' },
  coimbra: { lat: 40.2033, lon: -8.4103, code: 'COI', name: 'Coimbra' },
  aveiro: { lat: 40.6405, lon: -8.6538, code: 'AVE', name: 'Aveiro' },
  leiria: { lat: 39.7438, lon: -8.8078, code: 'LEI', name: 'Leiria' },
  porto: { lat: 41.1579, lon: -8.6291, code: 'POR', name: 'Porto' },
  braga: { lat: 41.5454, lon: -8.4265, code: 'BRA', name: 'Braga' },
  vianadocastelo: { lat: 41.6932, lon: -8.8329, code: 'VCT', name: 'Viana do Castelo' },
  vilareal: { lat: 41.3006, lon: -7.7441, code: 'VRL', name: 'Vila Real' },
  braganca: { lat: 41.8058, lon: -6.7572, code: 'BGC', name: 'Bragança' },
  madeira: { lat: 32.6500, lon: -16.9089, code: 'MAD', name: 'Madeira' },
  acores: { lat: 37.7412, lon: -25.6756, code: 'ACO', name: 'Açores' },
};

interface PortugalMapProps {
  selectedDistrict: string | null;
  onSelectDistrict: (districtName: string | null) => void;
  activeViewMode?: 'cidades' | 'concelhos' | 'distritos';
  onViewModeChange?: (mode: 'cidades' | 'concelhos' | 'distritos') => void;
  districtCounts?: Record<string, number>;
  occurrences?: Occurrence[];
  onSelectOccurrence?: (occurrence: Occurrence) => void;
  className?: string;
  /** Botão "Reportar" encaixado no canto do mapa */
  onReport?: () => void;
  /** O que está a acontecer agora (incêndios, avisos, perturbações), com posição */
  pontos?: PontoMapa[];
  /** Hora dos dados de incêndios (Fogos.pt), para a atribuição */
  incendiosAtualizado?: string | null;
}

export const PortugalMap: React.FC<PortugalMapProps> = ({
  selectedDistrict,
  onSelectDistrict,
  activeViewMode = 'cidades',
  districtCounts,
  occurrences = [],
  onSelectOccurrence,
  className = '',
  onReport,
  pontos = [],
  incendiosAtualizado,
}) => {
  // Camadas visíveis (chips por cima do mapa)
  const [camadasOcultas, setCamadasOcultas] = useState<Set<GrupoCamada>>(new Set());
  const pontosMarkersRef = useRef<L.Marker[]>([]);
  const euMarcadorRef = useRef<L.Marker | null>(null);
  const [aLocalizar, setALocalizar] = useState(false);
  const [erroLocalizar, setErroLocalizar] = useState<string | null>(null);
  const contagemCamadas = useMemo(() => {
    const c: Record<GrupoCamada, number> = { incendios: 0, tempo: 0, estrada: 0, transportes: 0, comunidade: occurrences.length };
    for (const p of pontos) c[grupoDoPonto(p.tipo)] += 1;
    return c;
  }, [pontos, occurrences]);
  const alternarCamada = (g: GrupoCamada) =>
    setCamadasOcultas((atual) => {
      const n = new Set(atual);
      if (n.has(g)) n.delete(g); else n.add(g);
      return n;
    });
  const [activeArchipelago, setActiveArchipelago] = useState<'continental' | 'madeira' | 'acores'>('continental');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState<number>(6);

  const [activeModalDistrict, setActiveModalDistrict] = useState<{
    id: string;
    name: string;
    occurrences: Occurrence[];
    totalCount: number;
    graveCount: number;
    moderadaCount: number;
    infoCount: number;
    dominantSeverity: SeverityLevel;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const districtMarkersRef = useRef<L.Marker[]>([]);
  const occurrenceMarkersRef = useRef<L.Marker[]>([]);

  // Agrupamento de ocorrências por distrito
  const districtStats = useMemo(() => {
    const stats: Record<string, {
      id: string;
      name: string;
      code: string;
      totalCount: number;
      graveCount: number;
      moderadaCount: number;
      infoCount: number;
      dominantSeverity: SeverityLevel;
      occurrences: Occurrence[];
      lat: number;
      lon: number;
    }> = {};

    ACCURATE_PORTUGAL_DISTRICTS.forEach((d) => {
      const loc = PORTUGAL_DISTRICT_LOCATIONS[d.id] || {
        lat: 39.5,
        lon: -8.0,
        code: d.code || d.id.slice(0, 3).toUpperCase(),
        name: d.name,
      };

      stats[d.id] = {
        id: d.id,
        name: d.name,
        code: loc.code,
        totalCount: 0,
        graveCount: 0,
        moderadaCount: 0,
        infoCount: 0,
        dominantSeverity: 'Informação',
        occurrences: [],
        lat: loc.lat,
        lon: loc.lon,
      };
    });

    occurrences.forEach((occ) => {
      const normalizedOccDistrict = normalizeGeoString(occ.district || '');
      const matched = ACCURATE_PORTUGAL_DISTRICTS.find(
        (d) => normalizeGeoString(d.name) === normalizedOccDistrict || d.id === normalizedOccDistrict
      );

      if (matched && stats[matched.id]) {
        stats[matched.id].totalCount += 1;
        stats[matched.id].occurrences.push(occ);

        if (occ.severity === 'Grave') {
          stats[matched.id].graveCount += 1;
          stats[matched.id].dominantSeverity = 'Grave';
        } else if (occ.severity === 'Moderada') {
          stats[matched.id].moderadaCount += 1;
          if (stats[matched.id].dominantSeverity !== 'Grave') {
            stats[matched.id].dominantSeverity = 'Moderada';
          }
        } else {
          stats[matched.id].infoCount += 1;
        }
      }
    });

    if (districtCounts) {
      Object.entries(districtCounts).forEach(([name, count]) => {
        const matched = ACCURATE_PORTUGAL_DISTRICTS.find(
          (d) => normalizeGeoString(d.name) === normalizeGeoString(name)
        );
        if (matched && stats[matched.id]) {
          stats[matched.id].totalCount = Math.max(stats[matched.id].totalCount, count);
        }
      });
    }

    return stats;
  }, [occurrences, districtCounts]);

  // Inicializar Leaflet com Mosaicos Raster OpenStreetMap
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.5, -8.2245],
      zoom: 6,
      minZoom: 4,
      maxZoom: 19,
      zoomControl: false,
      attributionControl: false,
    });

    // Mosaicos raster do OpenStreetMap (maxZoom 19)
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

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    mapRef.current = map;

    // ResizeObserver para garantir redimensionamento fluido
    let ro: ResizeObserver | null = null;
    if (containerRef.current) {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(containerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      districtMarkersRef.current.forEach((m) => m.remove());
      districtMarkersRef.current = [];
      occurrenceMarkersRef.current.forEach((m) => m.remove());
      occurrenceMarkersRef.current = [];
      pontosMarkersRef.current.forEach((m) => m.remove());
      pontosMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Mudar de Arquipélago
  const handleArchipelagoChange = (arch: 'continental' | 'madeira' | 'acores') => {
    setActiveArchipelago(arch);
    onSelectDistrict(null);
    if (!mapRef.current) return;

    if (arch === 'continental') {
      mapRef.current.flyTo([39.5, -8.2245], 6.3);
    } else if (arch === 'madeira') {
      mapRef.current.flyTo([32.75, -16.95], 9.5);
    } else if (arch === 'acores') {
      mapRef.current.flyTo([37.74, -25.67], 7.8);
    }
  };

  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  // Centrar na minha posição (com o ponto azul onde estou)
  const centrarEmMim = () => {
    const map = mapRef.current;
    if (!map || aLocalizar) return;
    if (!('geolocation' in navigator)) { setErroLocalizar('Este browser não dá a localização.'); return; }
    setALocalizar(true);
    setErroLocalizar(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setALocalizar(false);
        const { latitude, longitude } = pos.coords;
        euMarcadorRef.current?.remove();
        euMarcadorRef.current = L.marker([latitude, longitude], {
          interactive: false,
          zIndexOffset: 2000,
          icon: L.divIcon({
            className: 'parou-eu',
            html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 0 0 6px rgba(37,99,235,.2),0 2px 6px rgba(0,0,0,.3)"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(map);
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 12), { duration: 0.8 });
      },
      (err) => {
        setALocalizar(false);
        setErroLocalizar(err.code === 1 ? 'Permite a localização nas definições do browser.' : 'Não foi possível obter a tua posição.');
        setTimeout(() => setErroLocalizar(null), 4000);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60_000 },
    );
  };

  const handleResetZoom = () => {
    onSelectDistrict(null);
    handleArchipelagoChange('continental');
  };

  // Voar até ao distrito selecionado externamente
  useEffect(() => {
    if (!mapRef.current || !selectedDistrict) return;
    const normalized = normalizeGeoString(selectedDistrict);
    const matched = Object.values(PORTUGAL_DISTRICT_LOCATIONS).find(
      (loc) => normalizeGeoString(loc.name) === normalized
    );
    if (matched) {
      mapRef.current.flyTo([matched.lat, matched.lon], 9);
    }
  }, [selectedDistrict]);

  // Renderizar Marcadores de Distritos e Ocorrências
  useEffect(() => {
    if (!mapRef.current) return;

    // Limpar marcadores anteriores
    districtMarkersRef.current.forEach((m) => m.remove());
    districtMarkersRef.current = [];
    occurrenceMarkersRef.current.forEach((m) => m.remove());
    occurrenceMarkersRef.current = [];

    const isZoomedIn = currentZoom >= 8.2;
    const showDistricts = activeViewMode === 'distritos' && !isZoomedIn;

    // 1. Marcadores de Distrito (em zoom afastado ou modo distritos)
    if (showDistricts) {
      Object.values(districtStats).forEach((stats) => {
        const isSelected = selectedDistrict?.toLowerCase() === stats.name.toLowerCase();
        const hasGrave = stats.graveCount > 0;
        const hasMod = stats.moderadaCount > 0;
        const hasAlerts = stats.totalCount > 0;

        let badgeBg = '#FFFFFF';
        let badgeText = '#111111';
        let borderClass = 'border-[#111111]';

        if (hasGrave) {
          badgeBg = '#D92D20';
          badgeText = '#FFFFFF';
          borderClass = 'border-[#D92D20] ring-4 ring-[#D92D20]/20';
        } else if (hasMod) {
          badgeBg = '#FF6B1A';
          badgeText = '#111111';
          borderClass = 'border-[#FF6B1A] ring-2 ring-[#FF6B1A]/20';
        } else if (hasAlerts) {
          badgeBg = '#111111';
          badgeText = '#FFFFFF';
          borderClass = 'border-[#111111]';
        }

        const icon = L.divIcon({
          className: 'custom-district-badge-icon',
          html: `
            <div style="background-color: ${badgeBg}; color: ${badgeText};" class="px-2 py-1 rounded-[6px] border ${borderClass} shadow-md flex items-center gap-1.5 font-['Barlow_Condensed'] font-bold text-xs min-w-[38px] justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 ${isSelected ? 'ring-2 ring-black scale-110' : ''}">
              <span>${stats.code}</span>
              ${stats.totalCount > 0 ? `<span class="px-1 py-0.2 rounded bg-black/15 text-[11px] leading-tight tabular-nums">${stats.totalCount}</span>` : ''}
            </div>
          `,
          iconSize: [44, 26],
          iconAnchor: [22, 13],
        });

        const marker = L.marker([stats.lat, stats.lon], { icon }).addTo(mapRef.current!);
        marker.on('click', () => {
          onSelectDistrict(stats.name);
          mapRef.current?.flyTo([stats.lat, stats.lon], 9);

          if (stats.occurrences.length > 0) {
            setActiveModalDistrict({
              id: stats.id,
              name: stats.name,
              occurrences: stats.occurrences,
              totalCount: stats.totalCount,
              graveCount: stats.graveCount,
              moderadaCount: stats.moderadaCount,
              infoCount: stats.infoCount,
              dominantSeverity: stats.dominantSeverity,
            });
          }
        });

        districtMarkersRef.current.push(marker);
      });
    }

    // 2. Marcadores Individuais de Ocorrências (em zoom aproximado ou modos concelhos/cidades)
    if ((!showDistricts || isZoomedIn) && !camadasOcultas.has('comunidade')) {
      occurrences.forEach((occ, idx) => {
        const occDistrictNorm = normalizeGeoString(occ.district || '');
        const matchedLoc = Object.values(PORTUGAL_DISTRICT_LOCATIONS).find(
          (loc) => normalizeGeoString(loc.name) === occDistrictNorm
        ) || { lat: 39.5, lon: -8.0 };

        // Deslocamento determinístico para espalhar os alertas dentro da área
        const hash = (occ.id || `occ-${idx}`).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const angle = (hash % 360) * (Math.PI / 180);
        const radius = 0.04 + ((hash % 100) / 100) * 0.12;

        const occLat = matchedLoc.lat + Math.sin(angle) * radius;
        const occLon = matchedLoc.lon + Math.cos(angle) * radius * 1.2;

        const isGrave = occ.severity === 'Grave';
        const isMod = occ.severity === 'Moderada';
        const pinColor = isGrave ? '#D92D20' : isMod ? '#FF6B1A' : '#111111';
        const pinTextColor = isGrave || !isMod ? '#FFFFFF' : '#111111';

        const icon = L.divIcon({
          className: 'custom-occurrence-pin-icon',
          html: `
            <div class="relative flex items-center justify-center cursor-pointer transition-transform hover:scale-125">
              ${isGrave ? '<div class="w-7 h-7 rounded-full bg-[#D92D20]/30 animate-ping absolute"></div>' : ''}
              <div style="background-color: ${pinColor}; color: ${pinTextColor}; border: 2px solid #FFFFFF; box-shadow: 0 3px 8px rgba(0,0,0,0.3);" class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold">
                ${isGrave ? '!' : isMod ? '▲' : '•'}
              </div>
            </div>
          `,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([occLat, occLon], { icon }).addTo(mapRef.current!);
        marker.on('click', () => {
          if (onSelectOccurrence) {
            onSelectOccurrence(occ);
          }
        });

        occurrenceMarkersRef.current.push(marker);
      });
    }
  }, [occurrences, districtStats, currentZoom, activeViewMode, selectedDistrict, onSelectDistrict, onSelectOccurrence, camadasOcultas]);

  // Pontos atuais (incêndios, avisos, perturbações) com símbolo e janela de detalhe
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    pontosMarkersRef.current.forEach((m) => m.remove());
    pontosMarkersRef.current = [];
    const visiveis = pontos
      .filter((p) => !camadasOcultas.has(grupoDoPonto(p.tipo)) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
      // Os mais graves por cima
      .sort((a, b) => (a.gravidade === 'Grave' ? 1 : 0) - (b.gravidade === 'Grave' ? 1 : 0));

    // Pontos que ficariam em cima uns dos outros juntam-se numa bolha com o número (só com o mapa
    // afastado; ao aproximar separam-se sozinhos). Toca na bolha para aproximar.
    const RAIO_PX = 36;
    const ZOOM_SEM_AGRUPAR = 13;
    type Grupo = { pontos: PontoMapa[]; x: number; y: number };
    const grupos: Grupo[] = [];
    for (const p of visiveis) {
      if (currentZoom < ZOOM_SEM_AGRUPAR) {
        const pt = map.project([p.lat, p.lon], currentZoom);
        const perto = grupos.find((g) => Math.hypot(g.x - pt.x, g.y - pt.y) < RAIO_PX);
        if (perto) {
          perto.pontos.push(p);
          continue;
        }
        grupos.push({ pontos: [p], x: pt.x, y: pt.y });
      } else {
        grupos.push({ pontos: [p], x: 0, y: 0 });
      }
    }

    for (const g of grupos) {
      if (g.pontos.length > 1) {
        const n = g.pontos.length;
        const grave = g.pontos.some((q) => q.gravidade === 'Grave');
        const lat = g.pontos.reduce((s, q) => s + q.lat, 0) / n;
        const lon = g.pontos.reduce((s, q) => s + q.lon, 0) / n;
        const tam = n >= 100 ? 46 : n >= 10 ? 42 : 38;
        const icone = L.divIcon({
          className: 'parou-ponto-mapa',
          html: `<div style="width:${tam}px;height:${tam}px;border-radius:9999px;background:${grave ? '#D92D20' : '#111111'};border:3px solid #FFFFFF;box-shadow:0 3px 10px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-family:'Barlow Condensed',Barlow,sans-serif;font-weight:700;font-size:${n >= 100 ? 15 : 18}px;line-height:1;cursor:pointer">${n}</div>`,
          iconSize: [tam, tam],
          iconAnchor: [tam / 2, tam / 2],
        });
        const bolha = L.marker([lat, lon], {
          icon: icone,
          zIndexOffset: grave ? 1500 : 800,
          title: `${n} ocorrências juntas. Toca para aproximar.`,
        }).addTo(map);
        bolha.on('click', () => {
          const limites = L.latLngBounds(g.pontos.map((q) => [q.lat, q.lon] as [number, number]));
          const zoomAtual = map.getZoom();
          // Aproxima sempre pelo menos um nível, para as ocorrências se separarem
          if (map.getBoundsZoom(limites, false, L.point(96, 96)) > zoomAtual) {
            map.fitBounds(limites, { padding: [48, 48], maxZoom: 14 });
          } else {
            map.setView(limites.getCenter(), Math.min(zoomAtual + 2, 14));
          }
        });
        pontosMarkersRef.current.push(bolha);
        continue;
      }
      const p = g.pontos[0];
      const claro = p.cor === '#EAB308' || p.cor === '#F59E0B';
      const traco = claro ? '#111111' : '#FFFFFF';
      const pulsar = p.tipo === 'incendio' && p.gravidade === 'Grave';
      const tamanho = p.gravidade === 'Grave' ? 34 : 30;
      const icon = L.divIcon({
        className: 'parou-ponto-mapa',
        html: `
          <div style="position:relative;width:${tamanho}px;height:${tamanho}px;display:flex;align-items:center;justify-content:center;cursor:pointer">
            ${pulsar ? `<div class="animate-ping" style="position:absolute;inset:0;border-radius:9999px;background:${p.cor};opacity:.35"></div>` : ''}
            <div style="position:relative;width:${tamanho}px;height:${tamanho}px;border-radius:9999px;background:${p.cor};border:2px solid #FFFFFF;box-shadow:0 3px 10px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">
              <svg xmlns="http://www.w3.org/2000/svg" width="${tamanho - 14}" height="${tamanho - 14}" viewBox="0 0 24 24" fill="none" stroke="${traco}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${SVG_ICONES[p.tipo] || SVG_ICONES.protecao_civil}</svg>
            </div>
          </div>`,
        iconSize: [tamanho, tamanho],
        iconAnchor: [tamanho / 2, tamanho / 2],
        popupAnchor: [0, -tamanho / 2],
      });
      const marker = L.marker([p.lat, p.lon], { icon, zIndexOffset: p.gravidade === 'Grave' ? 1000 : 500 }).addTo(map);
      const ligacao = p.url
        ? `<a href="${escaparHtml(p.url)}" target="_blank" rel="noopener noreferrer" style="color:#111111;font-weight:600;text-decoration:underline">${escaparHtml(p.fonte)}</a>`
        : escaparHtml(p.fonte);
      marker.bindPopup(
        `<div style="font-family:Barlow,system-ui,sans-serif;min-width:200px;max-width:260px">
          <div style="font-size:14px;font-weight:700;color:#111111;line-height:1.25">${escaparHtml(p.titulo)}</div>
          ${p.subtitulo ? `<div style="font-size:12.5px;color:#4B4B4B;margin-top:4px;line-height:1.35">${escaparHtml(p.subtitulo)}</div>` : ''}
          ${p.inicio && formatarQuando(p.inicio) ? `<div style="font-size:12px;color:#111111;margin-top:6px"><strong>${p.tipo === 'aviso_tempo' ? 'Desde' : 'Início'}:</strong> ${escaparHtml(formatarQuando(p.inicio))}${p.fim && formatarQuando(p.fim) ? ` · <strong>até</strong> ${escaparHtml(formatarQuando(p.fim))}` : ''}</div>` : ''}
          <div style="font-size:11.5px;color:#6B6B6B;margin-top:6px">Fonte: ${ligacao}</div>
        </div>`,
        { closeButton: true, autoPanPadding: [24, 24] },
      );
      pontosMarkersRef.current.push(marker);
    }
  }, [pontos, camadasOcultas, currentZoom]);

  // Atribuição do Fogos.pt junto ao mapa quando há incêndios
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.attributionControl) return;
    const texto = '<a href="https://fogos.pt" target="_blank" rel="noopener noreferrer">Fogos.pt</a> (ANEPC)';
    const tem = pontos.some((p) => p.fonte.startsWith('Fogos.pt'));
    if (tem) map.attributionControl.addAttribution(texto); else map.attributionControl.removeAttribution(texto);
  }, [pontos]);

  const totalOccurrencesCount = occurrences.length + pontos.length;

  return (
    <>
      <div 
        className={`bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] flex flex-col relative isolate overflow-hidden transition-all duration-300 ${
          isFullscreen 
            ? 'fixed inset-0 z-50 rounded-none w-screen h-screen' 
            : 'h-[460px] sm:h-[520px] md:h-[580px] w-full'
        } ${className}`}
      >
        {/* Top Header & Toolbar */}
        <div className="flex flex-row flex-wrap items-center justify-between p-2 sm:p-3 border-b border-[#E6E6E3] bg-[#FFFFFF] gap-x-2 gap-y-1.5 z-10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* No telemóvel o título fica só para leitores de ecrã: poupa uma linha */}
            <span className="sr-only sm:not-sr-only font-['Barlow_Condensed'] text-base leading-tight font-bold text-[#111111]">
              Mapa de Ocorrências
            </span>
            <span className="px-2 py-0.5 rounded-[4px] bg-[#F4F4F2] text-[#111111] font-['Barlow_Condensed'] text-xs font-bold tabular-nums">
              {totalOccurrencesCount} {totalOccurrencesCount === 1 ? 'ativa' : 'ativas'}
            </span>
            {selectedDistrict && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-[#FF6B1A] text-[#111111] rounded-[4px] text-xs font-bold brand-chamfer">
                <span>{selectedDistrict}</span>
                <button 
                  onClick={() => onSelectDistrict(null)}
                  className="hover:opacity-75 cursor-pointer ml-0.5"
                  aria-label="Limpar distrito selecionado"
                >
                  <X className="w-3 h-3 stroke-[2]" />
                </button>
              </span>
            )}
          </div>

          {/* Mode & Region Controls */}
          <div className="flex items-center gap-1.5 justify-end">
            {/* Archipelago Switcher */}
            <div className="flex items-center bg-[#F4F4F2] rounded-[6px] p-0.5 border border-[#E6E6E3]">
              {(['continental', 'madeira', 'acores'] as const).map((arch) => (
                <button
                  key={arch}
                  onClick={() => handleArchipelagoChange(arch)}
                  className={`px-1.5 sm:px-2 py-1 rounded-[4px] text-xs font-medium capitalize transition-colors cursor-pointer min-h-[32px] ${
                    activeArchipelago === arch
                      ? 'bg-[#FFFFFF] text-[#111111] font-bold shadow-xs'
                      : 'text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  {arch === 'acores' ? 'Açores' : arch}
                </button>
              ))}
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => {
                setIsFullscreen(!isFullscreen);
                setTimeout(() => mapRef.current?.invalidateSize(), 150);
              }}
              className="p-1.5 rounded-[6px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#111111] transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
              title={isFullscreen ? 'Sair de ecrã inteiro' : 'Ecrã inteiro'}
              aria-label="Ecrã inteiro"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 stroke-[2]" /> : <Maximize2 className="w-3.5 h-3.5 stroke-[2]" />}
            </button>
          </div>
        </div>

        {/* Map Container (OpenStreetMap Raster Tiles filtrados em grayscale neutro) */}
        <div className="relative flex-1 w-full h-full bg-[#F4F4F2] overflow-hidden">
          <div 
            ref={containerRef}
            className="absolute inset-0 w-full h-full z-0"
          />

          {/* Camadas: o que mostrar no mapa (toca para esconder/mostrar) */}
          <div className="absolute top-3 left-3 right-16 z-20 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {GRUPOS_CAMADAS.map((g) => {
              const n = contagemCamadas[g.id];
              const oculto = camadasOcultas.has(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => alternarCamada(g.id)}
                  className={`shrink-0 h-8 pl-2 pr-2.5 rounded-full border text-[12px] font-semibold flex items-center gap-1.5 shadow-sm transition-opacity cursor-pointer ${
                    oculto ? 'bg-[#FFFFFF]/80 border-[#E6E6E3] text-[#6B6B6B] opacity-60' : 'bg-[#FFFFFF] border-[#E6E6E3] text-[#111111]'
                  }`}
                  aria-pressed={!oculto}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.cor }} />
                  {g.rotulo}
                  <span className="font-['Barlow_Condensed'] text-[12px] tabular-nums text-[#6B6B6B]">{n}</span>
                </button>
              );
            })}
          </div>

          {/* Map Floating Controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 shadow-sm">
            <button
              onClick={centrarEmMim}
              className="w-10 h-10 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] hover:bg-[#F4F4F2] flex items-center justify-center cursor-pointer transition-colors"
              title="Centrar na minha posição"
              aria-label="Centrar na minha posição"
              data-teste="mapa-centrar-em-mim"
            >
              {aLocalizar ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-[18px] h-[18px] stroke-[2.25]" />}
            </button>
            <button
              onClick={handleZoomIn}
              className="w-8 h-8 rounded-[6px] bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] hover:bg-[#F4F4F2] flex items-center justify-center cursor-pointer transition-colors"
              title="Aproximar"
              aria-label="Aproximar"
            >
              <ZoomIn className="w-4 h-4 stroke-[2]" />
            </button>
            <button
              onClick={handleZoomOut}
              className="w-8 h-8 rounded-[6px] bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] hover:bg-[#F4F4F2] flex items-center justify-center cursor-pointer transition-colors"
              title="Afastar"
              aria-label="Afastar"
            >
              <ZoomOut className="w-4 h-4 stroke-[2]" />
            </button>
            <button
              onClick={handleResetZoom}
              className="w-8 h-8 rounded-[6px] bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] hover:bg-[#F4F4F2] flex items-center justify-center cursor-pointer transition-colors"
              title="Centrar Portugal"
              aria-label="Centrar Portugal"
            >
              <RotateCcw className="w-3.5 h-3.5 stroke-[2]" />
            </button>
          </div>

          {erroLocalizar && (
            <div role="status" className="absolute top-3 left-3 right-16 z-30 rounded-[8px] bg-[#111111] text-[#FFFFFF] text-[13px] px-3 py-2 shadow-md">
              {erroLocalizar}
            </div>
          )}

          {/* Reportar ocorrência — encaixado no canto do mapa */}
          {onReport && (
            <button
              onClick={onReport}
              className="absolute bottom-7 right-3 z-20 h-11 pl-3 pr-4 rounded-full bg-[#FF6B1A] text-[#111111] font-bold text-[13px] flex items-center gap-1.5 shadow-[0_6px_16px_rgba(255,107,26,0.35)] active:scale-[0.97] transition-transform cursor-pointer"
              aria-label="Reportar ocorrência"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Reportar</span>
            </button>
          )}

          {/* Quick Legend at Bottom-Left */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-[#E6E6E3] rounded-[6px] px-2.5 py-1.5 flex items-center gap-3 text-[11px] shadow-sm select-none pointer-events-none">
            <div className="flex items-center gap-1 font-['Barlow_Condensed'] font-semibold text-[#111111]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#D92D20]"></div>
              <span>Grave</span>
            </div>
            <div className="flex items-center gap-1 font-['Barlow_Condensed'] font-semibold text-[#111111]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6B1A]"></div>
              <span>Moderada</span>
            </div>
            <div className="flex items-center gap-1 font-['Barlow_Condensed'] font-semibold text-[#111111]">
              <div className="w-2.5 h-2.5 rounded-full bg-[#111111]"></div>
              <span>Info</span>
            </div>
          </div>
        </div>
      </div>

      {/* District Detail Modal */}
      {activeModalDistrict && (
        <ClusterDetailModal
          onClose={() => setActiveModalDistrict(null)}
          cluster={{
            id: activeModalDistrict.id,
            name: activeModalDistrict.name,
            district: activeModalDistrict.name,
            x: 0,
            y: 0,
            totalCount: activeModalDistrict.totalCount,
            dominantSeverity: activeModalDistrict.dominantSeverity,
            graveCount: activeModalDistrict.graveCount,
            moderadaCount: activeModalDistrict.moderadaCount,
            infoCount: activeModalDistrict.infoCount,
            occurrences: activeModalDistrict.occurrences,
            densityScore: 0,
          }}
          onSelectOccurrence={(occ) => {
            setActiveModalDistrict(null);
            if (onSelectOccurrence) onSelectOccurrence(occ);
          }}
        />
      )}
    </>
  );
};

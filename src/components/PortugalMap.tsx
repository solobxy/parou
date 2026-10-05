import React, { useState, useMemo, useRef } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Radio, 
  MapPin, 
  AlertTriangle,
  Info,
  CheckCircle2,
  Flame,
  Layers
} from 'lucide-react';
import { Occurrence, SeverityLevel } from '../types';
import { ACCURATE_PORTUGAL_DISTRICTS, DistrictPolygon } from '../data/portugalDistrictsGeo';
import { normalizeGeoString } from '../utils/mapClustering';
import { ClusterDetailModal } from './ClusterDetailModal';
import { FavoriteButton } from './FavoriteButton';

interface PortugalMapProps {
  selectedDistrict: string | null;
  onSelectDistrict: (districtName: string | null) => void;
  activeViewMode: 'cidades' | 'concelhos' | 'distritos';
  onViewModeChange: (mode: 'cidades' | 'concelhos' | 'distritos') => void;
  districtCounts?: Record<string, number>;
  occurrences?: Occurrence[];
  onSelectOccurrence?: (occurrence: Occurrence) => void;
  className?: string;
}

export const PortugalMap: React.FC<PortugalMapProps> = ({
  selectedDistrict,
  onSelectDistrict,
  activeViewMode,
  onViewModeChange,
  districtCounts,
  occurrences = [],
  onSelectOccurrence,
  className = '',
}) => {
  // Navigation & Zoom / Pan State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [activeArchipelago, setActiveArchipelago] = useState<'continental' | 'madeira' | 'acores' | 'tudo'>('continental');
  
  // Interactive layers & modes
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredDistrictId, setHoveredDistrictId] = useState<string | null>(null);
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

  // Touch pinch-to-zoom inside the map canvas
  const touchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute occurrences & stats per district
  const districtStats = useMemo(() => {
    const stats: Record<string, {
      totalCount: number;
      graveCount: number;
      moderadaCount: number;
      infoCount: number;
      dominantSeverity: SeverityLevel;
      occurrences: Occurrence[];
    }> = {};

    for (const dist of ACCURATE_PORTUGAL_DISTRICTS) {
      const normDistName = normalizeGeoString(dist.name);
      const normDistId = normalizeGeoString(dist.id);

      const matching = occurrences.filter((occ) => {
        if (occ.status === 'Ocultada') return false;
        const occDist = normalizeGeoString(occ.district || '');
        const occConcelho = normalizeGeoString(occ.concelho || '');
        const occLoc = normalizeGeoString(occ.locationDetails || '');
        return (
          occDist === normDistName ||
          occDist === normDistId ||
          occConcelho === normDistName ||
          occLoc.includes(normDistName)
        );
      });

      // Use explicit districtCounts from backend or matching occurrences count
      let count = matching.length;
      if (districtCounts && districtCounts[normDistName] !== undefined) {
        count = Math.max(districtCounts[normDistName], count);
      }

      const graveCount = matching.filter((o) => o.severity === 'Grave').length;
      const moderadaCount = matching.filter((o) => o.severity === 'Moderada').length;
      const infoCount = matching.filter((o) => o.severity === 'Informação').length;

      let dominantSeverity: SeverityLevel = 'Informação';
      if (graveCount > 0) dominantSeverity = 'Grave';
      else if (moderadaCount > 0) dominantSeverity = 'Moderada';

      stats[dist.id] = {
        totalCount: count,
        graveCount,
        moderadaCount,
        infoCount,
        dominantSeverity,
        occurrences: matching,
      };
    }

    return stats;
  }, [occurrences, districtCounts]);

  // Overall counts
  const totalReports = useMemo(() => {
    return occurrences.filter((o) => o.status !== 'Ocultada').length;
  }, [occurrences]);

  const severeReports = useMemo(() => {
    return occurrences.filter((o) => o.status !== 'Ocultada' && o.severity === 'Grave').length;
  }, [occurrences]);

  // Dynamic geographic bounds (maxBounds) to keep Portugal always in the screen
  // Prevents dragging into the void on mobile, tablet, and PC
  const getMaxBounds = (zoom: number) => {
    const el = containerRef.current;
    const w = el ? el.clientWidth : 500;
    const h = el ? el.clientHeight : 550;

    // Base boundary allowance at zoom = 1 (approx 18% of dimension)
    // Ensures Portugal cannot be dragged out of sight
    const baseMarginX = w * 0.18;
    const baseMarginY = h * 0.20;

    // As zoom expands up to 2.5x, allow navigating across all districts proportional to zoom
    const zoomExpansionX = Math.max(0, (zoom - 1) * (w * 0.42));
    const zoomExpansionY = Math.max(0, (zoom - 1) * (h * 0.45));

    const limitX = Math.max(50, baseMarginX + zoomExpansionX);
    const limitY = Math.max(60, baseMarginY + zoomExpansionY);

    return {
      minX: -limitX,
      maxX: limitX,
      minY: -limitY,
      maxY: limitY,
    };
  };

  // Clamps raw offset with soft resistance (rubber-band) when reaching boundaries
  // Instead of an abrupt lock or dragging into the void, it stops smoothly with progressive resistance
  const applySoftResistance = (val: number, min: number, max: number): number => {
    if (val < min) {
      const diff = min - val;
      const resisted = 32 * (1 - Math.exp(-diff / 40));
      return min - resisted;
    }
    if (val > max) {
      const diff = val - max;
      const resisted = 32 * (1 - Math.exp(-diff / 40));
      return max + resisted;
    }
    return val;
  };

  // Constrains position strictly to bounds (used on release/zoom changes)
  const clampToBounds = (x: number, y: number, zoom: number) => {
    const bounds = getMaxBounds(zoom);
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, y)),
    };
  };

  // Zoom handlers with boundary clamping
  const handleZoomIn = () => {
    setZoomLevel((prev) => {
      const next = Math.min(prev + 0.3, 2.5);
      setPanOffset((cur) => clampToBounds(cur.x, cur.y, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.3, 0.85);
      setPanOffset((cur) => clampToBounds(cur.x, cur.y, next));
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    onSelectDistrict(null);
  };

  const handleArchipelagoChange = (arch: 'continental' | 'madeira' | 'acores' | 'tudo') => {
    setActiveArchipelago(arch);
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    onSelectDistrict(null);
  };

  // Drag pan handlers (for mouse and touch) with boundary limits
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const rawX = e.clientX - dragStart.x;
    const rawY = e.clientY - dragStart.y;
    const bounds = getMaxBounds(zoomLevel);
    setPanOffset({
      x: applySoftResistance(rawX, bounds.minX, bounds.maxX),
      y: applySoftResistance(rawY, bounds.minY, bounds.maxY),
    });
  };

  const handleReleaseDrag = () => {
    if (!isDragging && touchDistanceRef.current === null) return;
    setIsDragging(false);
    touchDistanceRef.current = null;
    // Snap gently back if dragged into the soft resistance boundary
    setPanOffset((cur) => clampToBounds(cur.x, cur.y, zoomLevel));
  };

  // Touch handlers: 1 finger = pan map, 2 fingers = pinch-to-zoom inside map
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y,
      });
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);
      initialZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const rawX = e.touches[0].clientX - dragStart.x;
      const rawY = e.touches[0].clientY - dragStart.y;
      const bounds = getMaxBounds(zoomLevel);
      setPanOffset({
        x: applySoftResistance(rawX, bounds.minX, bounds.maxX),
        y: applySoftResistance(rawY, bounds.minY, bounds.maxY),
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const newDistance = Math.sqrt(dx * dx + dy * dy);
      const scale = newDistance / touchDistanceRef.current;
      const newZoom = Math.min(Math.max(initialZoomRef.current * scale, 0.85), 2.5);
      setZoomLevel(newZoom);
      setPanOffset((cur) => clampToBounds(cur.x, cur.y, newZoom));
    }
  };

  // Wheel zoom with boundary clamping
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.85), 2.5);
      setPanOffset((cur) => clampToBounds(cur.x, cur.y, next));
      return next;
    });
  };

  // Get Choropleth Fill Color for district polygon
  const getDistrictFill = (distId: string, isHovered: boolean, isSelected: boolean) => {
    if (isSelected) {
      return '#3b82f6';
    }

    const data = districtStats[distId] || {
      totalCount: 0,
      graveCount: 0,
      moderadaCount: 0,
    };

    const { totalCount, graveCount, moderadaCount } = data;

    if (totalCount === 0) {
      return isHovered ? '#1e293b' : '#0b1329';
    }

    // High Severity: Red
    if (graveCount > 0) {
      if (graveCount >= 5 || totalCount >= 20) {
        return isHovered ? '#f87171' : '#dc2626';
      }
      if (graveCount >= 2 || totalCount >= 8) {
        return isHovered ? '#ef4444' : '#b91c1c';
      }
      return isHovered ? '#dc2626' : '#991b1b';
    }

    // Moderate Severity: Amber / Orange
    if (moderadaCount > 0) {
      if (moderadaCount >= 4 || totalCount >= 10) {
        return isHovered ? '#fb923c' : '#ea580c';
      }
      return isHovered ? '#f59e0b' : '#c2410c';
    }

    // Information / Low Severity: Blue
    if (totalCount >= 5) {
      return isHovered ? '#60a5fa' : '#2563eb';
    }
    return isHovered ? '#3b82f6' : '#1d4ed8';
  };

  // ViewBox according to active archipelago tab
  const activeViewBox = useMemo(() => {
    switch (activeArchipelago) {
      case 'madeira':
        return '66 345 40 22';
      case 'acores':
        return '12 276 48 52';
      case 'tudo':
        return '0 0 250 367';
      case 'continental':
      default:
        // Geographically accurate mainland bounding box
        return '70 0 180 367';
    }
  }, [activeArchipelago]);

  // Handle clicking a district
  const handleDistrictClick = (district: DistrictPolygon) => {
    const isCurrentlySelected = selectedDistrict?.toLowerCase() === district.name.toLowerCase();
    onSelectDistrict(isCurrentlySelected ? null : district.name);

    const stats = districtStats[district.id] || {
      totalCount: 0,
      graveCount: 0,
      moderadaCount: 0,
      infoCount: 0,
      dominantSeverity: 'Informação' as SeverityLevel,
      occurrences: [],
    };

    setActiveModalDistrict({
      id: district.id,
      name: district.name,
      ...stats,
    });
  };

  return (
    <>
      <div 
        className={`relative w-full rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#0a101d] via-[#060a14] to-[#03060c] border border-slate-800 flex flex-col overflow-hidden shadow-2xl backdrop-blur-md transition-all duration-300 ${
          isFullscreen 
            ? 'fixed inset-2 sm:inset-6 z-50 h-[calc(100vh-1rem)] sm:h-[calc(100vh-3rem)]' 
            : 'h-[390px] sm:h-[480px] md:h-[550px] lg:h-[640px] xl:h-[680px]'
        } ${className}`}
      >
        {/* Top Control Bar */}
        <div className="z-20 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => onViewModeChange('distritos')}
              className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeViewMode === 'distritos'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Distritos
            </button>
            <button
              onClick={() => onViewModeChange('concelhos')}
              className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeViewMode === 'concelhos'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Concelhos
            </button>
            <button
              onClick={() => onViewModeChange('cidades')}
              className={`px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeViewMode === 'cidades'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Cidades
            </button>
          </div>

          {/* Archipelago Selector & Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 rounded-xl border border-slate-800 text-[10px] sm:text-xs">
              <button
                onClick={() => handleArchipelagoChange('continental')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeArchipelago === 'continental'
                    ? 'bg-slate-800 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Continente
              </button>
              <button
                onClick={() => handleArchipelagoChange('madeira')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeArchipelago === 'madeira'
                    ? 'bg-slate-800 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Madeira
              </button>
              <button
                onClick={() => handleArchipelagoChange('acores')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  activeArchipelago === 'acores'
                    ? 'bg-slate-800 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Açores
              </button>
              <button
                onClick={() => handleArchipelagoChange('tudo')}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer hidden md:inline-block ${
                  activeArchipelago === 'tudo'
                    ? 'bg-slate-800 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tudo
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'Minimizar mapa' : 'Expandir mapa em ecrã inteiro'}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Live Synchronisation Bar & Choropleth Legend */}
        <div className="z-20 px-3 py-1.5 bg-slate-950/50 border-b border-slate-800/50 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
              Tempo Real
            </span>
            <span className="text-slate-500 hidden sm:inline">·</span>
            <span className="hidden sm:inline text-slate-300">
              {totalReports} ocorrências ativas
            </span>
            {severeReports > 0 && (
              <span className="px-1.5 py-0.2 rounded-md bg-red-950/80 text-red-300 border border-red-700/60 font-bold text-[10px]">
                {severeReports} graves
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 hidden xs:inline">
              Toque num distrito para ver ocorrências
            </span>
            {selectedDistrict && (
              <div className="flex items-center gap-1.5">
                <FavoriteButton
                  item={{
                    id: `local-distrito-${selectedDistrict.toLowerCase().replace(/\s+/g, '-')}`,
                    type: 'local',
                    category: 'locais',
                    title: `Distrito de ${selectedDistrict}`,
                    subtitle: 'Distrito selecionado no Mapa de Portugal',
                    locality: selectedDistrict,
                    district: selectedDistrict,
                  }}
                  size="sm"
                />
                <button
                  onClick={() => onSelectDistrict(null)}
                  className="text-blue-400 hover:text-blue-300 font-semibold underline text-[11px] cursor-pointer"
                >
                  Limpar ({selectedDistrict})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Interactive SVG Canvas */}
        <div 
          ref={containerRef}
          className="map-canvas-container relative flex-1 w-full h-full flex items-center justify-center overflow-hidden select-none cursor-grab active:cursor-grabbing touch-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleReleaseDrag}
          onMouseLeave={handleReleaseDrag}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleReleaseDrag}
          onWheel={handleWheel}
        >
          {/* Subtle Radar Grid */}
          <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px]" />

          {/* SVG Container with hardware accelerated transform and smooth spring stop at bounds */}
          <div
            className="relative w-full h-full flex items-center justify-center origin-center pointer-events-auto"
            style={{ 
              transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
              transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform',
            }}
          >
            <svg
              viewBox={activeViewBox}
              className="w-full h-full max-h-[350px] sm:max-h-[440px] md:max-h-[520px] lg:max-h-[640px] drop-shadow-[0_20px_45px_rgba(0,0,0,0.9)]"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Geographically Accurate District Polygons */}
              <g id="portugal-districts-accurate">
                {ACCURATE_PORTUGAL_DISTRICTS.map((dist) => {
                  const isHovered = hoveredDistrictId === dist.id;
                  const isSelected = selectedDistrict?.toLowerCase() === dist.name.toLowerCase();
                  const stats = districtStats[dist.id] || { totalCount: 0, graveCount: 0, moderadaCount: 0 };
                  const fillColor = getDistrictFill(dist.id, isHovered, isSelected);

                  return (
                    <g 
                      key={dist.id} 
                      className="cursor-pointer group"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDistrictClick(dist);
                      }}
                      onMouseEnter={() => setHoveredDistrictId(dist.id)}
                      onMouseLeave={() => setHoveredDistrictId(null)}
                    >
                      {/* Entire District Painted Polygon */}
                      <path
                        d={dist.d}
                        fill={fillColor}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? '1.8' : isHovered ? '1.4' : '0.85'}
                        strokeOpacity={isSelected ? '1' : isHovered ? '1' : '0.92'}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="transition-colors duration-150"
                        style={{
                          filter: isSelected ? 'drop-shadow(0 0 6px rgba(96,165,250,0.8))' : undefined,
                        }}
                      >
                        <title>{dist.name} ({stats.totalCount} ocorrências)</title>
                      </path>

                      {/* District Center Code & Count Label (Embedded directly inside polygon) */}
                      {dist.centerX > 0 && dist.centerY > 0 && (
                        <g 
                          transform={`translate(${dist.centerX}, ${dist.centerY})`}
                          className="pointer-events-none"
                        >
                          {/* District Code */}
                          <text
                            x="0"
                            y="-1.5"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="4.6"
                            fontWeight="800"
                            letterSpacing="0.4"
                            style={{
                              textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)',
                            }}
                          >
                            {dist.code}
                          </text>

                          {/* Occurrence Count Pill Badge */}
                          {stats.totalCount > 0 && (
                            <text
                              x="0"
                              y="4.2"
                              textAnchor="middle"
                              fill={stats.graveCount > 0 ? '#fecaca' : stats.moderadaCount > 0 ? '#fef08a' : '#bfdbfe'}
                              fontSize="3.6"
                              fontWeight="800"
                              style={{
                                textShadow: '0 1px 2px rgba(0,0,0,0.95)',
                              }}
                            >
                              {stats.totalCount}
                            </text>
                          )}
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Floating Controls (Zoom In, Out, Reset) */}
          <div className="absolute bottom-3 right-3 z-20 flex flex-col gap-1 p-1 bg-slate-900/90 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md">
            <button
              onClick={handleZoomIn}
              aria-label="Aumentar zoom"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              aria-label="Diminuir zoom"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetZoom}
              aria-label="Repor vista"
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Choropleth Severity Color Legend */}
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/85 border border-slate-800/80 text-[10px] text-slate-200 backdrop-blur-md pointer-events-none shadow-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-600 border border-white/40" />
              <span>Grave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 border border-white/40" />
              <span>Moderada</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 border border-white/40" />
              <span>Info</span>
            </div>
            <div className="flex items-center gap-1.5 border-l border-slate-700 pl-2 text-slate-400 hidden xs:flex">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-900 border border-white/20" />
              <span>Sem incidentes</span>
            </div>
          </div>
        </div>
      </div>

      {/* District Detail Modal (Opens when clicking any district) */}
      {activeModalDistrict && (
        <ClusterDetailModal
          cluster={{
            id: `district-${activeModalDistrict.id}`,
            name: `Distrito de ${activeModalDistrict.name}`,
            district: activeModalDistrict.name,
            x: 0,
            y: 0,
            occurrences: activeModalDistrict.occurrences,
            totalCount: activeModalDistrict.totalCount,
            graveCount: activeModalDistrict.graveCount,
            moderadaCount: activeModalDistrict.moderadaCount,
            infoCount: activeModalDistrict.infoCount,
            dominantSeverity: activeModalDistrict.dominantSeverity,
            densityScore: Math.min(activeModalDistrict.totalCount * 5, 100),
          }}
          onClose={() => setActiveModalDistrict(null)}
          onSelectOccurrence={(occ) => {
            if (onSelectOccurrence) {
              onSelectOccurrence(occ);
            }
          }}
        />
      )}
    </>
  );
};

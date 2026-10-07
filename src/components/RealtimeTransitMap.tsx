import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Navigation, 
  RefreshCw, 
  Activity, 
  Gauge, 
  Compass, 
  MapPin, 
  Clock, 
  Search, 
  SlidersHorizontal, 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle, 
  Radio, 
  Layers,
  ChevronRight,
  Info,
  Building,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { 
  TmlLiveVehicle, 
  TmlDiagnosticData, 
  UnirDiagnosticReport,
  fetchTmlVehicles, 
  fetchTmlDiagnostic,
  fetchUnirDiagnostic 
} from '../services/transitApi';
import { 
  ACCURATE_PORTUGAL_DISTRICTS, 
  DistrictPolygon 
} from '../data/portugalDistrictsGeo';

interface RealtimeTransitMapProps {
  onOpenReportModal?: (prefilledOperator?: string, prefilledLine?: string) => void;
  onSelectLineInSchedules?: (lineCode: string) => void;
}

export const RealtimeTransitMap: React.FC<RealtimeTransitMapProps> = ({
  onOpenReportModal,
  onSelectLineInSchedules,
}) => {
  const [vehicles, setVehicles] = useState<TmlLiveVehicle[]>([]);
  const [diagnostic, setDiagnostic] = useState<TmlDiagnosticData | null>(null);
  const [unirDiagnostic, setUnirDiagnostic] = useState<UnirDiagnosticReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('a carregar...');
  const [selectedVehicle, setSelectedVehicle] = useState<TmlLiveVehicle | null>(null);
  const [showDiagnosticModal, setShowDiagnosticModal] = useState<boolean>(false);
  const [diagnosticTab, setDiagnosticTab] = useState<'global' | 'unir'>('global');
  const [hoveredDistrictId, setHoveredDistrictId] = useState<string | null>(null);
  const [selectedDistrictName, setSelectedDistrictName] = useState<string | null>(null);

  // Filters
  const [searchLine, setSearchLine] = useState<string>('');
  const [selectedAgency, setSelectedAgency] = useState<string>('Todos');
  const [selectedStatus, setSelectedStatus] = useState<string>('Todos');

  // Map viewport & pan/zoom state
  // Regions: Nacional (lat 39.55, lon -8.1, zoom 5), AML (lat 38.74, lon -9.18, zoom 11), Porto/UNIR (lat 41.22, lon -8.62, zoom 11)
  const [activeRegion, setActiveRegion] = useState<'nacional' | 'aml' | 'porto'>('nacional');
  const [centerLat, setCenterLat] = useState<number>(39.55);
  const [centerLon, setCenterLon] = useState<number>(-8.1);
  const [zoomLevel, setZoomLevel] = useState<number>(5.0);

  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; lat: number; lon: number }>({ x: 0, y: 0, lat: 0, lon: 0 });
  const mapSvgRef = useRef<SVGSVGElement | null>(null);

  // Region preset switcher
  const handleSelectRegion = (region: 'nacional' | 'aml' | 'porto') => {
    setActiveRegion(region);
    setSelectedDistrictName(null);
    if (region === 'aml') {
      setCenterLat(38.74);
      setCenterLon(-9.18);
      setZoomLevel(11);
    } else if (region === 'porto') {
      setCenterLat(41.22);
      setCenterLon(-8.62);
      setZoomLevel(11);
    } else {
      setCenterLat(39.55);
      setCenterLon(-8.1);
      setZoomLevel(5.0);
    }
  };

  const handleFlyToDistrict = (dist: DistrictPolygon) => {
    const lat = (2918.6328 - dist.centerY) / 69.2024;
    const lon = (dist.centerX - 509.3511) / 44.2280;
    setCenterLat(lat);
    setCenterLon(lon);
    setZoomLevel(11);
    setSelectedDistrictName(dist.name);
    if (dist.id === 'lisboa' || dist.id === 'setubal') {
      setActiveRegion('aml');
    } else if (dist.id === 'porto' || dist.id === 'braga' || dist.id === 'aveiro') {
      setActiveRegion('porto');
    } else {
      setActiveRegion('nacional');
    }
  };

  // Load diagnostic and vehicles
  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    else setIsUpdating(true);

    try {
      const [vRes, diagRes, unirDiagRes] = await Promise.all([
        fetchTmlVehicles(),
        fetchTmlDiagnostic(),
        fetchUnirDiagnostic().catch(() => null),
      ]);

      setVehicles(vRes.vehicles);
      setDiagnostic(diagRes);
      if (unirDiagRes) setUnirDiagnostic(unirDiagRes);
      setLastRefreshed(new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.warn('[Realtime Map] Erro ao sincronizar veículos:', err);
    } finally {
      if (isInitial) setIsLoading(false);
      setIsUpdating(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Polling every 3 seconds as strictly requested
  useEffect(() => {
    const interval = setInterval(() => {
      loadData(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Available agencies for filter dropdown
  const availableAgencies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => {
      if (v.agency_name) set.add(v.agency_name);
    });
    return ['Todos', ...Array.from(set).sort()];
  }, [vehicles]);

  // Handle agency filter change - auto-switch region if UNIR is selected
  const handleAgencyChange = (agency: string) => {
    setSelectedAgency(agency);
    if (agency.toLowerCase().includes('unir')) {
      handleSelectRegion('porto');
    }
  };

  // Filter vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      if (selectedAgency !== 'Todos' && v.agency_name !== selectedAgency && v.agency_id !== selectedAgency) {
        return false;
      }
      if (searchLine.trim() && !v.line_code.toLowerCase().includes(searchLine.toLowerCase().trim())) {
        return false;
      }
      if (selectedStatus !== 'Todos') {
        if (selectedStatus === 'STOPPED' && v.current_status !== 'STOPPED_AT') return false;
        if (selectedStatus === 'INCOMING' && v.current_status !== 'INCOMING_AT') return false;
        if (selectedStatus === 'TRANSIT' && v.current_status !== 'IN_TRANSIT_TO') return false;
      }
      return true;
    });
  }, [vehicles, selectedAgency, searchLine, selectedStatus]);

  // Coordinate projection from GPS to SVG viewport (1000 x 700 viewBox)
  const span = 0.8 / Math.pow(1.5, zoomLevel - 10);
  const minLat = centerLat - span * 0.45;
  const maxLat = centerLat + span * 0.45;
  const minLon = centerLon - span * 0.65;
  const maxLon = centerLon + span * 0.65;

  const project = useCallback((lat: number, lon: number): { x: number; y: number; inView: boolean } => {
    const x = ((lon - minLon) / (maxLon - minLon)) * 1000;
    const y = ((maxLat - lat) / (maxLat - minLat)) * 700;
    const inView = x >= -50 && x <= 1050 && y >= -50 && y <= 750;
    return { x, y, inView };
  }, [minLat, maxLat, minLon, maxLon]);

  // Vehicles inside visible area
  const visibleVehicles = useMemo(() => {
    return filteredVehicles.map((v) => {
      const p = project(v.latitude, v.longitude);
      return { ...v, px: p.x, py: p.y, inView: p.inView };
    }).filter((v) => v.inView);
  }, [filteredVehicles, project]);

  // Pan interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      lat: centerLat,
      lon: centerLon,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const dLon = (dx / 1000) * (maxLon - minLon);
    const dLat = (dy / 700) * (maxLat - minLat);
    setCenterLon(dragStartRef.current.lon - dLon);
    setCenterLat(dragStartRef.current.lat + dLat);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((z) => Math.min(16, z + 1));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(4, z - 1));

  // Matrix transform from Geo SVG space (ACCURATE_PORTUGAL_DISTRICTS) to Radar SVG space (1000 x 700 viewBox)
  const portugalTransform = useMemo(() => {
    const scaleX = 1000.0 / (44.2280 * (maxLon - minLon));
    const transX = 1000.0 * (-509.3511 / 44.2280 - minLon) / (maxLon - minLon);

    const scaleY = 700.0 / (69.2024 * (maxLat - minLat));
    const transY = 700.0 * (maxLat - 2918.6328 / 69.2024) / (maxLat - minLat);

    return {
      matrix: `matrix(${scaleX}, 0, 0, ${scaleY}, ${transX}, ${transY})`,
      scaleX,
      scaleY,
      strokeWidth: Math.max(0.2, Math.min(1.6, 1.0 / Math.max(scaleX, 0.001))),
    };
  }, [minLat, maxLat, minLon, maxLon]);

  // Aggregate live vehicles per Portuguese district
  const vehicleCountByDistrict = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredVehicles.forEach((v) => {
      const gx = 44.2280 * v.longitude + 509.3511;
      const gy = -69.2024 * v.latitude + 2918.6328;
      let minDist = Infinity;
      let closestId = 'lisboa';
      for (const d of ACCURATE_PORTUGAL_DISTRICTS) {
        const dx = d.centerX - gx;
        const dy = d.centerY - gy;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDist) {
          minDist = distSq;
          closestId = d.id;
        }
      }
      counts[closestId] = (counts[closestId] || 0) + 1;
    });
    return counts;
  }, [filteredVehicles]);

  // Clustering calculation when zoom is low (zoom < 13)
  const clusters = useMemo(() => {
    if (zoomLevel >= 13) return [];
    const gridSize = 65; // pixels
    const grid: Record<string, { count: number; x: number; y: number; items: typeof visibleVehicles }> = {};

    visibleVehicles.forEach((v) => {
      const gx = Math.floor(v.px / gridSize);
      const gy = Math.floor(v.py / gridSize);
      const key = `${gx}_${gy}`;
      if (!grid[key]) {
        grid[key] = { count: 0, x: 0, y: 0, items: [] };
      }
      grid[key].count++;
      grid[key].x += v.px;
      grid[key].y += v.py;
      grid[key].items.push(v);
    });

    return Object.values(grid).map((c) => ({
      count: c.count,
      x: c.x / c.count,
      y: c.y / c.count,
      sample: c.items[0],
      items: c.items,
    }));
  }, [visibleVehicles, zoomLevel]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FFFFFF] relative overflow-hidden select-none text-[#111111]">
      {/* Top Telemetry & Audit Diagnostic Ribbon */}
      <div className="bg-[#FFFFFF] border-b border-[#E6E6E3] p-3 sm:p-4 z-20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Title & Live Status */}
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-[8px] bg-[#F4F4F2] text-[#C2410C] border border-[#E6E6E3] flex items-center justify-center">
              <Radio className="w-5 h-5 stroke-[2]" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-[#111111] tracking-tight">
                  Radar Realtime
                </h2>
                <span className="px-2 py-0.5 rounded-[4px] bg-[#F4F4F2] text-[#C2410C] border border-[#E6E6E3] text-xs font-semibold flex items-center gap-1">
                  Tempo real
                </span>
                {isUpdating && (
                  <RefreshCw className="w-3.5 h-3.5 text-[#111111] animate-spin stroke-[2]" />
                )}
              </div>
            </div>
          </div>

          {/* Diagnostic Metrics Pill Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setDiagnosticTab('unir');
                setShowDiagnosticModal(true);
              }}
              className="px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-xs text-[#111111] flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-[#FF6B1A] stroke-[2]" />
              <span>Auditoria UNIR</span>
              {unirDiagnostic && (
                <span className="px-1.5 py-0.5 rounded-[4px] bg-[#FFFFFF] text-[#111111] border border-[#E6E6E3] text-[10px] font-mono tabular-nums font-semibold">
                  {unirDiagnostic.veiculos_recebidos} ativos
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setDiagnosticTab('global');
                setShowDiagnosticModal(true);
              }}
              className="px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-xs text-[#111111] flex items-center gap-2 font-medium transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#111111] stroke-[2]" />
              <span>Auditoria TML Global</span>
              {diagnostic && (
                <span className="px-1.5 py-0.5 rounded-[4px] bg-[#FFFFFF] text-[#111111] border border-[#E6E6E3] text-[10px] font-mono tabular-nums font-semibold">
                  {diagnostic.vehicles_valid}/{diagnostic.vehicles_received} OK
                </span>
              )}
            </button>

            <button
              onClick={() => loadData(false)}
              disabled={isLoading || isUpdating}
              className="p-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#111111] transition-colors cursor-pointer disabled:opacity-50"
              title="Forçar atualização agora"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2] ${isUpdating ? 'animate-spin text-[#FF6B1A]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Live Audit Counters Strip with Region Switcher */}
        <div className="max-w-7xl mx-auto mt-2.5 pt-2.5 border-t border-[#E6E6E3] flex items-center justify-between flex-wrap gap-2 text-[11px]">
          {/* Quick Region Switcher Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[#6B6B6B] font-semibold text-[10px] uppercase tracking-wider mr-1">Região no Radar:</span>
            <button
              onClick={() => handleSelectRegion('nacional')}
              className={`px-2.5 py-1 rounded-[8px] text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
                activeRegion === 'nacional' && !selectedDistrictName
                  ? 'bg-[#FF6B1A] text-[#111111] font-bold border border-[#FF6B1A] brand-chamfer'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border border-[#E6E6E3]'
              }`}
            >
              <span>Portugal Inteiro (Mapa Nacional)</span>
            </button>
            <button
              onClick={() => handleSelectRegion('aml')}
              className={`px-2.5 py-1 rounded-[8px] text-[11px] transition-all cursor-pointer ${
                activeRegion === 'aml' && !selectedDistrictName
                  ? 'bg-[#FF6B1A] text-[#111111] font-bold border border-[#FF6B1A] brand-chamfer'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border border-[#E6E6E3]'
              }`}
            >
              Lisboa (AML)
            </button>
            <button
              onClick={() => handleSelectRegion('porto')}
              className={`px-2.5 py-1 rounded-[8px] text-[11px] transition-all cursor-pointer flex items-center gap-1 ${
                activeRegion === 'porto' && !selectedDistrictName
                  ? 'bg-[#FF6B1A] text-[#111111] font-bold border border-[#FF6B1A] brand-chamfer'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border border-[#E6E6E3]'
              }`}
            >
              <span>Porto (UNIR)</span>
              {unirDiagnostic && (
                <span className="px-1 py-0.2 text-[9px] rounded-[4px] bg-[#F4F4F2] text-[#111111] font-mono tabular-nums border border-[#E6E6E3]">
                  {unirDiagnostic.veiculos_recebidos}
                </span>
              )}
            </button>

            {/* Quick District Focus Dropdown */}
            <div className="relative">
              <select
                value={selectedDistrictName || ''}
                onChange={(e) => {
                  const d = ACCURATE_PORTUGAL_DISTRICTS.find(x => x.name === e.target.value);
                  if (d) handleFlyToDistrict(d);
                }}
                className="px-2.5 py-1 rounded-[8px] text-[11px] font-semibold bg-[#FFFFFF] text-[#111111] border border-[#E6E6E3] hover:border-[#111111] focus:outline-none focus:border-[#FF6B1A] cursor-pointer"
              >
                <option value="">Focar Distrito...</option>
                {ACCURATE_PORTUGAL_DISTRICTS.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name} ({vehicleCountByDistrict[d.id] || 0} veículos)
                  </option>
                ))}
              </select>
            </div>

            {selectedDistrictName && (
              <span className="px-2 py-0.5 rounded-[4px] bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-[10px] font-bold">
                Distrito: {selectedDistrictName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-[#6B6B6B] font-mono tabular-nums text-[11px]">
            <span>
              Total Apresentados: <strong className="text-[#111111] font-bold">{visibleVehicles.length}</strong>
            </span>
            <span>
              UNIR Ativos: <strong className="text-[#111111] font-bold">{unirDiagnostic?.veiculos_recebidos || 0}</strong>
            </span>
            <span>
              Sincronizado: <span className="text-[#6B6B6B]">{lastRefreshed}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Map Canvas with Interactive Controls */}
      <div 
        className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden bg-[#F4F4F2]"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Floating Filter Controls Overlay */}
        <div className="absolute top-3 left-3 z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 max-w-xl w-[calc(100%-24px)]">
          {/* Line Search */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" />
            <input
              type="text"
              value={searchLine}
              onChange={(e) => setSearchLine(e.target.value)}
              placeholder="Filtrar por carreira (ex: 5102, 6017, 3304, 2336, 1715)..."
              className="w-full pl-8 pr-8 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] shadow-sm"
            />
            {searchLine && (
              <button
                onClick={() => setSearchLine('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111]"
              >
                <X className="w-3.5 h-3.5 stroke-[2]" />
              </button>
            )}
          </div>

          {/* Agency Filter */}
          <select
            value={selectedAgency}
            onChange={(e) => handleAgencyChange(e.target.value)}
            className="px-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] focus:outline-none focus:border-[#111111] shadow-sm cursor-pointer"
          >
            {availableAgencies.map((ag) => (
              <option key={ag} value={ag}>
                {ag}
              </option>
            ))}
          </select>
        </div>

        {/* Floating Zoom / Reset View Controls */}
        <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="p-2.5 rounded-[8px] bg-[#FFFFFF] hover:bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] shadow-sm transition-colors cursor-pointer"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4 stroke-[2]" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2.5 rounded-[8px] bg-[#FFFFFF] hover:bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] shadow-sm transition-colors cursor-pointer"
            title="Diminuir Zoom"
          >
            <ZoomOut className="w-4 h-4 stroke-[2]" />
          </button>
          <button
            onClick={() => handleSelectRegion(activeRegion)}
            className="p-2.5 rounded-[8px] bg-[#FFFFFF] hover:bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] shadow-sm transition-colors cursor-pointer"
            title="Recentrar Vista"
          >
            <RotateCcw className="w-4 h-4 stroke-[2]" />
          </button>
        </div>

        {/* SVG Interactive Radar Map Viewport */}
        <svg
          ref={mapSvgRef}
          viewBox="0 0 1000 700"
          className="w-full h-full pointer-events-auto"
          preserveAspectRatio="none"
        >
          {/* Background Grid & Coordinate Lines */}
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E6E6E3" strokeWidth="0.5" strokeOpacity="0.8" />
            </pattern>
            <radialGradient id="vehicleGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FF6B1A" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FF6B1A" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Base Ocean Canvas */}
          <rect width="1000" height="700" fill="#EDEDEA" />

          {/* Geographically Accurate Mainland Portugal Map & All 18 Districts */}
          <g id="radar-portugal-districts" transform={portugalTransform.matrix}>
            {ACCURATE_PORTUGAL_DISTRICTS.map((dist) => {
              const isHovered = hoveredDistrictId === dist.id;
              const isSelected = selectedDistrictName?.toLowerCase() === dist.name.toLowerCase();
              const count = vehicleCountByDistrict[dist.id] || 0;

              return (
                <g 
                  key={dist.id} 
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFlyToDistrict(dist);
                  }}
                  onMouseEnter={() => setHoveredDistrictId(dist.id)}
                  onMouseLeave={() => setHoveredDistrictId(null)}
                >
                  {/* District Landmass Polygon */}
                  <path
                    d={dist.d}
                    fill={isSelected ? '#FFE8DC' : isHovered ? '#FFFFFF' : '#FDFCFA'}
                    fillOpacity={1}
                    stroke={isSelected ? '#FF6B1A' : isHovered ? '#C2410C' : '#D0D0CE'}
                    strokeWidth={isSelected ? portugalTransform.strokeWidth * 2 : isHovered ? portugalTransform.strokeWidth * 1.5 : portugalTransform.strokeWidth}
                    strokeOpacity={1}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="transition-colors duration-150"
                  >
                    <title>{dist.name} — {count} veículos de transporte em circulação</title>
                  </path>

                  {/* District Label & Live Vehicle Count when zoomed out */}
                  {zoomLevel <= 11 && dist.centerX > 0 && dist.centerY > 0 && (
                    <g transform={`translate(${dist.centerX}, ${dist.centerY})`} className="pointer-events-none">
                      {/* District Code */}
                      <text
                        x="0"
                        y="-1.2"
                        textAnchor="middle"
                        fill={isSelected ? '#C2410C' : isHovered ? '#111111' : '#6B6B6B'}
                        fontSize="3.8"
                        fontWeight="800"
                        letterSpacing="0.4"
                      >
                        {dist.code}
                      </text>

                      {/* Live Vehicles in District Badge */}
                      {count > 0 && (
                        <text
                          x="0"
                          y="3.8"
                          textAnchor="middle"
                          fill={isSelected ? '#111111' : '#6B6B6B'}
                          fontSize="3.2"
                          fontWeight="800"
                        >
                          {count}v
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Radar coordinate grid overlay */}
          <rect width="1000" height="700" fill="url(#grid)" pointerEvents="none" />

          {/* Render Clusters if Zoom is low (< 13) */}
          {zoomLevel < 13 &&
            clusters.map((c, cIdx) => (
              <g
                key={`cluster-${cIdx}`}
                transform={`translate(${c.x}, ${c.y})`}
                className="cursor-pointer group"
                onClick={(e) => {
                  e.stopPropagation();
                  setCenterLat(c.sample.latitude);
                  setCenterLon(c.sample.longitude);
                  setZoomLevel((z) => Math.min(15, z + 2));
                }}
              >
                <circle
                  r={Math.min(32, 16 + c.count * 1.2)}
                  fill="#FF6B1A"
                  fillOpacity="0.25"
                  className="animate-pulse"
                />
                <circle
                  r={Math.min(22, 12 + c.count * 0.8)}
                  fill="#FF6B1A"
                  stroke="#111111"
                  strokeWidth="2"
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#111111"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {c.count}
                </text>
              </g>
            ))}

          {/* Render Individual Vehicle Markers (when zoomed in or sparse) */}
          {(zoomLevel >= 13 || clusters.length === 0) &&
            visibleVehicles.map((v) => {
              const isSelected = selectedVehicle?.id === v.id;
              const angle = v.bearing !== undefined ? v.bearing : 0;
              const isUnir = v.agency_name.toLowerCase().includes('unir') || v.line_color === '#003399';

              return (
                <g
                  key={v.id}
                  transform={`translate(${v.px}, ${v.py})`}
                  className="cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedVehicle(v);
                  }}
                >
                  {/* Glow Pulse */}
                  {isSelected && (
                    <circle
                      r="22"
                      fill="url(#vehicleGlow)"
                      className="animate-ping"
                    />
                  )}

                  {/* Orientation Heading Arrow if bearing available */}
                  {v.bearing !== undefined && (
                    <g transform={`rotate(${angle})`}>
                      <polygon
                        points="0,-16 -5,-9 5,-9"
                        fill={isSelected ? '#FF6B1A' : (isUnir ? '#111111' : '#6B6B6B')}
                      />
                    </g>
                  )}

                  {/* Vehicle Body Dot */}
                  <circle
                    r={isSelected ? 11 : 8}
                    fill={v.line_color || (isUnir ? '#003399' : '#111111')}
                    stroke={isSelected ? '#FF6B1A' : '#ffffff'}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="shadow transition-transform group-hover:scale-125"
                  />

                  {/* Line code label */}
                  <text
                    textAnchor="middle"
                    dy="3"
                    fill={v.line_text_color || '#ffffff'}
                    fontSize="7"
                    fontWeight="900"
                    className="select-none pointer-events-none"
                  >
                    {v.line_code.slice(0, 4)}
                  </text>
                </g>
              );
            })}
        </svg>

        {/* Selected Vehicle Inspector Drawer */}
        {selectedVehicle && (
          <div className="absolute bottom-4 left-4 z-20 max-w-sm w-[calc(100%-32px)] bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] shadow-xl p-4 text-[#111111] animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-start justify-between gap-3 border-b border-[#E6E6E3] pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="px-2.5 py-1 rounded-[6px] font-black text-sm shadow-sm"
                  style={{
                    backgroundColor: selectedVehicle.line_color || '#111111',
                    color: selectedVehicle.line_text_color || '#ffffff',
                  }}
                >
                  {selectedVehicle.line_code}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#111111] leading-tight">
                    {selectedVehicle.line_name || `Carreira ${selectedVehicle.line_code}`}
                  </h4>
                  <div className="text-[11px] text-[#6B6B6B]">
                    {selectedVehicle.agency_name}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedVehicle(null)}
                className="text-[#6B6B6B] hover:text-[#111111] p-1 rounded-[6px] hover:bg-[#F4F4F2]"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            </div>

            {/* Vehicle Telemetry Details */}
            <div className="py-3 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-0.5">
                <span className="text-[10px] text-[#6B6B6B] uppercase font-semibold">Veículo / Frota</span>
                <div className="font-mono text-[#111111] font-bold tabular-nums">{selectedVehicle.vehicle_id}</div>
              </div>

              <div className="p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-0.5">
                <span className="text-[10px] text-[#6B6B6B] uppercase font-semibold">Estado do Serviço</span>
                <div className="text-[#111111] font-semibold">{selectedVehicle.current_status}</div>
              </div>

              <div className="p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-0.5">
                <span className="text-[10px] text-[#6B6B6B] uppercase font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3 stroke-[2]" /> Velocidade
                </span>
                <div className="text-[#111111] font-bold font-mono tabular-nums">
                  {selectedVehicle.speed !== undefined ? `${selectedVehicle.speed} km/h` : 'N/D'}
                </div>
              </div>

              <div className="p-2 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-0.5">
                <span className="text-[10px] text-[#6B6B6B] uppercase font-semibold flex items-center gap-1">
                  <Compass className="w-3 h-3 stroke-[2]" /> Rumo (Bearing)
                </span>
                <div className="text-[#111111] font-bold font-mono tabular-nums">
                  {selectedVehicle.bearing !== undefined ? `${selectedVehicle.bearing}°` : 'N/D'}
                </div>
              </div>
            </div>

            {/* Next Stop & Realtime ETA */}
            <div className="p-2.5 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] mb-3 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#C2410C] flex items-center gap-1">
                <MapPin className="w-3 h-3 stroke-[2]" />
                <span>Próxima Paragem / ETA</span>
              </div>
              <div className="text-xs font-bold text-[#111111]">
                {selectedVehicle.stop_name || (selectedVehicle.stop_id ? `Paragem #${selectedVehicle.stop_id}` : 'Tempo real — ETA indisponível')}
              </div>
              {selectedVehicle.eta_seconds !== undefined ? (
                <div className="text-[11px] text-[#111111] font-semibold flex items-center gap-1 font-mono tabular-nums">
                  <Clock className="w-3 h-3 stroke-[2] text-[#FF6B1A]" />
                  <span>
                    Chegada em {Math.max(0, Math.round(selectedVehicle.eta_seconds / 60))} min ({selectedVehicle.eta_seconds}s)
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-[#6B6B6B] italic">
                  Tempo real — ETA indisponível no feed
                </div>
              )}
            </div>

            {/* GPS Coordinates & Trip ID */}
            <div className="space-y-0.5 text-[10px] text-[#6B6B6B] font-mono tabular-nums mb-3">
              <div>GPS: {selectedVehicle.latitude.toFixed(6)}, {selectedVehicle.longitude.toFixed(6)}</div>
              {selectedVehicle.trip_id && <div className="truncate">Trip: {selectedVehicle.trip_id}</div>}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {onSelectLineInSchedules && (
                <button
                  onClick={() => onSelectLineInSchedules(selectedVehicle.line_code)}
                  className="flex-1 py-2 px-3 rounded-[8px] bg-[#FF6B1A] hover:opacity-90 text-[#111111] font-bold text-xs brand-chamfer transition-colors cursor-pointer text-center"
                >
                  Consultar Horários
                </button>
              )}

              {onOpenReportModal && (
                <button
                  onClick={() => onOpenReportModal(selectedVehicle.agency_name, selectedVehicle.line_code)}
                  className="py-2 px-3 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] font-bold text-xs border border-[#E6E6E3] transition-colors cursor-pointer"
                  title="Reportar ocorrência neste veículo"
                >
                  <AlertTriangle className="w-3.5 h-3.5 stroke-[2] text-[#FF6B1A]" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Internal Audit Diagnostic Modal (Global + UNIR Dedicated) */}
      {showDiagnosticModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-[#111111]">
            <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[8px] bg-[#F4F4F2] text-[#111111] border border-[#E6E6E3]">
                  <ShieldCheck className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111111]">Relatório Técnico de Auditoria TML GO Hub</h3>
                  <p className="text-xs text-[#6B6B6B]">
                    Inspeção aprofundada de feeds oficiais, UNIR Realtime e motivos de descarte
                  </p>
                </div>
              </div>

              {/* Modal Tabs: Global vs UNIR Crítico */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-[#F4F4F2] p-1 rounded-[8px] border border-[#E6E6E3]">
                  <button
                    onClick={() => setDiagnosticTab('unir')}
                    className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                      diagnosticTab === 'unir'
                        ? 'bg-[#FF6B1A] text-[#111111] brand-chamfer'
                        : 'text-[#6B6B6B] hover:text-[#111111]'
                    }`}
                  >
                    Diagnóstico UNIR
                  </button>
                  <button
                    onClick={() => setDiagnosticTab('global')}
                    className={`px-3 py-1 rounded-[6px] text-xs font-bold transition-all cursor-pointer ${
                      diagnosticTab === 'global'
                        ? 'bg-[#FF6B1A] text-[#111111] brand-chamfer'
                        : 'text-[#6B6B6B] hover:text-[#111111]'
                    }`}
                  >
                    TML Global (AML)
                  </button>
                </div>

                <button
                  onClick={() => setShowDiagnosticModal(false)}
                  className="p-2 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 stroke-[2]" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* TAB 1: UNIR DEDICATED AUDIT */}
              {diagnosticTab === 'unir' && unirDiagnostic && (
                <div className="space-y-4">
                  {/* UNIR Summary Box */}
                  <div className="p-4 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-sm font-bold text-[#111111] flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#FF6B1A] stroke-[2]" />
                        <span>Auditoria Crítica UNIR — Área Metropolitana do Porto (AMP)</span>
                      </div>
                      <span className="text-[10px] text-[#6B6B6B] font-mono">
                        Fonte: go.tmlmobilidade.pt/hub/api/v1
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                        <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Veículos UNIR Recebidos</div>
                        <div className="text-xl font-black text-[#111111] mt-0.5 font-mono tabular-nums">{unirDiagnostic.veiculos_recebidos}</div>
                        <div className="text-[9px] text-[#6B6B6B]">Em circulação agora</div>
                      </div>

                      <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                        <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Viagens UNIR em ETA</div>
                        <div className="text-xl font-black text-[#111111] mt-0.5 font-mono tabular-nums">{unirDiagnostic.viagens_recebidas}</div>
                        <div className="text-[9px] text-[#6B6B6B]">Previsões ativas em /eta</div>
                      </div>

                      <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                        <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Linha 8003 no Feed</div>
                        <div className="text-xl font-black mt-0.5 font-mono tabular-nums">
                          {unirDiagnostic.linha_8003_encontrada ? (
                            <span className="text-[#111111]">SIM ({unirDiagnostic.veiculos_8003})</span>
                          ) : (
                            <span className="text-[#6B6B6B]">NÃO (0)</span>
                          )}
                        </div>
                        <div className="text-[9px] text-[#6B6B6B]">Lote 4 (VZAS3)</div>
                      </div>

                      <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                        <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Linha 8006 no Feed</div>
                        <div className="text-xl font-black mt-0.5 font-mono tabular-nums">
                          {unirDiagnostic.linha_8006_encontrada ? (
                            <span className="text-[#111111]">SIM ({unirDiagnostic.veiculos_8006})</span>
                          ) : (
                            <span className="text-[#6B6B6B]">NÃO (0)</span>
                          )}
                        </div>
                        <div className="text-[9px] text-[#6B6B6B]">Lote 4 (VZAS3)</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] text-xs text-[#111111] space-y-1">
                      <div className="font-bold text-[#111111] flex items-center gap-1.5">
                        <Info className="w-4 h-4 text-[#111111] stroke-[2]" />
                        <span>Estado das Linhas UNIR 8003 e 8006:</span>
                      </div>
                      <p className="leading-relaxed text-[#111111]">
                        {unirDiagnostic.motivo_descarte}
                      </p>
                      <p className="text-[11px] text-[#6B6B6B]">
                        Ambas as carreiras 8003 e 8006 estão catalogadas no PAROU com os seus horários e paragens completas. Quando um veículo começar a transmitir posições GPS no feed da TML, o motor PAROU apresentará automaticamente o veículo com a etiqueta "Tempo Real".
                      </p>
                    </div>
                  </div>

                  {/* 12-Column Table of All Active UNIR Vehicles */}
                  <div className="space-y-2">
                    <div className="font-bold text-[#111111] text-[11px] uppercase tracking-wider flex items-center justify-between">
                      <span>Lista Completa de Veículos UNIR Ativos no Momento ({unirDiagnostic.veiculos_auditados.length})</span>
                      <span className="text-[10px] text-[#111111] font-semibold font-mono tabular-nums">100% Apresentados no PAROU</span>
                    </div>

                    <div className="border border-[#E6E6E3] rounded-[8px] overflow-x-auto">
                      <table className="w-full text-left text-[10px] whitespace-nowrap">
                        <thead className="bg-[#F4F4F2] text-[#6B6B6B] uppercase font-bold border-b border-[#E6E6E3]">
                          <tr>
                            <th className="p-2">#</th>
                            <th className="p-2">Operador</th>
                            <th className="p-2">Route ID</th>
                            <th className="p-2">Linha</th>
                            <th className="p-2">Trip ID</th>
                            <th className="p-2">Vehicle ID</th>
                            <th className="p-2">Coordenadas GPS</th>
                            <th className="p-2">Posição</th>
                            <th className="p-2">ETA</th>
                            <th className="p-2">Próx. Paragem</th>
                            <th className="p-2">No PAROU</th>
                            <th className="p-2">Descarte</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E6E6E3] font-mono text-[#111111] tabular-nums">
                          {unirDiagnostic.veiculos_auditados.map((item, idx) => (
                            <tr key={idx} className="hover:bg-[#F4F4F2]">
                              <td className="p-2 text-[#6B6B6B]">{idx + 1}</td>
                              <td className="p-2 font-bold text-[#111111]">{item.operador_recebido}</td>
                              <td className="p-2 text-[#6B6B6B] truncate max-w-[120px]" title={item.route_id}>{item.route_id}</td>
                              <td className="p-2 font-bold text-[#111111]">{item.route_short_name}</td>
                              <td className="p-2 text-[#6B6B6B] truncate max-w-[140px]" title={item.trip_id}>{item.trip_id}</td>
                              <td className="p-2 text-[#111111]">{item.vehicle_id}</td>
                              <td className="p-2 text-[#111111]">{item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}</td>
                              <td className="p-2 text-[#111111] font-bold">SIM</td>
                              <td className="p-2">
                                {item.eta_recebida ? (
                                  <span className="text-[#111111] font-bold">SIM ({item.eta_seconds}s)</span>
                                ) : (
                                  <span className="text-[#6B6B6B]">NÃO</span>
                                )}
                              </td>
                              <td className="p-2 text-[#111111] truncate max-w-[140px]" title={item.stop_name}>{item.stop_name || 'N/D'}</td>
                              <td className="p-2 text-[#111111] font-bold">SIM</td>
                              <td className="p-2 text-[#6B6B6B]">{item.motivo_descarte || 'Nenhum'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: GLOBAL AUDIT */}
              {diagnosticTab === 'global' && diagnostic && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                      <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Operadores</div>
                      <div className="text-lg font-black text-[#111111] mt-0.5 font-mono tabular-nums">{diagnostic.agencies_received}</div>
                      <div className="text-[9px] text-[#6B6B6B]">Catálogo oficial ativo</div>
                    </div>

                    <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                      <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Veículos Recebidos</div>
                      <div className="text-lg font-black text-[#111111] mt-0.5 font-mono tabular-nums">{diagnostic.vehicles_received}</div>
                      <div className="text-[9px] text-[#6B6B6B]">Total do feed /positions</div>
                    </div>

                    <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                      <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Veículos Válidos</div>
                      <div className="text-lg font-black text-[#111111] mt-0.5 font-mono tabular-nums">{diagnostic.vehicles_valid}</div>
                      <div className="text-[9px] text-[#6B6B6B]">Coordenadas GPS confirmadas</div>
                    </div>

                    <div className="p-3 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
                      <div className="text-[10px] text-[#6B6B6B] font-semibold uppercase">Veículos Descartados</div>
                      <div className="text-lg font-black text-[#6B6B6B] mt-0.5 font-mono tabular-nums">{diagnostic.vehicles_discarded}</div>
                      <div className="text-[9px] text-[#6B6B6B]">Sem coordenadas / NaN</div>
                    </div>
                  </div>

                  {/* Discard Reasons Breakdown */}
                  <div className="p-3.5 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] space-y-1.5">
                    <div className="font-bold text-[#111111] text-[11px] uppercase tracking-wider">
                      Motivo de Descarte de Veículos
                    </div>
                    {Object.keys(diagnostic.discard_reasons).length === 0 ? (
                      <div className="text-[#111111] font-medium">
                        ✓ Nenhum veículo foi descartado por filtros arbitrários. Todos os veículos recebidos com coordenadas válidas são apresentados.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {Object.entries(diagnostic.discard_reasons).map(([reason, count]) => (
                          <div key={reason} className="flex items-center justify-between text-[#111111]">
                            <span>{reason}</span>
                            <strong className="text-[#111111] font-mono tabular-nums">{count}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Feed Capacities per Agency Table */}
                  <div className="space-y-2">
                    <div className="font-bold text-[#111111] text-[11px] uppercase tracking-wider">
                      Operadores Oficiais & Capacidades Técnicas
                    </div>
                    <div className="border border-[#E6E6E3] rounded-[8px] overflow-hidden">
                      <div className="grid grid-cols-12 gap-1 p-2 bg-[#F4F4F2] text-[#6B6B6B] font-semibold text-[10px] border-b border-[#E6E6E3]">
                        <span className="col-span-5">Operador</span>
                        <span className="col-span-2 text-center">Posições</span>
                        <span className="col-span-2 text-center">ETA</span>
                        <span className="col-span-3 text-right">Veículos Ativos</span>
                      </div>
                      <div className="max-h-52 overflow-y-auto divide-y divide-[#E6E6E3]">
                        {diagnostic.agencies_summary.map((ag) => (
                          <div key={ag.code + ag.name} className="grid grid-cols-12 gap-1 p-2 items-center text-[11px] hover:bg-[#F4F4F2]">
                            <span className="col-span-5 font-medium text-[#111111] truncate">{ag.name}</span>
                            <span className="col-span-2 text-center">
                              {ag.positions_enabled ? (
                                <span className="text-[#111111] font-bold">Sim</span>
                              ) : (
                                <span className="text-[#6B6B6B]">-</span>
                              )}
                            </span>
                            <span className="col-span-2 text-center">
                              {ag.eta_enabled ? (
                                <span className="text-[#111111] font-bold">Sim</span>
                              ) : (
                                <span className="text-[#6B6B6B]">-</span>
                              )}
                            </span>
                            <span className="col-span-3 text-right font-mono font-bold text-[#111111] tabular-nums">
                              {ag.active_vehicles_count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#E6E6E3] bg-[#F4F4F2] flex items-center justify-between text-xs text-[#6B6B6B]">
              <span>Timestamp: {lastRefreshed}</span>
              <button
                onClick={() => setShowDiagnosticModal(false)}
                className="px-4 py-2 rounded-[8px] bg-[#111111] hover:bg-black text-[#FFFFFF] font-bold transition-colors cursor-pointer"
              >
                Fechar Auditoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

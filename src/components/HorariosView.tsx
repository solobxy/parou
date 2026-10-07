import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Clock, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  RotateCcw,
  Star,
  Layers,
  ChevronRight,
  Database
} from 'lucide-react';
import { 
  ApiLineItem,
  fetchLinesNear,
  fetchLinesByIds,
  searchAllLines
} from '../services/transitApi';
import { FilterState } from '../types';
import { LineCard } from './LineCard';
import { LineDetailModal } from './LineDetailModal';
import { sortDepartures, parseDepartureTime } from '../utils/transitFormatter';

interface HorariosViewProps {
  filters?: FilterState;
  onFilterChange?: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters?: () => void;
  matchingReportsCount?: number;
  onViewReports?: () => void;
  onOpenCatalog?: () => void;
}

// Cache ao nível do módulo para manter os últimos dados ao trocar de aba
let lastNearLines: ApiLineItem[] = [];
let lastAllLines: ApiLineItem[] = [];
let lastAllLinesTotal = 0;

export const HorariosView: React.FC<HorariosViewProps> = ({ 
  filters: propFilters,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('Todos');

  // GPS & "Perto de mim"
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [nearLines, setNearLines] = useState<ApiLineItem[]>(lastNearLines);
  const [isNearLoading, setIsNearLoading] = useState<boolean>(false);

  // Favorites
  const [favoriteLineIds, setFavoriteLineIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('parou_favorite_line_ids');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [favoriteLines, setFavoriteLines] = useState<ApiLineItem[]>([]);
  const [isFavLoading, setIsFavLoading] = useState<boolean>(false);

  // All lines
  const [allLines, setAllLines] = useState<ApiLineItem[]>(lastAllLines);
  const [allLinesTotal, setAllLinesTotal] = useState<number>(lastAllLinesTotal);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isAllLinesLoading, setIsAllLinesLoading] = useState<boolean>(false);

  // DB Loading status ("A carregar horários… 12/29")
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [dbLoadingMessage, setDbLoadingMessage] = useState<string>('A carregar horários…');

  // Request concurrency guards e retry backoff (Regra 5)
  const isNearFetchingRef = useRef<boolean>(false);
  const isAllLinesFetchingRef = useRef<boolean>(false);
  const retryAttemptRef = useRef<number>(0);

  // Line Detail Modal
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const toggleFavoriteLine = useCallback((lineId: string) => {
    setFavoriteLineIds((prev) => {
      const exists = prev.includes(lineId);
      const next = exists ? prev.filter((id) => id !== lineId) : [...prev, lineId];
      try {
        localStorage.setItem('parou_favorite_line_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Request GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {},
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []);

  // Fetch near lines com timeout de 15s e sem sobreposição de pedidos (Regra 5)
  const loadNearLines = useCallback(async () => {
    if (!userCoords || isNearFetchingRef.current) return;
    isNearFetchingRef.current = true;
    setIsNearLoading(true);
    try {
      const res = await fetchLinesNear(userCoords.lat, userCoords.lon, 800, AbortSignal.timeout(15000));
      if (res.isLoading) {
        setIsDbLoading(true);
        if (res.message) setDbLoadingMessage(res.message);
      } else {
        setIsDbLoading(false);
        retryAttemptRef.current = 0;
        if (res.lines) {
          lastNearLines = res.lines;
          setNearLines(res.lines);
        }
      }
    } catch {
    } finally {
      setIsNearLoading(false);
      isNearFetchingRef.current = false;
    }
  }, [userCoords]);

  useEffect(() => {
    loadNearLines();
  }, [loadNearLines]);

  // Load all lines com timeout de 15s e sem sobreposição de pedidos (Regra 5)
  const loadAllLines = useCallback(async (q?: string, mode?: string, page = 1) => {
    if (isAllLinesFetchingRef.current) return;
    isAllLinesFetchingRef.current = true;
    setIsAllLinesLoading(true);
    try {
      const res = await searchAllLines(q, mode, page, AbortSignal.timeout(15000));
      if (res.isLoading) {
        setIsDbLoading(true);
        if (res.message) setDbLoadingMessage(res.message);
      } else {
        setIsDbLoading(false);
        retryAttemptRef.current = 0;
        if (res.lines) {
          lastAllLines = res.lines;
          lastAllLinesTotal = res.total || 0;
          setAllLines(res.lines);
          setAllLinesTotal(res.total || 0);
          setCurrentPage(res.page || page);
          setTotalPages(res.total_pages || 1);
        }
      }
    } catch {
    } finally {
      setIsAllLinesLoading(false);
      isAllLinesFetchingRef.current = false;
    }
  }, []);

  // Retries com backoff: espera 5 s, depois 10 s e depois 20 s (Regra 5)
  useEffect(() => {
    if (!isDbLoading) {
      retryAttemptRef.current = 0;
      return;
    }
    const RETRY_DELAYS = [5000, 10000, 20000];
    const delay = RETRY_DELAYS[Math.min(retryAttemptRef.current, RETRY_DELAYS.length - 1)];
    const timer = setTimeout(() => {
      retryAttemptRef.current++;
      loadNearLines();
      loadAllLines(searchQuery, selectedMode, currentPage);
    }, delay);

    return () => clearTimeout(timer);
  }, [isDbLoading, loadNearLines, loadAllLines, searchQuery, selectedMode, currentPage]);

  // Ordenar todas as partidas pela mais próxima primeiro (menor tempo até à partida)
  const sortedNearLines = useMemo(() => {
    if (!nearLines || nearLines.length === 0) return [];
    return [...nearLines].sort((a, b) => {
      const nextDepA = sortDepartures(a.departures || [])[0];
      const nextDepB = sortDepartures(b.departures || [])[0];
      const minA = nextDepA ? parseDepartureTime(nextDepA).minutesDiff : 9999;
      const minB = nextDepB ? parseDepartureTime(nextDepB).minutesDiff : 9999;
      if (minA !== minB) return minA - minB;
      const distA = a.nearest_stop?.distance_meters ?? 9999;
      const distB = b.nearest_stop?.distance_meters ?? 9999;
      if (distA !== distB) return distA - distB;
      return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
    });
  }, [nearLines]);

  // Partidas dos próximos 90 minutos
  const upcomingNearLines = useMemo(() => {
    return sortedNearLines.filter((line) => {
      const nextDep = sortDepartures(line.departures || [])[0];
      if (!nextDep) return false;
      const min = parseDepartureTime(nextDep).minutesDiff;
      return min <= 90;
    });
  }, [sortedNearLines]);

  // Linhas com próxima partida mais tarde (> 90 min, ex.: noturnas 7M, 8M)
  const laterNearLines = useMemo(() => {
    return sortedNearLines.filter((line) => {
      const nextDep = sortDepartures(line.departures || [])[0];
      if (!nextDep) return true;
      const min = parseDepartureTime(nextDep).minutesDiff;
      return min > 90;
    });
  }, [sortedNearLines]);

  // Aviso discreto por operador uma só vez no topo do grupo
  const outdatedNoticePertoDeSi = useMemo(() => {
    const outdatedOps = new Set<string>();
    sortedNearLines.forEach((line) => {
      const deps = line.departures || [];
      const hasOutdated = deps.some((d) => parseDepartureTime(d).isOutdated) || Boolean(line.aviso_horario);
      if (hasOutdated) {
        outdatedOps.add(line.operator || (line as any).agency_name || 'STCP');
      }
    });
    if (outdatedOps.size === 0) return null;
    return Array.from(outdatedOps).join(' e ');
  }, [sortedNearLines]);

  // Fetch favorite lines
  useEffect(() => {
    if (favoriteLineIds.length > 0) {
      setIsFavLoading(true);
      fetchLinesByIds(favoriteLineIds)
        .then((lines) => setFavoriteLines(lines))
        .catch(() => {})
        .finally(() => setIsFavLoading(false));
    } else {
      setFavoriteLines([]);
    }
  }, [favoriteLineIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAllLines(searchQuery, selectedMode, currentPage);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedMode, currentPage, loadAllLines]);

  const MODES_LIST = [
    { label: 'Todos', value: 'Todos' },
    { label: 'Metro', value: 'Metro' },
    { label: 'Comboio', value: 'Comboio' },
    { label: 'Autocarro', value: 'Autocarro' },
    { label: 'Barco', value: 'Barco' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#FFFFFF] min-h-screen">
      {/* Top Search & Filter Bar */}
      <div className="border-b border-[#E6E6E3] bg-[#FFFFFF] p-4 sm:p-6 space-y-3">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Pesquisar número de linha ou destino..."
              className="w-full pl-9 pr-9 py-2.5 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B] hover:text-[#111111] p-1 cursor-pointer"
              >
                <X className="w-4 h-4 stroke-[2]" />
              </button>
            )}
          </div>

          {/* Mode Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {MODES_LIST.map((mode) => {
              const isActive = selectedMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => {
                    setSelectedMode(mode.value);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#111111] text-[#FFFFFF]'
                      : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
        {/* Perto de si */}
        {userCoords && (sortedNearLines.length > 0 || isDbLoading) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">
                Perto de si
              </h2>
              {sortedNearLines.length > 0 && (
                <span className="font-['Barlow_Condensed'] text-xs font-bold text-[#6B6B6B] tabular-nums">
                  {upcomingNearLines.length} {upcomingNearLines.length === 1 ? 'próxima' : 'próximas'}
                </span>
              )}
            </div>

            {/* Aviso discreto por operador uma só vez no topo do grupo */}
            {outdatedNoticePertoDeSi && (
              <div className="px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#6B6B6B] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#6B6B6B] stroke-[2] shrink-0" />
                <span>Horários {outdatedNoticePertoDeSi} podem estar desatualizados</span>
              </div>
            )}

            {/* A carregar durante importação ou próximas partidas (dos próximos 90 minutos) */}
            {isDbLoading && sortedNearLines.length === 0 ? (
              <div className="p-4 border border-[#E6E6E3] rounded-[8px] text-xs text-[#6B6B6B] flex items-center justify-center gap-2 bg-[#FFFFFF]">
                <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2]" />
                <span>{dbLoadingMessage || 'A carregar horários…'}</span>
              </div>
            ) : upcomingNearLines.length > 0 ? (
              <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
                {upcomingNearLines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    onClick={() => setSelectedLineId(line.id)}
                    isFavorite={favoriteLineIds.includes(line.id)}
                    onToggleFavorite={(e, id) => {
                      e.stopPropagation();
                      toggleFavoriteLine(id);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="p-4 border border-[#E6E6E3] rounded-[8px] text-xs text-[#6B6B6B] text-center bg-[#FFFFFF]">
                Sem partidas previstas nos próximos 90 minutos.
              </div>
            )}

            {/* Grupo Mais tarde (> 90 min, ex.: linhas noturnas 7M, 8M) com hora em grande */}
            {laterNearLines.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-sm font-semibold text-[#6B6B6B] uppercase tracking-wide font-['Barlow_Condensed']">
                    Mais tarde
                  </h3>
                  <span className="text-xs text-[#6B6B6B]">
                    Horário previsto
                  </span>
                </div>

                <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
                  {laterNearLines.map((line) => (
                    <LineCard
                      key={line.id}
                      line={line}
                      onClick={() => setSelectedLineId(line.id)}
                      isFavorite={favoriteLineIds.includes(line.id)}
                      onToggleFavorite={(e, id) => {
                        e.stopPropagation();
                        toggleFavoriteLine(id);
                      }}
                      showExactTimeAsBig={true}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Favoritos */}
        {favoriteLines.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">
                Favoritas
              </h2>
              <span className="font-['Barlow_Condensed'] text-xs font-bold text-[#6B6B6B] tabular-nums">
                {favoriteLines.length}
              </span>
            </div>

            <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
              {favoriteLines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onClick={() => setSelectedLineId(line.id)}
                  isFavorite={true}
                  onToggleFavorite={(e, id) => {
                    e.stopPropagation();
                    toggleFavoriteLine(id);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Todas as Linhas */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#111111]">
              Linhas
            </h2>
            {allLinesTotal > 0 && (
              <span className="font-['Barlow_Condensed'] text-xs font-bold text-[#6B6B6B] tabular-nums">
                {allLinesTotal}
              </span>
            )}
          </div>

          {isDbLoading || isAllLinesLoading ? (
            <div className="p-8 text-center text-xs text-[#6B6B6B] flex items-center justify-center gap-2 border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF]">
              <RefreshCw className="w-5 h-5 animate-spin text-[#111111]" />
              <span>{dbLoadingMessage || 'A carregar horários…'}</span>
            </div>
          ) : allLines.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#6B6B6B] border border-[#E6E6E3] rounded-[8px]">
              Sem linhas para os filtros indicados.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
                {allLines.map((line) => (
                  <LineCard
                    key={line.id}
                    line={line}
                    onClick={() => setSelectedLineId(line.id)}
                    isFavorite={favoriteLineIds.includes(line.id)}
                    onToggleFavorite={(e, id) => {
                      e.stopPropagation();
                      toggleFavoriteLine(id);
                    }}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs">
                  <button
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] disabled:opacity-40 font-semibold cursor-pointer min-h-[36px]"
                  >
                    Anterior
                  </button>

                  <span className="font-['Barlow_Condensed'] text-xs text-[#6B6B6B] tabular-nums">
                    Página {currentPage} de {totalPages}
                  </span>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] disabled:opacity-40 font-semibold cursor-pointer min-h-[36px]"
                  >
                    Seguinte
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Line Detail Modal */}
      {selectedLineId && (
        <LineDetailModal
          lineId={selectedLineId}
          onClose={() => setSelectedLineId(null)}
          userCoords={userCoords}
          isFavorite={favoriteLineIds.includes(selectedLineId)}
          onToggleFavorite={(id) => toggleFavoriteLine(id)}
        />
      )}
    </div>
  );
};

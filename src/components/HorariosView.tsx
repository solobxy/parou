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
  Database,
  LocateFixed,
  History
} from 'lucide-react';
import { registarLinhaVista, linhasPreferidas, registarPesquisa, pesquisasRecentes, esquecerPesquisas, guardarLinhasPerto, linhasPertoGuardadas } from '../utils/historicoLinhas';
import { 
  ApiLineItem,
  fetchLinesNear,
  fetchLinesByIds,
  searchAllLines
} from '../services/transitApi';
import { completarLinhasUnir } from '../services/unirPerto';
import { FilterState } from '../types';
import { LineCard } from './LineCard';
import { LineDetailModal } from './LineDetailModal';
import { sortDepartures, parseDepartureTime } from '../utils/transitFormatter';
import { lembrarPosicao, ultimaPosicaoConhecida } from '../hooks/useUserLocation';
import { addFavorite, removeFavorite, getLocalFavorites } from '../services/favoritesService';
import { t, tn } from '../i18n';

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
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(() => {
    const p = ultimaPosicaoConhecida();
    return p ? { lat: p.latitude, lon: p.longitude } : null;
  });
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
  // Favoritos repostos a partir da cópia no servidor (o browser tinha-os apagado)
  useEffect(() => {
    const reler = () => {
      try {
        const raw = localStorage.getItem('parou_favorite_line_ids');
        setFavoriteLineIds(raw ? JSON.parse(raw) : []);
      } catch {}
    };
    window.addEventListener('parou_dados_repostos', reler);
    return () => window.removeEventListener('parou_dados_repostos', reler);
  }, []);
  const [favoriteLines, setFavoriteLines] = useState<ApiLineItem[]>([]);
  useEffect(() => {
    for (const l of [...nearLines, ...allLines, ...favoriteLines]) linhasConhecidasRef.current.set(l.id, l);
  });
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

  // Line Detail Modal (abre logo se o endereço trouxer ?linha=…, ex.: vindo da página pública da linha)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('linha');
      if (id) {
        const url = new URL(window.location.href);
        url.searchParams.delete('linha');
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
      }
      return id && id.length < 120 ? id : null;
    } catch {
      return null;
    }
  });

  // Quando uma linha é tirada (ou posta) no separador Favoritos, a estrela daqui acompanha
  const linhasNosFavoritos = () => new Set(getLocalFavorites().filter((f) => f.id.startsWith('line-')).map((f) => f.id.slice(5)));
  const linhasNosFavoritosRef = useRef<Set<string>>(linhasNosFavoritos());
  useEffect(() => {
    const aoMudar = () => {
      const agora = linhasNosFavoritos();
      const antes = linhasNosFavoritosRef.current;
      const removidas = [...antes].filter((id) => !agora.has(id));
      const adicionadas = [...agora].filter((id) => !antes.has(id));
      linhasNosFavoritosRef.current = agora;
      if (removidas.length === 0 && adicionadas.length === 0) return;
      // Parte do que está guardado agora (pode ter sido reposto da cópia no servidor),
      // nunca do estado antigo da página — senão perdiam-se linhas favoritas
      let guardadas: string[] = [];
      try {
        const v = JSON.parse(localStorage.getItem('parou_favorite_line_ids') || '[]');
        if (Array.isArray(v)) guardadas = v;
      } catch {}
      const conj = new Set(guardadas);
      removidas.forEach((id) => conj.delete(id));
      adicionadas.forEach((id) => conj.add(id));
      const next = Array.from(conj);
      try { localStorage.setItem('parou_favorite_line_ids', JSON.stringify(next)); } catch {}
      setFavoriteLineIds(next);
    };
    window.addEventListener('parou_favorites_updated', aoMudar);
    return () => window.removeEventListener('parou_favorites_updated', aoMudar);
  }, []);

  // Linhas conhecidas (para a estrela também pôr a linha no separador Favoritos)
  const linhasConhecidasRef = useRef<Map<string, ApiLineItem>>(new Map());
  const toggleFavoriteLine = useCallback((lineId: string) => {
    let agoraFavorita = false;
    setFavoriteLineIds((prevEstado) => {
      // O que está guardado manda (pode ter sido reposto entretanto)
      let prev = prevEstado;
      try {
        const v = JSON.parse(localStorage.getItem('parou_favorite_line_ids') || 'null');
        if (Array.isArray(v)) prev = v;
      } catch {}
      const exists = prev.includes(lineId);
      agoraFavorita = !exists;
      const next = exists ? prev.filter((id) => id !== lineId) : [...prev, lineId];
      try {
        localStorage.setItem('parou_favorite_line_ids', JSON.stringify(next));
      } catch {}
      return next;
    });
    // Mesma lista que o separador Favoritos (antes eram duas listas separadas)
    setTimeout(() => {
      const linha = linhasConhecidasRef.current.get(lineId);
      if (agoraFavorita) {
        addFavorite({
          id: `line-${lineId}`,
          type: 'linha',
          category: 'transportes',
          title: linha?.name || linha?.code || lineId,
          subtitle: linha?.operator,
          lineCode: linha?.code,
          lineName: linha?.name,
          lineColor: linha?.color,
          operatorId: linha?.operator_id,
          operatorName: linha?.operator,
        } as any).catch(() => {});
      } else {
        removeFavorite(`line-${lineId}`).catch(() => {});
      }
    }, 0);
  }, []);

  // Posição: usa logo a última conhecida (do Perto ou de outra visita) e depois atualiza
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        lembrarPosicao({
          latitude: lat, longitude: lon, accuracy: Math.round(pos.coords.accuracy || 10),
          heading: null, speed: null, timestamp: pos.timestamp || Date.now(), source: 'gps_high', isManual: false,
        });
        // Só troca se mudou mais de ~100 m (evita pedir tudo outra vez por nada)
        setUserCoords((atual) =>
          atual && Math.abs(atual.lat - lat) < 0.001 && Math.abs(atual.lon - lon) < 0.001 ? atual : { lat, lon },
        );
      },
      () => {},
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 30000 }
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
          // Linhas da UNIR (horários na AMP): mostra já as outras e completa estas logo a seguir
          const comUnir = res.lines.some((l: ApiLineItem) => l.horario_externo);
          if (comUnir) {
            const jaCompletas = res.lines.filter((l: ApiLineItem) => !l.horario_externo);
            // Só na primeira vez: nas atualizações a cada 30 s a UNIR mantém-se no ecrã até chegarem os dados novos
            if (!lastNearLines.some((l) => l.horario_externo)) {
              lastNearLines = jaCompletas;
              setNearLines(jaCompletas);
            }
            const completas = await completarLinhasUnir(res.lines).catch(() => jaCompletas);
            lastNearLines = completas;
            setNearLines(completas);
            guardarLinhasPerto(completas.map((l: ApiLineItem) => l.id));
          } else {
            lastNearLines = res.lines;
            setNearLines(res.lines);
            guardarLinhasPerto(res.lines.map((l: ApiLineItem) => l.id));
          }
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
    // Atualiza a cada 30 s para o tempo real (STCP, Carris Metropolitana) não ficar parado
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadNearLines();
    }, 30000);
    return () => clearInterval(t);
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

  // Abrir uma linha: fica nas "tuas linhas" e, se veio de uma pesquisa, guarda a pesquisa
  const abrirLinha = useCallback((id: string) => {
    registarLinhaVista(id);
    if (searchQuery.trim().length >= 2) registarPesquisa(searchQuery);
    setSelectedLineId(id);
  }, [searchQuery]);

  // As tuas linhas (mais vistas / recentes) e as que estavam perto da última vez
  const [tuasLinhas, setTuasLinhas] = useState<ApiLineItem[]>([]);
  const [linhasUltimaVez, setLinhasUltimaVez] = useState<ApiLineItem[]>([]);
  const [pesquisas, setPesquisas] = useState<string[]>(() => pesquisasRecentes());
  useEffect(() => {
    const ids = linhasPreferidas(8).filter((id) => !favoriteLineIds.includes(id));
    if (!ids.length) { setTuasLinhas([]); return; }
    let cancelado = false;
    fetchLinesByIds(ids)
      .then((lines) => {
        if (cancelado) return;
        const ordem = new Map(ids.map((id, i) => [id, i]));
        setTuasLinhas([...lines].sort((a, b) => (ordem.get(a.id) ?? 99) - (ordem.get(b.id) ?? 99)));
      })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [favoriteLineIds, selectedLineId]);
  useEffect(() => {
    if (userCoords) { setLinhasUltimaVez([]); return; }
    const guardadas = linhasPertoGuardadas();
    if (!guardadas) return;
    let cancelado = false;
    fetchLinesByIds(guardadas.ids).then((lines) => { if (!cancelado) setLinhasUltimaVez(lines); }).catch(() => {});
    return () => { cancelado = true; };
  }, [userCoords]);
  useEffect(() => { if (!selectedLineId) setPesquisas(pesquisasRecentes()); }, [selectedLineId]);

  // Ativar a localização aqui mesmo (sem ir ao Perto)
  const [aLocalizar, setALocalizar] = useState(false);
  const [erroLocalizacao, setErroLocalizacao] = useState('');
  const ativarLocalizacao = () => {
    if (!('geolocation' in navigator)) { setErroLocalizacao(t('Este browser não dá a localização.')); return; }
    setALocalizar(true);
    setErroLocalizacao('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setALocalizar(false);
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, heading: null, speed: null, timestamp: Date.now(), isManual: false, source: 'gps_high' as const };
        try { localStorage.setItem('parou_localizacao_ok', '1'); } catch {}
        lembrarPosicao(c);
        setUserCoords({ lat: c.latitude, lon: c.longitude });
      },
      (err) => {
        setALocalizar(false);
        setErroLocalizacao(err.code === 1 ? t('Permite a localização nas definições do browser.') : t('Não foi possível obter a tua posição.'));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  };

  const aPesquisar = searchQuery.trim().length > 0;
  const idsMostrados = new Set<string>([...(userCoords ? nearLines.map((l) => l.id) : []), ...favoriteLines.map((l) => l.id)]);
  const tuasLinhasVisiveis = tuasLinhas.filter((l) => !idsMostrados.has(l.id)).slice(0, 6);

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
              placeholder={t('Pesquisar número de linha ou destino...')}
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
                  {t(mode.label)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
        {/* Pesquisas recentes (só com a pesquisa vazia) */}
        {!aPesquisar && pesquisas.length > 0 && (
          <section className="space-y-2" data-teste="pesquisas-recentes">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[#6B6B6B] flex items-center gap-1.5">
                <History className="w-4 h-4" aria-hidden="true" /> {t('Pesquisas recentes')}
              </h2>
              <button
                onClick={() => { esquecerPesquisas(); setPesquisas([]); }}
                className="text-[12px] font-semibold text-[#6B6B6B] min-h-[36px] px-1 cursor-pointer"
              >
                {t('Limpar')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pesquisas.map((q) => (
                <button
                  key={q}
                  onClick={() => { setSearchQuery(q); setCurrentPage(1); }}
                  className="h-9 px-3 rounded-full bg-[#F4F4F2] text-[13px] font-semibold text-[#111111] cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Sem localização: convite para ativar + as linhas que estavam perto da última vez */}
        {!aPesquisar && !userCoords && (
          <section className="rounded-[14px] border border-[#E6E6E3] p-4 flex items-start gap-3" data-teste="horarios-sem-localizacao">
            <div className="w-10 h-10 rounded-full bg-[#F4F4F2] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-[#111111]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-[#111111] leading-snug">{t('Vê primeiro as linhas perto de ti')}</div>
              <p className="text-[13px] text-[#6B6B6B] mt-0.5 leading-snug">{t('Com a localização ligada, mostramos as próximas partidas das linhas à tua volta.')}</p>
              {erroLocalizacao && <p className="text-[12.5px] text-[#D92D20] mt-1.5">{erroLocalizacao}</p>}
              <button
                onClick={ativarLocalizacao}
                disabled={aLocalizar}
                className="mt-2.5 h-10 px-3.5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {aLocalizar ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                {aLocalizar ? t('A localizar…') : t('Ativar localização')}
              </button>
            </div>
          </section>
        )}
        {!aPesquisar && !userCoords && linhasUltimaVez.length > 0 && (
          <section className="space-y-2" data-teste="linhas-ultima-vez">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">{t('Perto da última vez')}</h2>
              <span className="font-condensada text-xs font-bold text-[#6B6B6B] tabular-nums">{linhasUltimaVez.length}</span>
            </div>
            <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
              {linhasUltimaVez.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onClick={() => abrirLinha(line.id)}
                  isFavorite={favoriteLineIds.includes(line.id)}
                  onToggleFavorite={(e, id) => { e.stopPropagation(); toggleFavoriteLine(id); }}
                  mostrarOperador
                />
              ))}
            </div>
          </section>
        )}

        {/* Perto de si */}
        {!aPesquisar && userCoords && (sortedNearLines.length > 0 || isDbLoading) && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">
                {t('Perto de ti')}
              </h2>
              {sortedNearLines.length > 0 && (
                <span className="font-condensada text-xs font-bold text-[#6B6B6B] tabular-nums">
                  {tn(upcomingNearLines.length, '{n} próxima', '{n} próximas')}
                </span>
              )}
            </div>

            {/* Aviso discreto por operador uma só vez no topo do grupo */}
            {outdatedNoticePertoDeSi && (
              <div className="px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#6B6B6B] flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#6B6B6B] stroke-[2] shrink-0" />
                <span>{t('Horários {op} podem estar desatualizados', { op: outdatedNoticePertoDeSi })}</span>
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
                    onClick={() => abrirLinha(line.id)}
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
                {t('Sem partidas previstas nos próximos 90 minutos.')}
              </div>
            )}

            {/* Grupo Mais tarde (> 90 min, ex.: linhas noturnas 7M, 8M) com hora em grande */}
            {laterNearLines.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-sm font-semibold text-[#6B6B6B] uppercase tracking-wide font-condensada">
                    {t('Mais tarde')}
                  </h3>
                  <span className="text-xs text-[#6B6B6B]">
                    {t('Horário previsto')}
                  </span>
                </div>

                <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
                  {laterNearLines.map((line) => (
                    <LineCard
                      key={line.id}
                      line={line}
                      onClick={() => abrirLinha(line.id)}
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
        {!aPesquisar && favoriteLines.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">
                {t('Favoritas')}
              </h2>
              <span className="font-condensada text-xs font-bold text-[#6B6B6B] tabular-nums">
                {favoriteLines.length}
              </span>
            </div>

            <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
              {favoriteLines.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onClick={() => abrirLinha(line.id)}
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

        {/* As tuas linhas: as que mais abres (as mais recentes pesam mais) */}
        {!aPesquisar && tuasLinhasVisiveis.length > 0 && (
          <section className="space-y-2" data-teste="tuas-linhas">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#111111]">{t('As tuas linhas')}</h2>
              <span className="text-xs text-[#6B6B6B]">{t('Mais vistas')}</span>
            </div>
            <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
              {tuasLinhasVisiveis.map((line) => (
                <LineCard
                  key={line.id}
                  line={line}
                  onClick={() => abrirLinha(line.id)}
                  isFavorite={favoriteLineIds.includes(line.id)}
                  onToggleFavorite={(e, id) => { e.stopPropagation(); toggleFavoriteLine(id); }}
                  mostrarOperador
                />
              ))}
            </div>
          </section>
        )}

        {/* Todas as Linhas */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold text-[#111111]">
              {aPesquisar ? t('Resultados') : t('Todas as linhas')}
            </h2>
            {allLinesTotal > 0 && (
              <span className="font-condensada text-xs font-bold text-[#6B6B6B] tabular-nums">
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
              {t('Sem linhas para os filtros indicados.')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
                {allLines.map((line) => (
                  <LineCard
                    key={line.id}
                    mostrarOperador
                    line={line}
                    onClick={() => abrirLinha(line.id)}
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
                    {t('Anterior')}
                  </button>

                  <span className="font-condensada text-xs text-[#6B6B6B] tabular-nums">
                    {t('Página {a} de {b}', { a: currentPage, b: totalPages })}
                  </span>

                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] disabled:opacity-40 font-semibold cursor-pointer min-h-[36px]"
                  >
                    {t('Seguinte')}
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

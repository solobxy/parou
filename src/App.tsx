import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  AlertTriangle, 
  MapPin, 
  SlidersHorizontal, 
  Clock, 
  MessageSquare, 
  CheckCircle2, 
  ExternalLink, 
  Train, 
  Bus, 
  Car, 
  ShieldAlert,
  ArrowRight,
  Search
} from 'lucide-react';
import { Header } from './components/Header';
import { Logo } from './components/Logo';
import { TopLoadingBanner } from './components/TopLoadingBanner';
import { PortugalMap } from './components/PortugalMap';
import { FeaturedOccurrence } from './components/FeaturedOccurrence';
import { ImportantOccurrencesList } from './components/ImportantOccurrencesList';
import { FiltersPanel } from './components/FiltersPanel';
import { RecentOccurrencesFeed } from './components/RecentOccurrencesFeed';
import { ReportsView } from './components/ReportsView';
import { ReportModal } from './components/ReportModal';
import { OccurrenceDetailModal } from './components/OccurrenceDetailModal';
import { ReportDetailPage } from './components/ReportDetailPage';
import { HorariosView } from './components/HorariosView';
import { NationalTransitCatalogView } from './components/NationalTransitCatalogView';
import { ReclamacoesView } from './components/ReclamacoesView';
import { AlertasView } from './components/AlertasView';
import { PertoView } from './components/PertoView';
import { LoginModal } from './components/LoginModal';
import { UserProfileModal } from './components/UserProfileModal';
import { AdminModerationModal } from './components/AdminModerationModal';
import { NotificationModal } from './components/NotificationModal';
import { NotificationToast } from './components/NotificationToast';
import { PublicSourcesModal } from './components/PublicSourcesModal';
import { MobileNav, MobileTab } from './components/MobileNav';
import { LiveSyncBar } from './components/LiveSyncBar';
import { ExpandedFiltersBar } from './components/ExpandedFiltersBar';
import { MobileFilterModal } from './components/MobileFilterModal';
import { FavoritosView } from './components/FavoritosView';
import { CoverageView } from './components/CoverageView';
import { NotFoundView } from './components/NotFoundView';
import { useFavorites } from './hooks/useFavorites';
import { useOfflineReports } from './hooks/useOfflineReports';

import {
  CIDADES_OPTIONS,
} from './data/mockData';
import { Occurrence, FilterState, UserProfile, Complaint, NotificationPreferences, NotificationLogItem } from './types';
import { 
  matchOccurrence, 
  matchTransitLine, 
  countActiveFilters, 
  DEFAULT_FILTERS 
} from './utils/filterUtils';
import { fetchTransitLines } from './services/transitApi';
import { 
  getStoredNotificationPreferences, 
  dispatchOccurrenceNotification 
} from './services/notifications';
import { 
  auth,
  testConnection, 
  seedReportsIfEmpty, 
  subscribeReports, 
  subscribeComplaints,
  createReport, 
  upvoteReport, 
  updateReport,
  ensureUserProfile,
  subscribeUserProfile,
  getVoterId,
  voteOccurrence,
  fetchReportById
} from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
  // Navigation & View state - abrir sempre inicialmente a aba 'perto' em vez do mapa
  const [activeNavTab, setActiveNavTab] = useState<'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas' | 'coverage'>('perto');
  const [activeMobileView, setActiveMobileView] = useState<MobileTab>('perto');
  // Ecrã grande (computador) ou telemóvel: só um dos dois layouts é montado
  const [ecraGrande, setEcraGrande] = useState<boolean>(() => {
    try { return window.matchMedia('(min-width: 1024px)').matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(min-width: 1024px)'); } catch { return; }
    const mudar = () => setEcraGrande(mq.matches);
    mq.addEventListener?.('change', mudar);
    return () => mq.removeEventListener?.('change', mudar);
  }, []);
  // Perto no telemóvel: página presa (sem deslizar) para o cabeçalho ficar sempre à vista
  useEffect(() => {
    const prender = !ecraGrande && activeMobileView === 'perto';
    document.documentElement.classList.toggle('pagina-fixa', prender);
    if (prender) window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove('pagina-fixa');
  }, [ecraGrande, activeMobileView]);
  const [mapViewMode, setMapViewMode] = useState<'cidades' | 'concelhos' | 'distritos'>('cidades');
  const [pertoInitialDestination, setPertoInitialDestination] = useState<{ title: string; lat: number; lon: number } | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  // Unified Favorites Hook
  const { favorites, totalCount: favoritesTotalCount } = useFavorites();

  // Real-time synchronization state
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Occurrences state - Zero fake data, strictly real reports from Firestore or verified feeds
  const [featuredOccurrences, setFeaturedOccurrences] = useState<Occurrence[]>([]);
  const [importantOccurrences, setImportantOccurrences] = useState<Occurrence[]>([]);
  const [recentOccurrences, setRecentOccurrences] = useState<Occurrence[]>([]);

  // IndexedDB Offline Storage & Network State
  const {
    isOffline,
    offlineCount,
    lastOfflineSync,
    saveReportsToCache,
    loadCachedReports,
  } = useOfflineReports();

  // Helper to distribute occurrences into recent, featured, and important lists
  const applyOccurrencesData = (reports: Occurrence[]) => {
    setRecentOccurrences(reports);
    const breaking = reports.filter(r => r.isBreaking || r.severity === 'Grave');
    if (breaking.length > 0) {
      setFeaturedOccurrences(breaking.slice(0, 5));
    } else {
      setFeaturedOccurrences(reports.slice(0, 3));
    }
    setImportantOccurrences(reports.slice(0, 5));
  };

  // Pre-load cached reports from IndexedDB on startup (instant display & offline guarantee)
  useEffect(() => {
    loadCachedReports().then((cached) => {
      if (cached && cached.length > 0) {
        setRecentOccurrences((prev) => {
          if (prev.length === 0) {
            applyOccurrencesData(cached);
            return cached;
          }
          return prev;
        });
      }
    });
  }, [loadCachedReports]);

  // When connection drops to offline, ensure local IndexedDB reports are populated
  useEffect(() => {
    if (isOffline) {
      loadCachedReports().then((cached) => {
        if (cached && cached.length > 0) {
          applyOccurrencesData(cached);
        }
      });
    }
  }, [isOffline, loadCachedReports]);

  // User Profile & Authentication state
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false);

  // Selection & Modals state
  const [selectedOccurrence, setSelectedOccurrence] = useState<Occurrence | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isPublicSourcesModalOpen, setIsPublicSourcesModalOpen] = useState(false);
  const [complaintsList, setComplaintsList] = useState<Complaint[]>([]);

  // Notifications state
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences>(getStoredNotificationPreferences());
  const [activeNotificationToast, setActiveNotificationToast] = useState<NotificationLogItem | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const knownReportIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef<boolean>(true);
  const notificationPrefsRef = useRef<NotificationPreferences>(notificationPrefs);

  useEffect(() => {
    notificationPrefsRef.current = notificationPrefs;
  }, [notificationPrefs]);

  // Filters state - strictly initialized to 'Todas' (no district pre-selected)
  const [selectedDistrictOnMap, setSelectedDistrictOnMap] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isMobileFilterModalOpen, setIsMobileFilterModalOpen] = useState(false);

  // Real-time Firestore synchronization on mount
  useEffect(() => {
    // 1. Validate connection to Firestore as per Firebase skill
    testConnection();

    // 2. Initialize Firestore database with seed occurrences if empty
    seedReportsIfEmpty();

    // 3. Subscribe to real-time reports
    const unsubscribeReports = subscribeReports(
      (liveReports) => {
        if (liveReports && liveReports.length > 0) {
          // Monitor for incoming occurrences to trigger notifications
          if (isFirstLoadRef.current) {
            liveReports.forEach((r) => knownReportIdsRef.current.add(r.id));
            isFirstLoadRef.current = false;
          } else {
            liveReports.forEach(async (report) => {
              if (!knownReportIdsRef.current.has(report.id)) {
                knownReportIdsRef.current.add(report.id);
                const logItem = await dispatchOccurrenceNotification(report, notificationPrefsRef.current);
                if (logItem) {
                  setActiveNotificationToast(logItem);
                  setUnreadNotificationsCount((prev) => prev + 1);
                }
              }
            });
          }

          applyOccurrencesData(liveReports);

          // Persist latest reports into IndexedDB for offline resilience
          saveReportsToCache(liveReports);
        } else {
          // If Firestore returns empty while offline, keep local cached data
          if (!isOffline) {
            setRecentOccurrences([]);
            setFeaturedOccurrences([]);
            setImportantOccurrences([]);
          }
        }
        setLastUpdated(new Date());
        setIsSyncing(false);
      },
      (err) => {
        console.warn('Real-time reports sync notice (recuperando do IndexedDB):', err);
        setIsSyncing(false);
        // Fallback to IndexedDB when network error happens
        loadCachedReports().then((cached) => {
          if (cached && cached.length > 0) {
            applyOccurrencesData(cached);
          }
        });
      }
    );

    // 3.1 Subscribe to complaints for moderation monitoring
    const unsubscribeComplaints = subscribeComplaints(
      (liveComplaints) => {
        setComplaintsList(liveComplaints);
      },
      (err) => {
        console.warn('Real-time complaints sync notice:', err);
      }
    );

    // 4. Listen to Firebase Auth state & subscribe to real-time reputation profile
    let profileUnsub: (() => void) | null = null;
    const authUnsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const profile = await ensureUserProfile(fbUser);
          setCurrentUserProfile(profile);

          if (profileUnsub) profileUnsub();
          profileUnsub = subscribeUserProfile(fbUser.uid, (updatedProfile) => {
            if (updatedProfile) setCurrentUserProfile(updatedProfile);
          });
        } catch (err) {
          console.warn('Error loading user profile:', err);
        }
      } else {
        if (profileUnsub) profileUnsub();
        setCurrentUserProfile(null);
      }
    });

    return () => {
      unsubscribeReports();
      unsubscribeComplaints();
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  // Handle filter changes across all 7 dimensions
  const handleFilterChange = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'distrito') {
        next.distrito = value as string;
        next.concelho = 'Todos';
        if (value !== 'Todos' && CIDADES_OPTIONS.includes(value as string)) {
          next.cidade = value as string;
        }
        setSelectedDistrictOnMap(value === 'Todos' ? null : (value as string));
      }
      if (key === 'cidade') {
        setSelectedDistrictOnMap(value === 'Todas' ? null : (value as string));
      }
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSelectedDistrictOnMap(null);
  }, []);

  const handleDistrictSelectFromMap = (districtName: string | null) => {
    setSelectedDistrictOnMap(districtName);
    setFilters((prev) => ({
      ...prev,
      distrito: districtName || 'Todos',
      cidade: districtName || 'Todas',
      concelho: 'Todos',
    }));
  };

  // Filter recent occurrences list with unified 7-dimensional matcher
  const filteredRecentOccurrences = useMemo(() => {
    return recentOccurrences.filter((item) => matchOccurrence(item, filters));
  }, [recentOccurrences, filters]);

  // Unified occurrences list for the dedicated Reports page
  const allReportsList = useMemo(() => {
    const map = new Map<string, Occurrence>();
    featuredOccurrences.forEach((o) => map.set(o.id, o));
    importantOccurrences.forEach((o) => map.set(o.id, o));
    recentOccurrences.forEach((o) => map.set(o.id, o));
    return Array.from(map.values());
  }, [featuredOccurrences, importantOccurrences, recentOccurrences]);

  // Dynamic real-time district counts computed directly from Firestore reports
  const districtCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allReportsList.forEach((report) => {
      if (report.district) {
        const key = report.district.trim().toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return counts;
  }, [allReportsList]);

  // Real-time automatic statistics counters
  const totalAlertsCount = allReportsList.length;
  const severeCount = useMemo(() => allReportsList.filter((r) => r.severity === 'Grave' || r.type === 'CORTE').length, [allReportsList]);
  const districtsWithAlertsCount = useMemo(() => Object.keys(districtCounts).length, [districtCounts]);
  const verifiedCount = useMemo(() => allReportsList.filter((r) => r.isCommunityVerified).length, [allReportsList]);
  const publicReportsCount = useMemo(() => allReportsList.filter((r) => !!r.sourceName || !!r.sourceType).length, [allReportsList]);

  // Synchronized counts matching the 7 active filters for both Reports & Transportes
  const matchingReportsCount = useMemo(() => {
    return allReportsList.filter((item) => matchOccurrence(item, filters)).length;
  }, [allReportsList, filters]);

  const [matchingTransitCount, setMatchingTransitCount] = useState<number>(0);

  useEffect(() => {
    fetchTransitLines(filters).then((lines) => {
      setMatchingTransitCount(lines.length);
    }).catch(() => {
      setMatchingTransitCount(0);
    });
  }, [filters]);

  // Pending moderation items count (anti-spam and community flags)
  const pendingModerationCount = useMemo(() => {
    const reportsFlagged = allReportsList.filter(
      (r) => (r.reportsCount && r.reportsCount > 0) || r.status === 'Em análise'
    ).length;
    const complaintsFlagged = complaintsList.filter(
      (c) => (c.reportsCount && c.reportsCount > 0) || c.status === 'Em análise'
    ).length;
    return reportsFlagged + complaintsFlagged;
  }, [allReportsList, complaintsList]);

  // User personal reports for profile history
  const userPersonalReports = useMemo(() => {
    if (!currentUserProfile) return [];
    return allReportsList.filter((r) => r.authorId === currentUserProfile.userId);
  }, [allReportsList, currentUserProfile]);

  // Unique voter identifier for the current session/account to prevent duplicate voting
  const voterId = useMemo(() => getVoterId(currentUserProfile?.userId), [currentUserProfile]);

  // Related occurrences for the selected report detail page
  const relatedOccurrences = useMemo(() => {
    if (!selectedOccurrence) return [];
    return allReportsList.filter(
      (r) => r.id !== selectedOccurrence.id && (r.district === selectedOccurrence.district || r.type === selectedOccurrence.type)
    );
  }, [allReportsList, selectedOccurrence]);

  // Deep linking: restore selected report from URL query parameter ?reportId=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportIdParam = params.get('reportId');
    if (reportIdParam && allReportsList.length > 0 && !selectedOccurrence) {
      const found = allReportsList.find((r) => r.id === reportIdParam);
      if (found) {
        setSelectedOccurrence(found);
      } else {
        fetchReportById(reportIdParam).then((rep) => {
          if (rep) setSelectedOccurrence(rep);
        });
      }
    }
  }, [allReportsList]);

  // Keep open selected occurrence synchronized with real-time Firestore updates
  useEffect(() => {
    if (selectedOccurrence) {
      const updated = allReportsList.find((r) => r.id === selectedOccurrence.id);
      if (updated && (
        updated.confirmationsCount !== selectedOccurrence.confirmationsCount ||
        updated.unconfirmedCount !== selectedOccurrence.unconfirmedCount ||
        updated.status !== selectedOccurrence.status ||
        updated.upvotes !== selectedOccurrence.upvotes
      )) {
        setSelectedOccurrence(updated);
      }
    }
  }, [allReportsList, selectedOccurrence]);

  // Selection handler updating the URL for sharable links
  const handleSelectOccurrence = (occ: Occurrence) => {
    setSelectedOccurrence(occ);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('reportId', occ.id);
      window.history.pushState(null, '', url.toString());
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // safe fallback
    }
  };

  const handleBackFromReportDetail = () => {
    setSelectedOccurrence(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('reportId');
      window.history.pushState(null, '', url.pathname + (url.search ? url.search : ''));
    } catch {
      // safe fallback
    }
  };

  // Handle new report submission to Firestore
  const handleAddNewReport = async (newReport: Occurrence) => {
    setIsSyncing(true);
    try {
      const newId = await createReport(newReport);
      const savedReport: Occurrence = {
        ...newReport,
        id: newId || newReport.id,
      };
      setLastUpdated(new Date());
      setIsSyncing(false);
      // Show newly created report detail page
      handleSelectOccurrence(savedReport);
    } catch (err) {
      setIsSyncing(false);
      console.error('Error saving report to Firestore:', err);
      throw err;
    }
  };

  // Handle community confirmation and unconfirmation voting in Firestore
  const handleVoteOccurrence = async (id: string, action: 'confirm' | 'unconfirm') => {
    setIsSyncing(true);
    try {
      await voteOccurrence(id, action, voterId, currentUserProfile?.userId);
      setLastUpdated(new Date());
      setIsSyncing(false);
    } catch (err) {
      setIsSyncing(false);
      console.error('Error voting on occurrence:', err);
    }
  };

  // Backward compatible upvote confirmation
  const handleConfirmOccurrence = async (id: string) => {
    await handleVoteOccurrence(id, 'confirm');
  };

  // Handle status update in Firestore
  const handleUpdateReportStatus = async (id: string, newStatus: 'Ativa' | 'Em resolução' | 'Resolvida') => {
    setIsSyncing(true);
    try {
      await updateReport(id, { status: newStatus });
      setLastUpdated(new Date());
      setIsSyncing(false);
    } catch (err) {
      setIsSyncing(false);
      console.error('Error updating report status:', err);
    }
  };

  // Sync tab navigation and update canonical clean URL & Document Title
  const handleTabSelect = useCallback((tab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas' | 'coverage') => {
    setIsNotFound(false);
    setActiveNavTab(tab);
    if (tab === 'reports') setActiveMobileView('reports');
    else if (tab === 'perto') setActiveMobileView('perto');
    else if (tab === 'horarios') setActiveMobileView('horarios');
    else if (tab === 'favoritos') setActiveMobileView('favoritos');
    else if (tab === 'alertas') setActiveMobileView('alertas');
    else if (tab === 'catalogo') setActiveMobileView('catalogo');
    else if (tab === 'reclamacoes') setActiveMobileView('reclamacoes');
    else if (tab === 'coverage') setActiveMobileView('catalogo');
    else setActiveMobileView('mapa');

    const pathMap: Record<string, string> = {
      perto: '/',
      mapa: '/mapa',
      reports: '/ocorrencias',
      horarios: '/transportes',
      favoritos: '/favoritos',
      catalogo: '/catalogo',
      reclamacoes: '/reclamacoes',
      alertas: '/alertas',
      coverage: '/coverage',
    };
    const newPath = pathMap[tab] || '/';
    try {
      if (typeof window !== 'undefined' && window.location.pathname !== newPath) {
        window.history.pushState({ tab }, '', newPath);
      }
    } catch {
      // Cross-origin iframe fallback
    }

    const titlesMap: Record<string, string> = {
      perto: 'Transportes Perto de Mim — Radar em Tempo Real | PAROU',
      mapa: 'PAROU — Transportes, Atrasos, Greves e Ocorrências em Portugal',
      reports: 'Ocorrências e Perturbações em Direto em Portugal | PAROU',
      horarios: 'Transportes em Portugal — Linhas e Horários em Direto | PAROU',
      favoritos: 'Os Meus Favoritos — Transportes e Paragens | PAROU',
      catalogo: 'Catálogo Nacional de Operadores de Transporte | PAROU',
      reclamacoes: 'Portal de Reclamações de Transportes em Portugal | PAROU',
      alertas: 'Alertas — Greves, Tempo, Trânsito e Feriados | PAROU',
      coverage: 'Catálogo de Feeds & Cobertura Nacional de Transportes | PAROU',
    };
    if (titlesMap[tab]) {
      document.title = titlesMap[tab];
    }
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', `https://parou.pt${newPath}`);
    }
  }, []);

  // Resolve initial route from browser URL for clean indexing and direct navigation
  const resolveRouteFromPath = useCallback(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
    setIsNotFound(false);

    if (pathname === '/' || pathname === '' || pathname === '/perto') {
      setActiveNavTab('perto');
      setActiveMobileView('perto');
      document.title = 'Transportes Perto de Mim — Radar em Tempo Real | PAROU';
    } else if (pathname === '/mapa') {
      setActiveNavTab('mapa');
      setActiveMobileView('mapa');
      document.title = 'PAROU — Transportes, Atrasos, Greves e Ocorrências em Portugal';
    } else if (pathname === '/transportes' || pathname === '/horarios') {
      setActiveNavTab('horarios');
      setActiveMobileView('horarios');
      document.title = 'Transportes em Portugal — Linhas e Horários em Direto | PAROU';
    } else if (pathname === '/ocorrencias' || pathname === '/reports') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      document.title = 'Ocorrências e Perturbações em Direto em Portugal | PAROU';
    } else if (pathname === '/atrasos') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      handleFilterChange('categoria', 'Atrasos');
      document.title = 'Atrasos de Transportes e Trânsito em Portugal | PAROU';
    } else if (pathname === '/greves') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      handleFilterChange('categoria', 'Greve');
      document.title = 'Greves nos Transportes em Portugal — CP, Metro, Carris | PAROU';
    } else if (pathname === '/acidentes') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      handleFilterChange('categoria', 'Acidente');
      document.title = 'Acidentes de Trânsito em Portugal — Vias Condicionadas | PAROU';
    } else if (pathname === '/avarias') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      handleFilterChange('categoria', 'Avaria');
      document.title = 'Avarias Técnicas nos Transportes em Portugal | PAROU';
    } else if (pathname === '/cortes' || pathname === '/interrupcoes') {
      setActiveNavTab('reports');
      setActiveMobileView('reports');
      handleFilterChange('categoria', 'Corte');
      document.title = 'Cortes de Trânsito e Interrupções em Portugal | PAROU';
    } else if (pathname === '/catalogo') {
      setActiveNavTab('catalogo');
      setActiveMobileView('catalogo');
      document.title = 'Catálogo Nacional de Operadores de Transporte | PAROU';
    } else if (pathname === '/perto') {
      setActiveNavTab('perto');
      setActiveMobileView('perto');
      document.title = 'Transportes Perto de Mim — Radar em Tempo Real | PAROU';
    } else if (pathname === '/favoritos') {
      setActiveNavTab('favoritos');
      setActiveMobileView('favoritos');
      document.title = 'Os Meus Favoritos — Transportes e Paragens | PAROU';
    } else if (pathname === '/reclamacoes') {
      setActiveNavTab('reclamacoes');
      setActiveMobileView('reclamacoes');
      document.title = 'Portal de Reclamações de Transportes em Portugal | PAROU';
    } else if (pathname === '/alertas') {
      setActiveNavTab('alertas');
      setActiveMobileView('alertas');
      document.title = 'Alertas — Greves, Tempo, Trânsito e Feriados | PAROU';
    } else if (pathname === '/coverage' || pathname === '/cobertura') {
      setActiveNavTab('coverage');
      setActiveMobileView('catalogo');
      document.title = 'Catálogo de Feeds & Cobertura Nacional de Transportes | PAROU';
    } else if (pathname === '/404') {
      setIsNotFound(true);
      document.title = 'Página Não Encontrada (404) | PAROU';
    } else {
      setIsNotFound(true);
      document.title = 'Página Não Encontrada (404) | PAROU';
    }

    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', `https://parou.pt${pathname === '/' ? '/' : pathname}`);
    }
  }, [handleFilterChange]);

  // Only resolve route on initial mount and real browser popstate events
  useEffect(() => {
    resolveRouteFromPath();
    const handlePopState = () => {
      resolveRouteFromPath();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [resolveRouteFromPath]);

  return (
    <div className="min-h-dvh bg-[#FFFFFF] text-[#111111] flex flex-col antialiased w-full max-w-full overflow-x-clip">
      {/* Top Background Loading Banner */}
      <TopLoadingBanner />

      {/* Top Bar Navigation (includes mobile-accessible Reclamações e Favoritos) */}
      <Header
        activeTab={activeNavTab}
        onTabChange={handleTabSelect}
        searchQuery={filters.searchQuery}
        onSearchChange={(q) => handleFilterChange('searchQuery', q)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
        currentUser={currentUserProfile}
        onOpenUserProfileModal={() => setIsUserProfileModalOpen(true)}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        pendingModerationCount={pendingModerationCount}
        onOpenPublicSourcesModal={() => setIsPublicSourcesModalOpen(true)}
        publicReportsCount={publicReportsCount}
        onOpenFiltersModal={() => setIsMobileFilterModalOpen(true)}
        activeFiltersCount={countActiveFilters(filters)}
        favoritesCount={favoritesTotalCount}
        onOpenNotificationModal={() => {
          setIsNotificationModalOpen(true);
          setUnreadNotificationsCount(0);
        }}
        isNotificationActive={notificationPrefs.enabled}
        unreadNotificationsCount={unreadNotificationsCount}
      />

      {/* Main Content Area */}
      <main className={`flex-1 w-full mx-auto overflow-x-clip ${activeNavTab === 'perto' ? 'p-0 max-w-none' : 'max-w-[1600px] px-3 sm:px-6 lg:px-8 py-3 sm:py-6'}`}>
        {/* Bloco de "Tempo Real", ocorrências, filtros e reportar ocorrência — visível EXCLUSIVAMENTE na aba Mapa */}
        {activeNavTab === 'mapa' && activeMobileView === 'mapa' && !selectedOccurrence && !isNotFound && (
          <>
            <LiveSyncBar
              lastUpdated={lastUpdated}
              totalAlertsCount={totalAlertsCount}
              severeCount={severeCount}
              districtsWithAlertsCount={districtsWithAlertsCount}
              verifiedCount={verifiedCount}
              isSyncing={isSyncing}
              publicCount={publicReportsCount}
              onOpenPublicSourcesModal={() => setIsPublicSourcesModalOpen(true)}
              isOffline={isOffline}
              offlineCount={offlineCount}
            />

            <ExpandedFiltersBar
              filters={filters}
              onFilterChange={handleFilterChange}
              onResetFilters={handleResetFilters}
              reportsCount={matchingReportsCount}
              transitCount={matchingTransitCount}
              activeView={activeNavTab}
              onViewChange={handleTabSelect}
            />
          </>
        )}

        {isNotFound ? (
          <NotFoundView
            onNavigateHome={() => handleTabSelect('mapa')}
            onNavigateTab={handleTabSelect}
          />
        ) : selectedOccurrence ? (
          /* Dedicated Report Detail Page with real Firestore data */
          <ReportDetailPage
            occurrence={selectedOccurrence}
            onBack={handleBackFromReportDetail}
            voterId={voterId}
            onVote={handleVoteOccurrence}
            onSelectOccurrence={handleSelectOccurrence}
            relatedOccurrences={relatedOccurrences}
          />
        ) : (
          <>
            {/* Desktop View Routing (só no ecrã grande: assim o Perto, os mapas e os pedidos
                não ficam duplicados escondidos no telemóvel) */}
            {ecraGrande && (
            <div className="hidden lg:block">
          {activeNavTab === 'reports' ? (
            /* Dedicated Reports Page on Desktop */
            <div className="max-w-6xl mx-auto py-2">
              <ReportsView
                occurrences={allReportsList}
                onSelectOccurrence={handleSelectOccurrence}
                onOpenReportModal={() => setIsReportModalOpen(true)}
                lastUpdated={lastUpdated}
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                transitCount={matchingTransitCount}
                onViewTransit={() => handleTabSelect('horarios')}
              />
            </div>
          ) : activeNavTab === 'perto' ? (
            <div className="w-full h-[calc(100vh-3.5rem)]">
              <PertoView
                initialDestination={pertoInitialDestination}
                onClearInitialDestination={() => setPertoInitialDestination(null)}
                onSelectLineInSchedules={(lineCode) => {
                  handleFilterChange('linha', lineCode);
                  handleTabSelect('horarios');
                }}
              />
            </div>
          ) : activeNavTab === 'horarios' ? (
            <div className="max-w-5xl mx-auto py-2">
              <HorariosView 
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                matchingReportsCount={matchingReportsCount}
                onViewReports={() => handleTabSelect('reports')}
                onOpenCatalog={() => handleTabSelect('catalogo')}
              />
            </div>
          ) : activeNavTab === 'favoritos' ? (
            <div className="w-full mx-auto py-2">
              <FavoritosView
                onOpenLoginModal={() => setIsLoginModalOpen(true)}
                onNavigateToPertoWithDestination={(dest) => {
                  setPertoInitialDestination(dest);
                  handleTabSelect('perto');
                }}
                onNavigateToHorariosLine={(lineCode, opName) => {
                  handleFilterChange('linha', lineCode);
                  if (opName) handleFilterChange('operador', opName);
                  handleTabSelect('horarios');
                }}
                onNavigateToMap={() => handleTabSelect('mapa')}
              />
            </div>
          ) : activeNavTab === 'catalogo' ? (
            <div className="max-w-6xl mx-auto py-2">
              <NationalTransitCatalogView
                onBackToMap={() => handleTabSelect('mapa')}
                onSelectOperatorForReports={(opName) => {
                  handleFilterChange('operador', opName);
                  handleTabSelect('reports');
                }}
              />
            </div>
          ) : activeNavTab === 'reclamacoes' ? (
            <div className="max-w-5xl mx-auto py-2">
              <ReclamacoesView
                currentUser={currentUserProfile}
                onOpenLoginModal={() => setIsLoginModalOpen(true)}
              />
            </div>
          ) : activeNavTab === 'alertas' ? (
            <div className="w-full mx-auto py-2">
              <AlertasView
                ocorrenciasComunidade={allReportsList}
                onAbrirOcorrencia={handleSelectOccurrence}
                onVerMapa={() => handleTabSelect('mapa')}
              />
            </div>
          ) : activeNavTab === 'coverage' ? (
            <div className="w-full mx-auto py-2">
              <CoverageView onBackToMap={() => handleTabSelect('mapa')} />
            </div>
          ) : (
            /* Standard 3-Column Homepage with dynamic PortugalMap in the center */
            <div className="grid grid-cols-12 gap-5 items-start w-full">
              {/* Left Column: Hero Breaking Alert & Important Occurrences List */}
              <section className="col-span-12 lg:col-span-4 xl:col-span-4 2xl:col-span-3 space-y-5 min-w-0">
                <FeaturedOccurrence
                  occurrences={featuredOccurrences}
                  onSelectOccurrence={handleSelectOccurrence}
                />

                <ImportantOccurrencesList
                  occurrences={importantOccurrences}
                  onSelectOccurrence={handleSelectOccurrence}
                  onViewAll={() => handleTabSelect('reports')}
                />
              </section>

              {/* Central Column: Interactive Portugal Map with live Firestore counts */}
              <section className="col-span-12 lg:col-span-4 xl:col-span-4 2xl:col-span-5 flex flex-col space-y-5 min-w-0">
                <PortugalMap
                  selectedDistrict={selectedDistrictOnMap}
                  onSelectDistrict={handleDistrictSelectFromMap}
                  activeViewMode={mapViewMode}
                  onViewModeChange={setMapViewMode}
                  districtCounts={districtCounts}
                  occurrences={allReportsList}
                  onSelectOccurrence={handleSelectOccurrence}
                />
              </section>

              {/* Right Column: Report CTA, Filters & Recent Occurrences Feed */}
              <section className="col-span-12 lg:col-span-4 xl:col-span-4 2xl:col-span-4 space-y-5 min-w-0">
                {/* Primary Action Button */}
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className="w-full h-12 rounded-[8px] brand-chamfer bg-[#FF6B1A] hover:brightness-105 active:scale-[0.99] text-[#111111] font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <AlertTriangle className="w-4 h-4 stroke-[2]" />
                  <span>Reportar ocorrência</span>
                </button>

                {/* Quick Filters Panel */}
                <FiltersPanel
                  filters={filters}
                  onFilterChange={handleFilterChange}
                  onResetFilters={handleResetFilters}
                  reportsCount={matchingReportsCount}
                  transitCount={matchingTransitCount}
                />

                {/* Recent Occurrences Feed */}
                <RecentOccurrencesFeed
                  occurrences={filteredRecentOccurrences}
                  onSelectOccurrence={handleSelectOccurrence}
                  onViewAll={() => handleTabSelect('reports')}
                />
              </section>
            </div>
          )}
        </div>
            )}

        {/* Mobile View with Bottom Tab Navigation (Mapa, Alertas, Perto, Horários, Favoritos) */}
        {!ecraGrande && (
        <div className={`lg:hidden ${activeMobileView === 'perto' ? 'p-0 pb-16' : 'space-y-3.5 pb-28'}`}>
          {/* 1. Tab Mapa */}
          {activeMobileView === 'mapa' && (
            <div className="space-y-3.5">
              <PortugalMap
                selectedDistrict={selectedDistrictOnMap}
                onSelectDistrict={handleDistrictSelectFromMap}
                activeViewMode={mapViewMode}
                onViewModeChange={setMapViewMode}
                districtCounts={districtCounts}
                occurrences={allReportsList}
                onSelectOccurrence={handleSelectOccurrence}
                onReport={() => setIsReportModalOpen(true)}
              />

              {selectedDistrictOnMap ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-bold text-[#111111] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 stroke-[2] text-[#111111]" />
                      <span>Ocorrências em {selectedDistrictOnMap} ({filteredRecentOccurrences.length})</span>
                    </h3>
                    <button
                      onClick={() => handleDistrictSelectFromMap(null)}
                      className="text-xs text-[#6B6B6B] hover:text-[#111111] underline cursor-pointer"
                    >
                      Ver todas
                    </button>
                  </div>

                  <RecentOccurrencesFeed
                    occurrences={filteredRecentOccurrences}
                    onSelectOccurrence={handleSelectOccurrence}
                    onViewAll={() => handleTabSelect('reports')}
                  />
                </div>
              ) : (
                <>
                  <FeaturedOccurrence
                    occurrences={featuredOccurrences}
                    onSelectOccurrence={handleSelectOccurrence}
                  />

                  <ImportantOccurrencesList
                    occurrences={importantOccurrences}
                    onSelectOccurrence={handleSelectOccurrence}
                    onViewAll={() => setActiveMobileView('reports')}
                  />
                </>
              )}
            </div>
          )}

          {/* 2. Tab Reports (Full dedicated Reports page on mobile) */}
          {activeMobileView === 'reports' && (
            <div className="space-y-3.5">
              <ReportsView
                occurrences={allReportsList}
                onSelectOccurrence={handleSelectOccurrence}
                onOpenReportModal={() => setIsReportModalOpen(true)}
                lastUpdated={lastUpdated}
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                transitCount={matchingTransitCount}
                onViewTransit={() => setActiveMobileView('horarios')}
              />
            </div>
          )}

          {/* 3. Tab Perto (Substitui botão + na hotbar com radar e transportes locais) */}
          {activeMobileView === 'perto' && (
            <div className="w-full h-[calc(100dvh-3.5rem-1px-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
              <PertoView
                initialDestination={pertoInitialDestination}
                onClearInitialDestination={() => setPertoInitialDestination(null)}
                onSelectLineInSchedules={(lineCode) => {
                  handleFilterChange('linha', lineCode);
                  handleTabSelect('horarios');
                }}
              />
            </div>
          )}

          {/* 4. Tab Horários */}
          {activeMobileView === 'horarios' && (
            <div className="space-y-3.5">
              <HorariosView 
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                matchingReportsCount={matchingReportsCount}
                onViewReports={() => setActiveMobileView('reports')}
                onOpenCatalog={() => handleTabSelect('catalogo')}
              />
            </div>
          )}

          {/* 5. Tab Favoritos (Substitui Filtros na hotbar mobile) */}
          {(activeMobileView === 'favoritos' || activeNavTab === 'favoritos') && (
            <div className="space-y-3.5">
              <FavoritosView
                onOpenLoginModal={() => setIsLoginModalOpen(true)}
                onNavigateToPertoWithDestination={(dest) => {
                  setPertoInitialDestination(dest);
                  handleTabSelect('perto');
                }}
                onNavigateToHorariosLine={(lineCode, opName) => {
                  handleFilterChange('linha', lineCode);
                  if (opName) handleFilterChange('operador', opName);
                  handleTabSelect('horarios');
                }}
                onNavigateToMap={() => handleTabSelect('mapa')}
              />
            </div>
          )}

          {/* 4. Tab Catálogo Nacional */}
          {(activeMobileView === 'catalogo' || activeNavTab === 'catalogo') && (
            <div className="space-y-3.5">
              <NationalTransitCatalogView
                onBackToMap={() => handleTabSelect('mapa')}
                onSelectOperatorForReports={(opName) => {
                  handleFilterChange('operador', opName);
                  handleTabSelect('reports');
                }}
              />
            </div>
          )}

          {/* Tab Alertas (Mobile) */}
          {(activeMobileView === 'alertas' || activeNavTab === 'alertas') && (
            <div className="-mx-3 sm:-mx-6">
              <AlertasView
                ocorrenciasComunidade={allReportsList}
                onAbrirOcorrencia={handleSelectOccurrence}
                onVerMapa={() => handleTabSelect('mapa')}
              />
            </div>
          )}

          {/* 5. Tab Filtros */}
          {activeMobileView === 'filtros' && (
            <div className="space-y-3.5">
              <FiltersPanel
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={handleResetFilters}
                reportsCount={matchingReportsCount}
                transitCount={matchingTransitCount}
              />

              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-[#6B6B6B]">
                    Resultados ({filteredRecentOccurrences.length})
                  </h4>
                  {filters.cidade !== 'Todas' && (
                    <span className="text-xs text-[#111111] font-semibold">
                      Filtrado por: {filters.cidade}
                    </span>
                  )}
                </div>

                <RecentOccurrencesFeed
                  occurrences={filteredRecentOccurrences}
                  onSelectOccurrence={handleSelectOccurrence}
                  onViewAll={() => handleTabSelect('reports')}
                />
              </div>
            </div>
          )}

          {/* 5. View Reclamações (acessível pelo cabeçalho no mobile) */}
          {activeMobileView === 'reclamacoes' && (
            <div className="space-y-3.5">
              <ReclamacoesView
                currentUser={currentUserProfile}
                onOpenLoginModal={() => setIsLoginModalOpen(true)}
              />
            </div>
          )}

          {/* View Cobertura (/coverage) no mobile */}
          {activeNavTab === 'coverage' && (
            <div className="space-y-3.5 pb-10">
              <CoverageView onBackToMap={() => handleTabSelect('mapa')} />
            </div>
          )}
        </div>
        )}
        </>
      )}
      </main>

      {/* Footer Nacional de Transportes com Link para /coverage */}
      <footer className="w-full border-t border-[#E6E6E3] bg-[#F4F4F2] mt-auto py-5 pb-24 lg:pb-6 px-4 text-xs text-[#6B6B6B]">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-center sm:text-left">
            <Logo size={20} className="text-[#111111]" />
            <span>·</span>
            <span>Informação em direto de transportes em Portugal</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 font-medium text-xs">
            <button
              onClick={() => handleTabSelect('perto')}
              className="text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Perto
            </button>
            <button
              onClick={() => handleTabSelect('horarios')}
              className="text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Horários
            </button>
            <button
              onClick={() => handleTabSelect('alertas')}
              className="text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Alertas
            </button>
            <button
              onClick={() => handleTabSelect('reports')}
              className="text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Ocorrências
            </button>
            <button
              onClick={() => handleTabSelect('catalogo')}
              className="text-[#6B6B6B] hover:text-[#111111] transition-colors cursor-pointer"
            >
              Catálogo
            </button>
            <button
              onClick={() => handleTabSelect('coverage')}
              className={`font-bold transition-colors cursor-pointer ${
                activeNavTab === 'coverage' ? 'text-[#111111]' : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              <span>Cobertura</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmitReport={handleAddNewReport}
        currentUser={currentUserProfile}
        existingReports={allReportsList}
        onConfirmExisting={(id) => handleVoteOccurrence(id, 'confirm')}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <UserProfileModal
        isOpen={isUserProfileModalOpen}
        onClose={() => setIsUserProfileModalOpen(false)}
        user={currentUserProfile}
        userReports={userPersonalReports}
        onSelectOccurrence={handleSelectOccurrence}
        onOpenReportModal={() => setIsReportModalOpen(true)}
      />

      <AdminModerationModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        reports={allReportsList}
        complaints={complaintsList}
      />

      <NotificationModal
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        onPreferencesChange={(newPrefs) => setNotificationPrefs(newPrefs)}
        onViewReport={(reportId) => {
          const occ = allReportsList.find((r) => r.id === reportId);
          if (occ) handleSelectOccurrence(occ);
        }}
        onTestNotification={(item) => setActiveNotificationToast(item)}
        onOpenAlertCenter={() => handleTabSelect('alertas')}
      />

      <NotificationToast
        notification={activeNotificationToast}
        onClose={() => setActiveNotificationToast(null)}
        onViewReport={(reportId) => {
          const occ = allReportsList.find((r) => r.id === reportId);
          if (occ) handleSelectOccurrence(occ);
        }}
      />

      <PublicSourcesModal
        isOpen={isPublicSourcesModalOpen}
        onClose={() => setIsPublicSourcesModalOpen(false)}
        onSelectOccurrence={handleSelectOccurrence}
        allOccurrences={allReportsList}
      />

      {/* Mobile & Tablet Fullscreen Filter Drawer Modal */}
      <MobileFilterModal
        isOpen={isMobileFilterModalOpen}
        onClose={() => setIsMobileFilterModalOpen(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        matchingReportsCount={matchingReportsCount}
        matchingTransitCount={matchingTransitCount}
      />

      {/* Mobile Bottom Navigation Bar: MAPA | REPORTS | PERTO | HORÁRIOS | FAVORITOS */}
      <MobileNav
        activeMobileView={activeMobileView}
        activeFiltersCount={countActiveFilters(filters)}
        favoritesCount={favoritesTotalCount}
        onMobileViewChange={(tab) => {
          if (tab === 'filtros') {
            setIsMobileFilterModalOpen(true);
          } else {
            handleTabSelect(tab as any);
          }
        }}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        totalAlertsCount={0}
      />
    </div>
  );
}


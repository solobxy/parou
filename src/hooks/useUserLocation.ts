import { useState, useEffect, useRef, useCallback } from 'react';

export type LocationPermissionStatus = 
  | 'idle'           // Location turned off (Localização desligada)
  | 'requesting'     // User clicked "Ativar localização", waiting for browser dialog
  | 'active'         // Geolocation actively tracking (Localização ativa)
  | 'denied'         // User denied permission (Permissão recusada)
  | 'unavailable';   // GPS unavailable or error (GPS indisponível)

export interface UserCoords {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters (ex: 8m)
  heading: number | null; // heading in degrees (0-360)
  speed: number | null; // speed in m/s or km/h
  timestamp: number;
  isManual?: boolean;
  locationLabel?: string;
  source?: 'gps_high' | 'gps_low' | 'manual' | 'ip';
}

// Lembra que o utilizador já deu a localização (para browsers sem Permissions API)
const CHAVE_LOCALIZACAO_OK = 'parou_localizacao_ok';

function jaDeuLocalizacao(): boolean {
  try { return localStorage.getItem(CHAVE_LOCALIZACAO_OK) === '1'; } catch { return false; }
}

// Última posição conhecida, partilhada por todos os separadores. Fica em memória enquanto
// a app está aberta (trocar de separador não volta ao início) e a do GPS fica também no
// telemóvel, para a app abrir logo no sítio certo enquanto o GPS afina a posição.
const CHAVE_ULTIMA_POSICAO = 'parou_ultima_posicao';
const VALIDADE_POSICAO_GUARDADA_MS = 12 * 60 * 60 * 1000;
let ultimaGravacao = 0;
// Houve posição do GPS desde que a página abriu (o browser já deu autorização nesta visita)
let gpsNestaSessao = false;

function lerPosicaoGuardada(): UserCoords | null {
  try {
    if (typeof window === 'undefined' || !jaDeuLocalizacao()) return null;
    const p = JSON.parse(localStorage.getItem(CHAVE_ULTIMA_POSICAO) || 'null');
    if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
    if (Date.now() - Number(p.timestamp || 0) > VALIDADE_POSICAO_GUARDADA_MS) return null;
    return { ...p, heading: null, speed: null, isManual: false };
  } catch {
    return null;
  }
}

let memoriaPosicao: UserCoords | null = lerPosicaoGuardada();

/** Última posição conhecida (GPS ou local escolhido), ou null. */
export function ultimaPosicaoConhecida(): UserCoords | null {
  return memoriaPosicao;
}

/** Guarda a posição para os outros separadores (e a do GPS no telemóvel, no máximo a cada 15 s). */
export function lembrarPosicao(c: UserCoords | null) {
  memoriaPosicao = c;
  if (!c || c.isManual) return;
  const agora = Date.now();
  if (agora - ultimaGravacao < 15000) return;
  ultimaGravacao = agora;
  try {
    localStorage.setItem(CHAVE_ULTIMA_POSICAO, JSON.stringify({
      latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy, timestamp: c.timestamp, source: c.source,
    }));
  } catch {}
}

function esquecerPosicao() {
  memoriaPosicao = null;
  try { localStorage.removeItem(CHAVE_ULTIMA_POSICAO); } catch {}
}

export function useUserLocation() {
  // Começa já na última posição conhecida: ao voltar ao Perto o mapa não salta para Lisboa
  const [status, setStatus] = useState<LocationPermissionStatus>(() => (memoriaPosicao ? 'active' : 'idle'));
  const [coords, setCoordsEstado] = useState<UserCoords | null>(() => memoriaPosicao);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  const previousCoordsRef = useRef<UserCoords | null>(memoriaPosicao && !memoriaPosicao.isManual ? memoriaPosicao : null);
  const setCoords = useCallback((c: UserCoords | null) => {
    lembrarPosicao(c);
    setCoordsEstado(c);
  }, []);

  // Stop tracking and clean up
  const stopLocation = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('idle');
    setCoords(null);
    esquecerPosicao();
    setErrorMessage(null);
    setFollowMode(false);
  }, [setCoords]);

  // Request & activate location (with high accuracy priority + graceful standard fallback)
  const activateLocation = useCallback((forceHighAccuracy: boolean = true) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      setErrorMessage('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    // Com uma posição já conhecida o ecrã continua a mostrá-la enquanto o GPS atualiza
    if (!previousCoordsRef.current) setStatus('requesting');
    setErrorMessage(null);

    // Clear any previous watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const handleSuccess = (position: GeolocationPosition, source: 'gps_high' | 'gps_low' = 'gps_high') => {
      const lat = Number(position?.coords?.latitude);
      const lon = Number(position?.coords?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || isNaN(lat) || isNaN(lon)) {
        console.warn('[PAROU GPS] Posição com coordenadas inválidas recebida:', position?.coords);
        setStatus('unavailable');
        setErrorMessage('Sinal GPS com coordenadas inválidas.');
        return;
      }

      const newCoords: UserCoords = {
        latitude: lat,
        longitude: lon,
        accuracy: Math.round(position.coords.accuracy || 10),
        heading: position.coords.heading,
        speed: position.coords.speed ? Math.round(position.coords.speed * 3.6) : null,
        timestamp: position.timestamp || Date.now(),
        source,
        isManual: false,
      };

      // Uma leitura aproximada (rede) não substitui uma melhor e recente do GPS
      const anterior = previousCoordsRef.current;
      if (
        anterior && !anterior.isManual && gpsNestaSessao &&
        newCoords.accuracy > anterior.accuracy * 2 && newCoords.accuracy > 60 &&
        Date.now() - anterior.timestamp < 60_000
      ) {
        return;
      }

      gpsNestaSessao = true;
      setCoords(newCoords);
      setStatus('active');
      setErrorMessage(null);
      previousCoordsRef.current = newCoords;
      try { localStorage.setItem(CHAVE_LOCALIZACAO_OK, '1'); } catch {}
    };

    // 1. Posição rápida: a aproximada (rede/Wi-Fi ou a última do telemóvel) chega quase de
    //    imediato e já dá para mostrar as paragens; o GPS afina a seguir, sem a pessoa esperar.
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos, 'gps_low'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) handlePositionError(err);
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 2 * 60_000 }
    );

    // 2. Posição precisa (GPS)
    const primaryOptions: PositionOptions = {
      enableHighAccuracy: forceHighAccuracy,
      timeout: 15000,
      maximumAge: forceHighAccuracy ? 0 : 5000,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleSuccess(pos, forceHighAccuracy ? 'gps_high' : 'gps_low');
        setFollowMode(true);
      },
      (err) => {
        // If high accuracy failed or timed out, attempt lower accuracy fallback
        if (forceHighAccuracy) {
          console.warn('[PAROU GPS] Falha em Alta Precisão, a tentar fallback normal:', err.message);
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => handleSuccess(fallbackPos, 'gps_low'),
            (fallbackErr) => handlePositionError(fallbackErr),
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
          );
        } else {
          handlePositionError(err);
        }
      },
      primaryOptions
    );

    // Start watchPosition for continuous tracking
    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => handleSuccess(pos, 'gps_high'),
        (err) => {
          console.warn('[PAROU GPS watchPosition error]:', err.code, err.message);
          // If already got a position from getCurrentPosition, keep active
          if (!previousCoordsRef.current || err.code === err.PERMISSION_DENIED) {
            handlePositionError(err);
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
      );
      watchIdRef.current = id;
      setFollowMode(true);
    } catch (err) {
      console.error('[PAROU GPS] Exceção watchPosition:', err);
    }
  }, [setCoords]);

  const handlePositionError = (error: GeolocationPositionError) => {
    console.warn('[PAROU GPS] Erro de geolocalização:', error.code, error.message);
    if (error.code === error.PERMISSION_DENIED) {
      previousCoordsRef.current = null;
      setCoords(null);
      esquecerPosicao();
      setStatus('denied');
      setErrorMessage('Permissão de localização recusada no navegador.');
    } else if (previousCoordsRef.current) {
      // Falha passageira (túnel, interior): fica na última posição em vez de esconder tudo
      setStatus('active');
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      setStatus('unavailable');
      setErrorMessage('Sinal GPS temporariamente indisponível.');
    } else if (error.code === error.TIMEOUT) {
      setStatus('unavailable');
      setErrorMessage('Tempo limite esgotado ao tentar obter o sinal GPS.');
    } else {
      setStatus('unavailable');
      setErrorMessage('Erro ao obter a localização atual.');
    }
  };

  // Force refresh high-precision GPS (for "Centrar no Meu Ponto" button)
  const refreshHighAccuracyLocation = useCallback(async (): Promise<UserCoords | null> => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      return null;
    }

    setIsRefreshingGps(true);
    setFollowMode(true);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos?.coords?.latitude);
          const lon = Number(pos?.coords?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || isNaN(lat) || isNaN(lon)) {
            console.warn('[PAROU GPS] Refresh recebeu coordenadas inválidas:', pos?.coords);
            setIsRefreshingGps(false);
            resolve(previousCoordsRef.current || null);
            return;
          }

          const freshCoords: UserCoords = {
            latitude: lat,
            longitude: lon,
            accuracy: Math.round(pos.coords.accuracy || 10),
            heading: pos.coords.heading,
            speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null,
            timestamp: pos.timestamp || Date.now(),
            source: 'gps_high',
            isManual: false,
          };
          setCoords(freshCoords);
          setStatus('active');
          setErrorMessage(null);
          setIsRefreshingGps(false);
          previousCoordsRef.current = freshCoords;
          resolve(freshCoords);
        },
        (err) => {
          console.warn('[PAROU GPS] Falha no refresh de alta precisão:', err);
          setIsRefreshingGps(false);
          // If we already have previous coords, resolve them
          if (previousCoordsRef.current) {
            resolve(previousCoordsRef.current);
          } else {
            handlePositionError(err);
            resolve(null);
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }, [setCoords]);

  // Set manual coordinates when user clicks on map or searches address to fix inaccurate GPS
  const setManualLocation = useCallback((lat: number, lon: number, label?: string) => {
    const validLat = Number(lat);
    const validLon = Number(lon);
    if (!Number.isFinite(validLat) || !Number.isFinite(validLon) || isNaN(validLat) || isNaN(validLon)) {
      console.warn('[PAROU GPS] setManualLocation com coordenadas inválidas:', lat, lon);
      return;
    }

    const manualCoords: UserCoords = {
      latitude: validLat,
      longitude: validLon,
      accuracy: 5, // manual pin is exact
      heading: null,
      speed: null,
      timestamp: Date.now(),
      isManual: true,
      locationLabel: label || 'Localização Personalizada',
      source: 'manual',
    };
    setCoords(manualCoords);
    setStatus('active');
    setFollowMode(true);
  }, [setCoords]);

  // Handle user dragging / panning map -> stop auto follow
  const handleMapInteraction = useCallback(() => {
    if (followMode) {
      setFollowMode(false);
    }
  }, [followMode]);

  // Recenter on user GPS
  const recenter = useCallback(() => {
    setFollowMode(true);
    if (!coords && status !== 'active') {
      activateLocation(true);
    } else {
      refreshHighAccuracyLocation();
    }
  }, [coords, status, activateLocation, refreshHighAccuracyLocation]);

  // Ao abrir: só liga o GPS sozinho se a permissão já foi dada. Se o browser ainda não
  // perguntou, fica 'idle' e a página mostra o convite "Ativar localização" (o pedido
  // nasce de um toque do utilizador, como os browsers recomendam). Guarda o
  // PermissionStatus numa ref para o browser não o descartar (senão o onchange não dispara).
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    // Um local escolhido à mão mantém-se ao trocar de separador (não é trocado pelo GPS)
    const localEscolhido = Boolean(memoriaPosicao?.isManual);
    if (!('permissions' in navigator) || !navigator.permissions?.query) {
      if (jaDeuLocalizacao() && !localEscolhido) activateLocation(true);
      return;
    }
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
      permissionStatusRef.current = result;
      if (result.state === 'granted') {
        if (!localEscolhido) activateLocation(true);
      } else if (result.state === 'denied') {
        if (!localEscolhido) {
          previousCoordsRef.current = null;
          setCoords(null);
          esquecerPosicao();
          setStatus('denied');
          setErrorMessage('Permissão de localização recusada no navegador.');
        }
      } else if (!localEscolhido && previousCoordsRef.current && gpsNestaSessao) {
        // Alguns browsers (Safari) dizem 'prompt' mesmo depois de autorizarem nesta visita
        activateLocation(true);
      } else if (!localEscolhido && previousCoordsRef.current) {
        // A autorização foi retirada entretanto: volta ao convite para ativar
        previousCoordsRef.current = null;
        setCoords(null);
        esquecerPosicao();
        setStatus('idle');
      }
      result.onchange = () => {
        if (result.state === 'granted') {
          activateLocation(true);
        } else if (result.state === 'denied') {
          setStatus('denied');
        }
      };
    }).catch(() => {
      // Sem Permissions API para geolocalização (ex.: Safari antigo)
      if (jaDeuLocalizacao() && !localEscolhido) activateLocation(true);
    });
  }, [activateLocation, setCoords]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    status,
    coords,
    errorMessage,
    followMode,
    isRefreshingGps,
    setFollowMode,
    activateLocation,
    refreshHighAccuracyLocation,
    setManualLocation,
    stopLocation,
    recenter,
    handleMapInteraction,
  };
}

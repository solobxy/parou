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

export function useUserLocation() {
  const [status, setStatus] = useState<LocationPermissionStatus>('idle');
  const [coords, setCoords] = useState<UserCoords | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  const previousCoordsRef = useRef<UserCoords | null>(null);

  // Stop tracking and clean up
  const stopLocation = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('idle');
    setCoords(null);
    setErrorMessage(null);
    setFollowMode(false);
  }, []);

  // Request & activate location (with high accuracy priority + graceful standard fallback)
  const activateLocation = useCallback((forceHighAccuracy: boolean = true) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      setErrorMessage('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    setStatus('requesting');
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

      setCoords(newCoords);
      setStatus('active');
      setErrorMessage(null);
      previousCoordsRef.current = newCoords;
    };

    // Primary attempt: high accuracy with tight fallback
    const primaryOptions: PositionOptions = {
      enableHighAccuracy: forceHighAccuracy,
      timeout: 10000,
      maximumAge: forceHighAccuracy ? 0 : 5000,
    };

    // Immediate one-shot position check first for rapid UI centering
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
          if (!previousCoordsRef.current) {
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
  }, []);

  const handlePositionError = (error: GeolocationPositionError) => {
    console.warn('[PAROU GPS] Erro de geolocalização:', error.code, error.message);
    if (error.code === error.PERMISSION_DENIED) {
      setStatus('denied');
      setErrorMessage('Permissão de localização recusada no navegador.');
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
  }, []);

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
  }, []);

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

  // Check permissions on mount and auto-activate if already permitted
  useEffect(() => {
    if (typeof window !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'granted') {
          activateLocation(true);
        }
        result.onchange = () => {
          if (result.state === 'granted') {
            activateLocation(true);
          } else if (result.state === 'denied') {
            setStatus('denied');
          }
        };
      }).catch(() => {
        // Query not supported, do not block
      });
    }
  }, [activateLocation]);

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

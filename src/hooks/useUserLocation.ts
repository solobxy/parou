import { useState, useEffect, useRef, useCallback } from 'react';
import { filtroGps, type LeituraGps } from '../utils/filtroGps';
import { reiniciarPosicaoSuave } from '../utils/posicaoSuave';
import { ligarMovimento, estadoAparelho } from '../utils/movimentoAparelho';
import { estadoGps, vigiarGps, notaGps, contextoGps } from '../utils/diagGps';

export type LocationPermissionStatus = 
  | 'idle'           // Location turned off (Localização desligada)
  | 'requesting'     // User clicked "Ativar localização", waiting for browser dialog
  | 'active'         // Geolocation actively tracking (Localização ativa)
  | 'denied'         // User denied permission (Permissão recusada)
  | 'unavailable';   // GPS unavailable or error (GPS indisponível)

/** Porque é que a localização está bloqueada:
 *  site     - o browser bloqueou a localização para este site
 *  sistema  - o site tem autorização, mas a localização do telemóvel (ou do browser) está desligada
 *  recusado - a pessoa fechou/recusou o pedido; pedir outra vez volta a mostrar a pergunta */
export type MotivoBloqueio = 'site' | 'sistema' | 'recusado';

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
// A pessoa desligou a localização na app ("Desligar e apagar a posição guardada"): não volta a ligar sozinha ao abrir
const CHAVE_DESLIGADA = 'parou_localizacao_desligada';

function desligadaPelaPessoa(): boolean {
  try { return localStorage.getItem(CHAVE_DESLIGADA) === '1'; } catch { return false; }
}

function jaDeuLocalizacao(): boolean {
  try { return localStorage.getItem(CHAVE_LOCALIZACAO_OK) === '1'; } catch { return false; }
}

// Última posição conhecida, partilhada por todos os separadores. Fica em memória enquanto
// a app está aberta (trocar de separador não volta ao início) e a do GPS fica também no
// telemóvel, para a app abrir logo no sítio certo enquanto o GPS afina a posição.
const CHAVE_ULTIMA_POSICAO = 'parou_ultima_posicao';
// Como o Google Maps e a Moovit: ao abrir, aparece logo a última posição conhecida (até 3 dias) enquanto o GPS afina.
// Com mais de 30 min conta como aproximada (o ecrã diz «a afinar a posição…» e as paragens atualizam quando o GPS responde).
const VALIDADE_POSICAO_GUARDADA_MS = 3 * 24 * 60 * 60 * 1000;
const POSICAO_RECENTE_MS = 30 * 60 * 1000;
let ultimaGravacao = 0;
// Houve posição do GPS desde que a página abriu (o browser já deu autorização nesta visita)
let gpsNestaSessao = false;

function lerPosicaoGuardada(): UserCoords | null {
  try {
    if (typeof window === 'undefined' || !jaDeuLocalizacao()) return null;
    const p = JSON.parse(localStorage.getItem(CHAVE_ULTIMA_POSICAO) || 'null');
    if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return null;
    const idade = Date.now() - Number(p.timestamp || 0);
    if (idade > VALIDADE_POSICAO_GUARDADA_MS) return null;
    const accuracy = idade > POSICAO_RECENTE_MS ? Math.max(Number(p.accuracy) || 0, 500) : Number(p.accuracy) || 50;
    return { ...p, accuracy, heading: null, speed: null, isManual: false };
  } catch {
    return null;
  }
}

let memoriaPosicao: UserCoords | null = lerPosicaoGuardada();

// Para os registos de diagnóstico: o que está guardado no telemóvel (sem a posição) e como a app foi aberta
contextoGps(() => {
  let guardada = '-';
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_ULTIMA_POSICAO) || 'null');
    if (p && Number.isFinite(Number(p.timestamp))) guardada = `${Math.round((Date.now() - Number(p.timestamp)) / 60_000)}min`;
  } catch { /* sem posição guardada */ }
  let app = 'browser';
  try {
    if (document.referrer.startsWith('android-app://')) app = 'android';
    else if (window.matchMedia('(display-mode: standalone)').matches) app = 'instalada';
  } catch { /* sem matchMedia */ }
  return `já deu ${jaDeuLocalizacao() ? 1 : 0} | desligada na app ${desligadaPelaPessoa() ? 1 : 0} | local à mão ${memoriaPosicao?.isManual ? 1 : 0} | guardada ${guardada} | ${app}`;
});

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

/** Deixa de mostrar a posição (localização desligada ou recusada), mas guarda-a no telemóvel: quando a localização volta,
 *  aparece logo enquanto o GPS afina (antes apagava-se e a pessoa esperava ~20 s pelo GPS). Só "Desligar" na app a apaga. */
function largarPosicao() {
  memoriaPosicao = null;
}

// A posição do GPS passa por um filtro (utils/filtroGps.ts): pesa cada leitura pela sua precisão, usa a velocidade e o
// rumo medidos pelo GPS, ignora leituras más e fica quase quieto quando se está parado. O ponto no mapa desliza a cada
// fotograma (utils/posicaoSuave.ts); aqui só se guarda a posição filtrada, para o resto da app (paragens perto, distâncias).

function metrosEntrePontos(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dy = (lat2 - lat1) * 111_320;
  const dx = (lon2 - lon1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Leitura do browser no formato do filtro (velocidade e rumo só se o telemóvel os der) */
function leituraDoBrowser(position: GeolocationPosition): LeituraGps {
  const c = position.coords;
  return {
    lat: Number(c.latitude),
    lon: Number(c.longitude),
    precisao: Number(c.accuracy),
    t: Number(position.timestamp) || Date.now(),
    velocidade: typeof c.speed === 'number' && Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null,
    rumo: typeof c.heading === 'number' && Number.isFinite(c.heading) ? c.heading : null,
  };
}

export function useUserLocation() {
  // Começa já na última posição conhecida: ao voltar ao Perto o mapa não salta para Lisboa
  const [status, setStatus] = useState<LocationPermissionStatus>(() => (memoriaPosicao ? 'active' : 'idle'));
  const [coords, setCoordsEstado] = useState<UserCoords | null>(() => memoriaPosicao);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [motivoBloqueio, setMotivoBloqueio] = useState<MotivoBloqueio | null>(null);
  // O Chrome no Android não chegou a mostrar o aviso «Ligar a localização?»: a recusa veio logo a seguir ao toque.
  // O Chrome só mostra esse aviso a um site com um toque e fora da pausa que faz depois de alguém o recusar
  // (7 dias, depois 30, depois 90, em todos os sites). Com o aviso no ecrã, a resposta só chega quando a pessoa escolhe.
  const [semAvisoSistema, setSemAvisoSistema] = useState<boolean>(false);
  const toqueRef = useRef<number>(0);
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);
  // Última vez que o browser deu uma leitura (mesmo que o filtro a tenha posto de parte): se o GPS "adormece", recomeça-se
  const ultimaLeituraRef = useRef(0);
  const reiniciarGpsRef = useRef<(() => void) | null>(null);
  const ultimoReinicioRef = useRef(0);
  const reiniciosSeguidosRef = useRef(0);
  const pararMovimentoRef = useRef<(() => void) | null>(null);
  const previousCoordsRef = useRef<UserCoords | null>(memoriaPosicao && !memoriaPosicao.isManual ? memoriaPosicao : null);
  // O que o ecrã já recebeu: só se avisa a página quando há mudança que se veja (poupa trabalho ao telemóvel)
  const emitidoRef = useRef<UserCoords | null>(memoriaPosicao);
  const statusAtualRef = useRef<LocationPermissionStatus>(status);
  statusAtualRef.current = status;
  // Diagnóstico: cada mudança de estado e, de 5 em 5 s, se está presa a pedir
  useEffect(() => { estadoGps(status, motivoBloqueio); }, [status, motivoBloqueio]);
  useEffect(() => { const i = setInterval(vigiarGps, 5000); return () => clearInterval(i); }, []);
  const setCoords = useCallback((c: UserCoords | null) => {
    emitidoRef.current = c;
    if (!c || c.isManual) reiniciarPosicaoSuave(); // posição nova à mão ou perdida: o filtro recomeça
    lembrarPosicao(c);
    setCoordsEstado(c);
  }, []);

  // Stop tracking and clean up
  const stopLocation = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    pararMovimentoRef.current?.();
    pararMovimentoRef.current = null;
    reiniciarGpsRef.current = null;
    setStatus('idle');
    setCoords(null);
    esquecerPosicao();
    previousCoordsRef.current = null;
    setErrorMessage(null);
    // Fica registado: ao abrir a app outra vez a localização não liga sozinha (só com "Ativar localização")
    try {
      localStorage.setItem(CHAVE_DESLIGADA, '1');
      localStorage.removeItem(CHAVE_LOCALIZACAO_OK);
    } catch {}
  }, [setCoords]);

  // Request & activate location (with high accuracy priority + graceful standard fallback)
  // jaAutorizada: quem chama acabou de confirmar que o browser deixa (a localização do telemóvel foi ligada agora mesmo)
  // posInicial: posição que quem chama já recebeu do telemóvel (a sonda): entra logo, sem esperar por um pedido novo
  const activateLocation = useCallback((forceHighAccuracy: boolean = true, jaAutorizada: boolean = false, posInicial?: GeolocationPosition) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      setErrorMessage('Geolocalização não é suportada pelo seu navegador.');
      return;
    }

    try { localStorage.removeItem(CHAVE_DESLIGADA); } catch {}
    // Pedido nascido de um toque? (só esse pode abrir o aviso do Android)
    try { if ((navigator as any).userActivation?.isActive === true) toqueRef.current = Date.now(); } catch {}
    ultimaLeituraRef.current = Date.now();
    reiniciosSeguidosRef.current = 0;
    // Acelerómetro: com o telemóvel quieto o filtro não deixa o ponto andar sozinho dentro de casa
    pararMovimentoRef.current?.();
    pararMovimentoRef.current = ligarMovimento();
    // Com uma posição já conhecida o ecrã continua a mostrá-la enquanto o GPS atualiza
    if (!previousCoordsRef.current) {
      // Sem posição no ecrã: a última conhecida aparece já e o GPS substitui-a quando responder. Com «precisão baixa» o
      // primeiro GPS demora 20 s; assim não se espera.
      const guardada = lerPosicaoGuardada();
      const mostrarGuardada = () => {
        if (!guardada) return;
        previousCoordsRef.current = guardada;
        memoriaPosicao = guardada;
        emitidoRef.current = guardada;
        setCoordsEstado(guardada);
        setStatus('active');
      };
      if (posInicial) {
        // a posição verdadeira já chegou: não vale a pena mostrar a guardada (pode ser de outro sítio)
      } else if (guardada && jaAutorizada) {
        // A localização do telemóvel acabou de ser ligada: nada de «A localizar…», aparece logo (como na Moovit)
        mostrarGuardada();
      } else {
        setStatus('requesting');
        // Espera 0,4 s: se o browser recusar logo (ex.: localização desligada), a posição antiga não chega a aparecer
        if (guardada) {
          setTimeout(() => {
            if (previousCoordsRef.current || statusAtualRef.current !== 'requesting') return;
            mostrarGuardada();
          }, 400);
        }
      }
    }
    setErrorMessage(null);

    // Clear any previous watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const handleSuccess = (position: GeolocationPosition, source: 'gps_high' | 'gps_low' = 'gps_high') => {
      ultimaLeituraRef.current = Date.now();
      reiniciosSeguidosRef.current = 0;
      const lat = Number(position?.coords?.latitude);
      const lon = Number(position?.coords?.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || isNaN(lat) || isNaN(lon)) {
        console.warn('[PAROU GPS] Posição com coordenadas inválidas recebida:', position?.coords);
        setStatus('unavailable');
        setErrorMessage('Sinal GPS com coordenadas inválidas.');
        return;
      }

      // Filtro: junta a leitura ao que já se sabe (velocidade, precisão, rumo). Se a leitura foi posta de parte
      // (repetida, antiga, ou "por rede" com o GPS bom), fica a estimativa atual.
      filtroGps.aparelho = estadoAparelho();
      const est = filtroGps.atualizar(leituraDoBrowser(position)) ?? filtroGps.atual();
      if (!est) return;
      const rumoBruto = position.coords.heading;
      const newCoords: UserCoords = {
        latitude: est.lat,
        longitude: est.lon,
        accuracy: Math.round(est.precisao),
        heading: est.rumo ?? (typeof rumoBruto === 'number' && Number.isFinite(rumoBruto) ? rumoBruto : null),
        speed: Math.round(est.velocidade * 3.6),
        timestamp: est.t,
        source,
        isManual: false,
      };
      const timestamp = newCoords.timestamp;

      gpsNestaSessao = true;
      previousCoordsRef.current = newCoords;

      // Só avisa a página se o ponto andou ≥ 3 m, a precisão mudou, ou já passaram 15 s
      const visto = emitidoRef.current;
      if (
        visto && !visto.isManual && statusAtualRef.current === 'active' &&
        metrosEntrePontos(visto.latitude, visto.longitude, newCoords.latitude, newCoords.longitude) < 3 &&
        Math.abs(visto.accuracy - newCoords.accuracy) < 5 &&
        timestamp - visto.timestamp < 15_000
      ) {
        return;
      }
      setMotivoBloqueio(null);
      setSemAvisoSistema(false);
      setCoords(newCoords);
      setStatus('active');
      setErrorMessage(null);
      try { localStorage.setItem(CHAVE_LOCALIZACAO_OK, '1'); } catch {}
    };

    if (posInicial) handleSuccess(posInicial, 'gps_low');

    // 1. Posição rápida: a aproximada (rede/Wi-Fi ou a última do telemóvel) chega quase de
    //    imediato e já dá para mostrar as paragens; o GPS afina a seguir, sem a pessoa esperar.
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos, 'gps_low'),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) handlePositionError(err);
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60_000 }
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

    // Seguimento contínuo. Fica numa função para se poder recomeçar se o GPS adormecer (ver o vigia mais abaixo)
    const iniciarSeguimento = () => {
      if (watchIdRef.current !== null) {
        try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
        watchIdRef.current = null;
      }
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
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        watchIdRef.current = id;
      } catch (err) {
        console.error('[PAROU GPS] Exceção watchPosition:', err);
      }
    };
    reiniciarGpsRef.current = () => {
      iniciarSeguimento();
      // Um pedido único acorda o recetor de GPS; a leitura entra no mesmo filtro
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => handleSuccess(pos, 'gps_high'),
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      } catch {}
    };
    iniciarSeguimento();
    setFollowMode(true);
  }, [setCoords]);

  const handlePositionError = (error: GeolocationPositionError) => {
    console.warn('[PAROU GPS] Erro de geolocalização:', error.code, error.message);
    if (error.code === error.PERMISSION_DENIED) {
      previousCoordsRef.current = null;
      setCoords(null);
      largarPosicao();
      setStatus('denied');
      setErrorMessage('Permissão de localização recusada no navegador.');
      // Descobre a causa: bloqueio do site, localização do telemóvel desligada ou pedido fechado
      try {
        // Quem já autorizou antes e agora falha quase sempre tem a localização do telemóvel
        // desligada (ou a poupança de bateria ligada), não um bloqueio no browser
        const semPedido = (): MotivoBloqueio => (jaDeuLocalizacao() ? 'sistema' : 'site');
        const logoAposToque = toqueRef.current > 0 && Date.now() - toqueRef.current < 900;
        navigator.permissions?.query({ name: 'geolocation' as PermissionName })
          .then((r) => {
            setMotivoBloqueio(r.state === 'prompt' ? 'recusado' : r.state === 'granted' ? 'sistema' : semPedido());
            if (r.state === 'granted' && logoAposToque) setSemAvisoSistema(true);
          })
          .catch(() => setMotivoBloqueio(semPedido()));
        if (!navigator.permissions?.query) setMotivoBloqueio(semPedido());
      } catch {
        setMotivoBloqueio(jaDeuLocalizacao() ? 'sistema' : 'site');
      }
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

          ultimaLeituraRef.current = Date.now();
          filtroGps.aparelho = estadoAparelho();
          const est = filtroGps.atualizar(leituraDoBrowser(pos)) ?? filtroGps.atual();
          const freshCoords: UserCoords = {
            latitude: est ? est.lat : lat,
            longitude: est ? est.lon : lon,
            accuracy: est ? Math.round(est.precisao) : Math.round(pos.coords.accuracy || 10),
            heading: est?.rumo ?? (typeof pos.coords.heading === 'number' && Number.isFinite(pos.coords.heading) ? pos.coords.heading : null),
            speed: est ? Math.round(est.velocidade * 3.6) : null,
            timestamp: est ? est.t : (pos.timestamp || Date.now()),
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

  // "Tentar outra vez" no aviso de precisão: recomeça o seguimento e pede já uma leitura de alta precisão
  const afinarPosicao = useCallback(async (): Promise<UserCoords | null> => {
    reiniciarGpsRef.current?.();
    return refreshHighAccuracyLocation();
  }, [refreshHighAccuracyLocation]);

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
    // A pessoa desligou a localização: fica desligada até tocar em "Ativar localização"
    if (desligadaPelaPessoa()) return;
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
          largarPosicao();
          setStatus('denied');
          setMotivoBloqueio(jaDeuLocalizacao() ? 'sistema' : 'site');
          setErrorMessage('Permissão de localização recusada no navegador.');
          // Pode ser só a localização do telemóvel desligada: tenta mesmo assim (sem pergunta)
          if (jaDeuLocalizacao()) activateLocation(true);
        }
      } else if (!localEscolhido && previousCoordsRef.current && gpsNestaSessao) {
        // Alguns browsers (Safari) dizem 'prompt' mesmo depois de autorizarem nesta visita
        activateLocation(true);
      } else if (!localEscolhido && previousCoordsRef.current) {
        // A autorização foi retirada entretanto: volta ao convite para ativar
        previousCoordsRef.current = null;
        setCoords(null);
        largarPosicao();
        setStatus('idle');
      }
      result.onchange = () => {
        if (result.state === 'granted') {
          activateLocation(true);
        } else if (result.state === 'denied') {
          setStatus('denied');
          setMotivoBloqueio(jaDeuLocalizacao() ? 'sistema' : 'site');
        }
      };
    }).catch(() => {
      // Sem Permissions API para geolocalização (ex.: Safari antigo)
      if (jaDeuLocalizacao() && !localEscolhido) activateLocation(true);
    });
  }, [activateLocation, setCoords]);

  // Ao voltar à app (ex.: depois de ligar a localização nas definições), tenta outra vez
  // sozinho — sem a pessoa ter de carregar em nada
  // (não volta a mostrar a pergunta a quem a fechou: isso só com um toque no botão)
  const statusRef = useRef(status);
  statusRef.current = status;
  const motivoRef = useRef(motivoBloqueio);
  motivoRef.current = motivoBloqueio;
  const ultimaTentativaRef = useRef(0);
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimaTentativaRef.current < 3000) return;
      const st = statusRef.current;
      // De volta à app com o GPS a seguir mas calado há mais de 8 s: acorda-o já (o telemóvel pode ter parado o seguimento)
      if (st === 'active' && watchIdRef.current !== null && Date.now() - ultimaLeituraRef.current > 8000 && !memoriaPosicao?.isManual) {
        ultimaTentativaRef.current = Date.now();
        reiniciarGpsRef.current?.();
        return;
      }
      if (st === 'unavailable' || (st === 'denied' && motivoRef.current !== 'recusado')) {
        ultimaTentativaRef.current = Date.now();
        activateLocation(true);
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [activateLocation]);

  // Localização do telemóvel desligada (o site tem autorização): assim que a pessoa a liga nas definições rápidas, a PAROU
  // mostra logo onde ela está, sem tocar em nada. Puxar a barra das definições não esconde a página (não há
  // visibilitychange), por isso, com o ecrã visível, pergunta-se em silêncio a cada 0,3 s (num Android real a recusa
  // chega em ~3 ms: não liga o GPS nem gasta bateria; 26/11/2026, para ganhar à Moovit). Com a localização desligada
  // a resposta é um erro imediato (não liga o GPS nem gasta bateria). Só quando o site já está autorizado: nunca abre a
  // pergunta do browser sozinho, nem volta a ligar a quem a desligou na app.
  const sondaRef = useRef(false);
  // Desde quando a app está a pedir a localização (0 = não está)
  const pedirDesdeRef = useRef(0);
  useEffect(() => { pedirDesdeRef.current = status === 'requesting' ? Date.now() : 0; }, [status]);
  const sondaFalhouRef = useRef(false);
  const tentativasSondaRef = useRef(0);
  const ultimaAtivacaoSondaRef = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    let parado = false;
    let autorizado: boolean | null = null;
    let porPedir = false;
    let ultimaConsulta = 0;
    // A autorização diz «por pedir» mas a pessoa já deu a localização à PAROU: no telemóvel do Dinis (app da Play, 26/11/2026)
    // o Chrome diz «por pedir» com a localização desligada e CONTINUA a dizê-lo depois de ligada, e mesmo assim dá a posição
    // sem perguntar nada. Aí pergunta-se mesmo ao GPS em silêncio. Se um dia o Chrome abrir a pergunta (a resposta demora),
    // fica-se por aí nesta visita: no máximo uma pergunta sem toque, e nunca a quem nunca deu a localização.
    let perguntaAberta = false;
    // no registo de diagnóstico, só quando a resposta da sonda muda (com a localização desligada repete-se a cada 0,3 s)
    let ultimaRes = '';
    const notaRes = (r: string) => { if (r !== ultimaRes) { ultimaRes = r; notaGps(`sonda:${r}`); } };
    const podePerguntar = async (): Promise<boolean> => {
      if (desligadaPelaPessoa() || memoriaPosicao?.isManual) return false;
      // a autorização do site lê-se no máximo a cada 10 s (pode mudar nas definições do browser)
      if (autorizado === null || Date.now() - ultimaConsulta > 10_000) {
        ultimaConsulta = Date.now();
        try {
          if (navigator.permissions?.query) {
            const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            autorizado = r.state === 'granted';
            porPedir = r.state === 'prompt';
          } else {
            autorizado = jaDeuLocalizacao();
          }
        } catch {
          autorizado = jaDeuLocalizacao();
        }
      }
      if (autorizado === true) return true;
      return porPedir && jaDeuLocalizacao() && !perguntaAberta;
    };
    const id = setInterval(async () => {
      if (parado || sondaRef.current || document.visibilityState !== 'visible') return;
      const st = statusRef.current;
      // Também quando o pedido está pendurado há mais de 8 s (com a localização do telemóvel desligada, o Chrome pode
      // nem responder): é quando a app já mostra «Liga a localização»
      const pendurado = st === 'requesting' && pedirDesdeRef.current > 0 && Date.now() - pedirDesdeRef.current > 8000;
      // ou no convite, para quem já deu a localização (o Chrome pode dizer «por pedir» só por a localização estar desligada)
      const noConvite = st === 'idle' && jaDeuLocalizacao();
      const desligadaNoTelemovel = (st === 'denied' && motivoRef.current === 'sistema') || st === 'unavailable' || pendurado || noConvite;
      if (!desligadaNoTelemovel) return;
      sondaRef.current = true;
      try {
        if (!(await podePerguntar()) || parado) return;
        await new Promise<void>((fimPromessa) => {
          // a sonda também acaba sozinha ao fim de 2,5 s (sem resposta conta como «desligada»)
          let acabou = false;
          const fim = () => { if (!acabou) { acabou = true; clearTimeout(limite); fimPromessa(); } };
          // pergunta ao GPS com a autorização «por pedir»: se não houver resposta, o Chrome pode ter aberto a pergunta
          const comPorPedir = autorizado !== true;
          const limite = setTimeout(() => {
            sondaFalhouRef.current = true; tentativasSondaRef.current = 0;
            if (comPorPedir) { perguntaAberta = true; notaRes('sem-resposta'); }
            fim();
          }, 2500);
          // Ligar a localização (a sonda já não dá «recusado»): mesma regra para a posição e para o «ainda sem posição»
          const ativarSeLigou = (pos?: GeolocationPosition) => {
            const agora = statusRef.current;
            if (parado || (agora !== 'denied' && agora !== 'unavailable' && agora !== 'requesting' && agora !== 'idle')) return;
            // Nunca em ciclo: só se a localização estava mesmo desligada (a sonda anterior falhou), no máximo uma vez
            // a cada 30 s e, se a app volta logo ao mesmo estado duas vezes, desiste até a pessoa tocar ou voltar à app
            const t = Date.now();
            if (!sondaFalhouRef.current && tentativasSondaRef.current >= 1) return;
            if (t - ultimaAtivacaoSondaRef.current < 30_000) return;
            if (tentativasSondaRef.current >= 2) return;
            tentativasSondaRef.current++;
            sondaFalhouRef.current = false;
            ultimaAtivacaoSondaRef.current = t;
            notaGps('auto:sonda');
            activateLocation(true, true, pos);
          };
          try {
            navigator.geolocation.getCurrentPosition(
              (pos) => { fim(); notaRes(comPorPedir ? 'ok-por-pedir' : 'ok'); ativarSeLigou(pos); },
              (err) => {
                fim();
                notaRes(`erro${err?.code ?? '?'}${comPorPedir ? '-por-pedir' : ''}`);
                // Com a localização desligada o Chrome responde «recusado» (código 1). «Tempo esgotado» (código 3) depois
                // disso quer dizer que já está ligada mas o GPS ainda não tem posição (com «precisão baixa» demora ~20 s):
                // ativa já, e a última posição conhecida aparece enquanto o GPS afina.
                const parada = (statusRef.current === 'denied' && motivoRef.current === 'sistema') || statusRef.current === 'idle';
                if (err && err.code === 3 && parada) { ativarSeLigou(); return; }
                sondaFalhouRef.current = true; tentativasSondaRef.current = 0;
              },
              { enableHighAccuracy: false, timeout: 2000, maximumAge: 60_000 },
            );
          } catch { fim(); }
        });
      } finally {
        sondaRef.current = false;
      }
    }, 300);
    return () => { parado = true; clearInterval(id); };
  }, [activateLocation]);

  // Localização do telemóvel desligada, como o Chrome no Android a mostra de verdade (26/11/2026: no telemóvel era preciso
  // tocar em «Ativar localização» depois de a ligar; na Moovit aparece em 1 s). Enquanto a localização do telemóvel está
  // desligada, o Chrome diz que a autorização do site está «por pedir» (ou «recusada», na pausa que faz depois de alguém
  // fechar o aviso «Ligar a localização?»), mesmo num site já autorizado, e só volta a «autorizado» quando a pessoa a liga
  // (Chromium: geolocation_permission_context_android.cc). Não avisa a página, e a app ficava no convite à espera de um
  // toque: a verificação de cima só corre com o site «autorizado». Por isso, com o ecrã visível e a localização parada,
  // lê-se a autorização a cada 250 ms (não liga o GPS nem abre pergunta nenhuma) e, quando passa a «autorizado», a app liga
  // a localização sozinha e mostra no mesmo instante a última posição conhecida. Não corre para quem a desligou na app.
  // Não depende da marca «já deu a localização» guardada no telemóvel (pode ter sido apagada com os dados do site): passar
  // a «autorizado» já prova que o site está autorizado; sem a marca lê-se só uma vez por segundo. Nunca em ciclo: só na
  // passagem para «autorizado» (ou no convite com tudo autorizado, de onde a app sai logo).
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator) || !navigator.permissions?.query) return;
    let parado = false;
    let aLer = false;
    let anterior: PermissionState | null = null;
    // travão para um browser que mude de resposta sem parar: no máximo uma vez a cada 5 s e 8 vezes por visita
    let ultimaVez = 0;
    let vezes = 0;
    let volta = 0;
    const id = setInterval(async () => {
      if (parado || aLer || document.visibilityState !== 'visible') return;
      const parada = (st: LocationPermissionStatus) => st === 'idle' || st === 'denied' || st === 'unavailable';
      if (!parada(statusRef.current)) return;
      if (desligadaPelaPessoa() || memoriaPosicao?.isManual) return;
      if (!jaDeuLocalizacao() && volta++ % 4 !== 0) return;
      aLer = true;
      try {
        const r = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (parado) return;
        const antes = anterior;
        anterior = r.state;
        if (r.state !== antes) notaGps(`perm:${r.state}`);
        const st = statusRef.current;
        if (r.state !== 'granted' || !parada(st) || desligadaPelaPessoa()) return;
        if (antes !== null ? antes !== 'granted' : st === 'idle') {
          // travado: a passagem fica por tratar e volta a ver-se na leitura seguinte
          if (Date.now() - ultimaVez < 5000 || vezes >= 8) { anterior = antes; return; }
          ultimaVez = Date.now();
          vezes++;
          ultimaTentativaRef.current = Date.now();
          notaGps('auto:autorizacao');
          activateLocation(true, true);
        }
      } catch {
        // browser sem autorizações para a localização: ficam as outras verificações
      } finally {
        aLer = false;
      }
    }, 250);
    return () => { parado = true; clearInterval(id); };
  }, [activateLocation]);

  // Vigia: com o ecrã visível e o GPS a seguir, se não chega nenhuma leitura há 25 s o seguimento recomeça
  // (acontece com o browser a poupar bateria). Se continua calado espera cada vez mais (25 s, 50 s, 100 s… até 5 min):
  // dentro de um edifício sem sinal não vale a pena ligar o recetor de GPS sem parar.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (statusRef.current !== 'active' || watchIdRef.current === null) return;
      if (memoriaPosicao?.isManual) return;
      const agora = Date.now();
      if (agora - ultimaLeituraRef.current < 25_000) return;
      const espera = Math.min(300_000, 25_000 * Math.pow(2, reiniciosSeguidosRef.current));
      if (agora - ultimoReinicioRef.current < espera) return;
      ultimoReinicioRef.current = agora;
      reiniciosSeguidosRef.current++;
      reiniciarGpsRef.current?.();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      pararMovimentoRef.current?.();
      pararMovimentoRef.current = null;
    };
  }, []);

  return {
    status,
    coords,
    errorMessage,
    motivoBloqueio,
    semAvisoSistema,
    followMode,
    isRefreshingGps,
    setFollowMode,
    activateLocation,
    refreshHighAccuracyLocation,
    afinarPosicao,
    setManualLocation,
    stopLocation,
    recenter,
    handleMapInteraction,
  };
}

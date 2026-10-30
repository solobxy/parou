import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ProtecaoErros, apanharErrosGlobais } from './components/ProtecaoErros';
import './index.css';
import { iniciarTema } from './utils/tema';
import { iniciarSegurancaZoom } from './utils/zoomIos';

iniciarTema();
iniciarSegurancaZoom();

// Pinch-to-zoom da página (iOS Safari): bloqueado no Perto (ecrã fixo, com o mapa e barras fixas, onde
// ampliar sem querer estraga o ecrã) e dentro dos mapas, que tratam do próprio zoom. Nos ecrãs de
// leitura (Horários, Alertas, Favoritos, páginas) fica permitido, para quem precisa de ver maior.
if (typeof document !== 'undefined') {
  const bloquearGesto = (e: Event) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo?.closest('.map-canvas-container')) return false; // zoom do próprio mapa
    if (alvo?.closest('.leaflet-container')) return true; // outros mapas tratam do seu zoom
    return document.documentElement.classList.contains('pagina-fixa');
  };
  document.addEventListener(
    'gesturestart',
    (e) => {
      if (bloquearGesto(e)) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener(
    'gesturechange',
    (e) => {
      if (bloquearGesto(e)) e.preventDefault();
    },
    { passive: false }
  );

  // Prevent double-tap zoom on mobile document (except inside form inputs or map)
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        if (!(e.target as HTMLElement)?.closest('.map-canvas-container, input, textarea, select')) {
          e.preventDefault();
        }
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

// Tradutores automáticos (ex.: Chrome a traduzir a página) e algumas extensões mexem no DOM por fora do React;
// o React depois falha com "insertBefore/removeChild: not a child of this node" e o ecrã fica em erro.
// Se o nó já não está onde o React espera, ignora em vez de rebentar (correção conhecida do React, issue #11538).
if (typeof Node === 'function' && Node.prototype) {
  const removerOriginal = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, filho: T): T {
    if (filho.parentNode !== this) return filho;
    return removerOriginal.call(this, filho) as T;
  };
  const inserirOriginal = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, novo: T, referencia: Node | null): T {
    if (referencia && referencia.parentNode !== this) return novo;
    return inserirOriginal.call(this, novo, referencia) as T;
  };
}

// Depois de uma versão nova, um separador aberto antes pode pedir um pedaço da app que já não existe
// ("Failed to fetch dynamically imported module"). Recarrega uma vez para ir buscar a versão nova.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    try {
      const ultima = Number(sessionStorage.getItem('parou_recarregou_pedaco') || 0);
      if (Date.now() - ultima < 60_000) return; // nunca em ciclo
      sessionStorage.setItem('parou_recarregou_pedaco', String(Date.now()));
    } catch { return; }
    e.preventDefault();
    window.location.reload();
  });
}

apanharErrosGlobais();
createRoot(document.getElementById('root')!).render(
  <ProtecaoErros>
    <App />
  </ProtecaoErros>,
);

// O service worker (app instalável e rápida a abrir) é gerado e registado pelo vite-plugin-pwa

// Versão nova: quando o service worker novo toma conta da página, recarrega para mostrar logo
// a versão nova (sem isto, a primeira visita depois de uma atualização ainda mostrava a antiga).
// Logo ao abrir recarrega de imediato; mais tarde, só quando a pessoa sai da app (sem a interromper).
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  const tinhaControlador = Boolean(navigator.serviceWorker.controller);
  const recarregar = () => {
    try {
      const ultima = Number(sessionStorage.getItem('parou_recarregou') || 0);
      if (Date.now() - ultima < 60_000) return; // nunca em ciclo
      sessionStorage.setItem('parou_recarregou', String(Date.now()));
    } catch {}
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador) return; // primeira instalação: a página já é a versão atual
    if (performance.now() < 20_000 || document.visibilityState === 'hidden') {
      recarregar();
      return;
    }
    const quandoSair = () => {
      if (document.visibilityState === 'hidden') {
        document.removeEventListener('visibilitychange', quandoSair);
        recarregar();
      }
    };
    document.addEventListener('visibilitychange', quandoSair);
  });
}

import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ProtecaoErros, apanharErrosGlobais } from './components/ProtecaoErros';
import './index.css';

// Prevent iOS Safari page pinch-to-zoom on the webpage
if (typeof document !== 'undefined') {
  document.addEventListener(
    'gesturestart',
    (e) => {
      // Only allow gesture/pinch if target is inside the map canvas
      if (!(e.target as HTMLElement)?.closest('.map-canvas-container')) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
  document.addEventListener(
    'gesturechange',
    (e) => {
      if (!(e.target as HTMLElement)?.closest('.map-canvas-container')) {
        e.preventDefault();
      }
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

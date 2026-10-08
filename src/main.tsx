import {createRoot} from 'react-dom/client';
import App from './App.tsx';
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

createRoot(document.getElementById('root')!).render(<App />);

// App instalável e rápida a abrir: service worker (só em produção, depois de a página carregar)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

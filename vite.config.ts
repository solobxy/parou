import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function hmrSilencer(): Plugin {
  const silencerScript = `(function() {
  const levels = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach(function(level) {
    const orig = console[level];
    console[level] = function(...args) {
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === 'string') {
          if (arg.includes('[vite]') || arg.includes('[hmr]') || arg.includes('WebSocket') || arg.includes('websocket') || arg.includes('ws://') || arg.includes('wss://')) {
            return;
          }
        } else if (arg && typeof arg === 'object' && typeof arg.message === 'string') {
          if (arg.message.includes('[vite]') || arg.message.includes('[hmr]') || arg.message.includes('WebSocket') || arg.message.includes('websocket')) {
            return;
          }
        }
      }
      if (orig) orig.apply(console, args);
    };
  });

  window.addEventListener('error', function(e) {
    const msg = e && e.message ? String(e.message) : '';
    const src = e && e.filename ? String(e.filename) : '';
    if (msg.includes('vite') || msg.includes('WebSocket') || msg.includes('websocket') || src.includes('@vite')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('unhandledrejection', function(e) {
    const reason = e && e.reason ? String(e.reason.message || e.reason) : '';
    if (reason.includes('vite') || reason.includes('WebSocket') || reason.includes('websocket')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  const OrigWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    const urlStr = String(url || '');
    const protoStr = Array.isArray(protocols) ? protocols.join(',') : String(protocols || '');
    if (protoStr.includes('vite') || urlStr.includes('vite') || urlStr.includes('token=') || urlStr.startsWith('ws:') || urlStr.startsWith('wss:')) {
      const listeners = {};
      const fakeWs = {
        readyState: 1,
        url: urlStr,
        protocol: protoStr,
        binaryType: 'blob',
        bufferedAmount: 0,
        extensions: '',
        onopen: null,
        onclose: null,
        onerror: null,
        onmessage: null,
        send: function() {},
        close: function() {
          fakeWs.readyState = 3;
          if (fakeWs.onclose) fakeWs.onclose({ type: 'close', wasClean: true, code: 1000, reason: '' });
          if (listeners['close']) {
            listeners['close'].forEach(function(fn) {
              try { fn({ type: 'close', wasClean: true, code: 1000, reason: '' }); } catch(err) {}
            });
          }
        },
        addEventListener: function(event, handler) {
          listeners[event] = listeners[event] || [];
          listeners[event].push(handler);
          if (event === 'open') {
            setTimeout(function() {
              try { handler({ type: 'open' }); } catch(err) {}
            }, 0);
          }
        },
        removeEventListener: function(event, handler) {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter(function(h) { return h !== handler; });
        },
        dispatchEvent: function() { return true; }
      };
      setTimeout(function() {
        if (fakeWs.onopen) fakeWs.onopen({ type: 'open' });
        if (listeners['open']) {
          listeners['open'].forEach(function(fn) {
            try { fn({ type: 'open' }); } catch(err) {}
          });
        }
      }, 0);
      return fakeWs;
    }
    return new OrigWebSocket(url, protocols);
  };
  if (OrigWebSocket) {
    window.WebSocket.CONNECTING = OrigWebSocket.CONNECTING || 0;
    window.WebSocket.OPEN = OrigWebSocket.OPEN || 1;
    window.WebSocket.CLOSING = OrigWebSocket.CLOSING || 2;
    window.WebSocket.CLOSED = OrigWebSocket.CLOSED || 3;
    window.WebSocket.prototype = OrigWebSocket.prototype;
  }
})();`;

  return {
    name: 'hmr-silencer',
    transformIndexHtml: {
      order: 'pre' as const,
      handler() {
        return [
          {
            tag: 'script',
            attrs: { type: 'text/javascript' },
            children: silencerScript,
            injectTo: 'head-prepend' as const,
          },
        ];
      },
    },
  };
}

export default defineConfig(async ({ command }) => {
  const plugins = [
    hmrSilencer(),
    react(),
    tailwindcss(),
  ];

  if (command === 'build') {
    const { VitePWA } = await import('vite-plugin-pwa');
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'badge-96.png', 'sw-push-handler.js'],
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          importScripts: ['/sw-push-handler.js'],
          // Versão nova entra logo (sem ficar presa na antiga) e a API nunca vem da cache
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api\//, /^\/_estado/, /^\/health/],
        },
        manifest: {
          id: '/',
          name: 'PAROU — Transportes em tempo real',
          short_name: 'PAROU',
          description: 'Próximos autocarros, metro e comboios perto de ti, horários, greves e alertas em Portugal. Gratuito e sem fins lucrativos.',
          lang: 'pt-PT',
          theme_color: '#FFFFFF',
          background_color: '#FFFFFF',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/?origem=app',
          scope: '/',
          categories: ['travel', 'navigation', 'utilities'],
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Perto', url: '/?origem=atalho', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Horários', url: '/transportes', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Alertas', url: '/alertas', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          ],
        },
        devOptions: {
          enabled: false,
        },
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

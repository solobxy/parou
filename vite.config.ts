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
        includeAssets: ['icon.svg', 'sw-push-handler.js'],
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          importScripts: ['/sw-push-handler.js'],
        },
        manifest: {
          id: '/',
          name: 'PAROU.PT - Ocorrências em Tempo Real',
          short_name: 'PAROU.PT',
          description: 'Monitorização em tempo real de transportes, trânsito, greves e avarias em Portugal.',
          theme_color: '#0b0f17',
          background_color: '#080c14',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
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

// PAROU.PT — Service worker
// - Abre a app depressa e mesmo com rede fraca: guarda a "casca" da app (HTML, JS, CSS,
//   ícones). As páginas vêm sempre primeiro da rede (para nunca ficar presa numa versão
//   antiga); só usa a cópia guardada se a rede falhar.
// - Nunca guarda respostas da API (horários, tempo real, alertas): essas vêm sempre frescas.
// - Notificações: ver sw-push-handler.js
/* eslint-disable no-undef */
importScripts('/sw-push-handler.js');

const CACHE = 'parou-casca-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('parou-casca-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const pedido = event.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return; // mapas, fontes, etc.: o browser trata
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_estado') || url.pathname === '/health') return;

  // Páginas: rede primeiro (versão mais recente), cópia guardada se não houver rede
  if (pedido.mode === 'navigate') {
    event.respondWith(
      fetch(pedido)
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(CACHE).then((c) => c.put('/', copia)).catch(() => {});
          return resposta;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  // Ficheiros da app com nome único (/assets/…-hash.js): guardados depois do 1.º uso
  if (url.pathname.startsWith('/assets/') || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(pedido).then((guardado) => {
        if (guardado) return guardado;
        return fetch(pedido).then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
          }
          return resposta;
        });
      }),
    );
  }
});

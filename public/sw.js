/* SW только для installability PWA. Без fetch interception — меньше риска белого/чёрного экрана. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

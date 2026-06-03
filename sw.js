// sw.js — Service Worker لتطبيق HAINON
const CACHE_NAME = 'hainon-offline-v1';
const OFFLINE_URL = 'offline.html';

// تثبيت الـ Service Worker وتخزين صفحة عدم الاتصال
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
  self.skipWaiting();
});

// تفعيل الـ Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// استراتيجية "الشبكة أولاً" مع الرجوع إلى صفحة عدم الاتصال
self.addEventListener('fetch', (event) => {
  // نتعامل فقط مع طلبات التنقل (الصفحات)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
  }
});

const CACHE_NAME = 'nchs-learning-v2';
const urlsToCache = [
  '/e-learning/',
  '/e-learning/index.html',
  '/e-learning/login.html',
  '/e-learning/register.html',
  '/e-learning/admin.html',
  '/e-learning/lecturer.html',
  '/e-learning/superadmin.html',
  '/e-learning/exam.html',
  '/e-learning/style.css',
  '/e-learning/script.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap',
  'https://raw.githubusercontent.com/NCHSMlearning/e-learning/main/images/Logo_NCHSM.png'
];

// Install event
self.addEventListener('install', event => {
  console.log('Service Worker installed');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Service Worker activated');
});

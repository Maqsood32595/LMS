// FRACTAL: self-uninstalling service worker.
// Claims clients immediately, purges every cache bucket, then idles forever
// (no fetch handler = zero interception).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
	event.waitUntil(
		self.clients.claim().then(() =>
			self.caches.keys().then((keys) => Promise.all(keys.map((k) => self.caches.delete(k))))
		)
	)
})

// FRACTAL: self-uninstalling service worker registrar.
// Any worker previously registered by the Frappe-era PWA build is unregistered
// and every Cache Storage bucket is purged, then this file never registers one.
if ('serviceWorker' in navigator) {
	navigator.serviceWorker.getRegistrations().then((regs) => {
		regs.forEach((r) => r.unregister())
	})
}
if (window.caches && caches.keys) {
	caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
}

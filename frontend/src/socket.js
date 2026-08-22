import { io } from 'socket.io-client'

// ── FRACTAL CONVERSION ────────────────────────────────────────────────────
// The Frappe sites/common_site_config.json no longer exists. Realtime is
// optional: set window.FRACTAL_SOCKET_URL (or VITE_FRACTAL_SOCKET) to enable.
// Without it we return a no-op stub so every `inject('$socket')` consumer
// keeps working without a bench.

function noopSocket() {
	return {
		on: () => {},
		off: () => {},
		emit: () => {},
		disconnect: () => {},
		connected: false,
	}
}

export function initSocket() {
	const url = window.FRACTAL_SOCKET_URL || import.meta.env?.VITE_FRACTAL_SOCKET
	if (!url) return noopSocket()

	let socket = io(url, {
		withCredentials: true,
		reconnectionAttempts: 5,
	})
	return socket
}


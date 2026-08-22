/**
 * FRACTAL STUB — replaces frappe-ui/src/utils/socketio in the build graph
 * (see vite.config.js → fractal-noop-frappe-socket).
 *
 * frappe-ui's FrappeUI plugin calls its own initSocket() during install(),
 * which dials the Frappe bench realtime port (default 9000). This Kernel has
 * no bench. Realtime stays optional: set window.FRACTAL_SOCKET_URL (or
 * VITE_FRACTAL_SOCKET) to point at a real socket.io server.
 */
import { io } from 'socket.io-client'

export interface InitSocketOptions {
	port?: number
}

export default function initSocket(_options: InitSocketOptions = {}) {
	const url = (window as any).FRACTAL_SOCKET_URL || import.meta.env?.VITE_FRACTAL_SOCKET
	if (!url) {
		return {
			on: () => {},
			off: () => {},
			once: () => {},
			emit: () => {},
			close: () => {},
			disconnect: () => {},
			connect: () => {},
			connected: false,
		}
	}
	return io(url, { withCredentials: true, reconnectionAttempts: 5 })
}

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// ── FRACTAL CONVERSION ────────────────────────────────────────────────────
// The Frappe bench proxy is gone. All /api traffic is proxied to the local
// Fractal Kernel (server/index.js). In production the built dist/ is served
// by the same Express process.
const FRACTAL_KERNEL_TARGET =
	process.env.VITE_FRACTAL_KERNEL || 'http://localhost:3000'

export default defineConfig(async ({ mode }) => {
	const isDev = mode === 'development'
	const frappeui = await importFrappeUIPlugin(isDev)

	const config = {
		define: {
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
		},
		plugins: [
			{
				// ── FRACTAL: neutralize frappe-ui's bench socket ─────────────
				// FrappeUI's install() calls its bundled initSocket(), which
				// dials the bench realtime port (:9000) on every page load.
				// Redirect that module to our optional-realtime stub.
				name: 'fractal-noop-frappe-socket',
				enforce: 'pre',
				resolveId(id, importer) {
					if (
						importer &&
						importer.includes('frappe-ui') &&
						/utils[/\\]socketio(\.(ts|js))?$/.test(id)
					) {
						return path.resolve(__dirname, 'src/stubs/frappe-noop-socket.ts')
					}
					return null
				},
			},
			frappeui({
				frappeProxy: false, // ← no more Frappe bench
				lucideIcons: true,
				jinjaBootData: false, // ← boot data now comes from /api/v1/auth/user
			}),
			vue(),
			VitePWA({
				registerType: 'autoUpdate',
				devOptions: {
					enabled: false,
				},
				workbox: {
					cleanupOutdatedCaches: true,
					maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
					globPatterns: ['**/*.{js,ts,css,html,svg}'],
					runtimeCaching: [
						{
							urlPattern: ({ request }) =>
								request.destination === 'document',
							handler: 'NetworkFirst',
							options: {
								cacheName: 'html-cache',
							},
						},
					],
				},
				manifest: false,
			}),
			// pdf.js needs cMaps + standard_fonts as sibling assets or those PDFs
			// render blank. PdfBlock.vue points cMapUrl/standardFontDataUrl at
			// `${BASE_URL}pdfjs/...`.
			viteStaticCopy({
				targets: [
					{
						src: 'node_modules/pdfjs-dist/cmaps/*',
						dest: 'pdfjs/cmaps',
					},
					{
						src: 'node_modules/pdfjs-dist/standard_fonts/*',
						dest: 'pdfjs/standard_fonts',
					},
				],
			}),
		],
		server: {
			host: '0.0.0.0', // Accept connections from any network interface
			allowedHosts: true,
			port: 8080,
			proxy: {
				// Fractal Kernel — all backend calls ride on /api/*
				'/api': {
					target: FRACTAL_KERNEL_TARGET,
					changeOrigin: true,
				},
			},
		},
		build: {
			outDir: 'dist', // standalone SPA output served by the Kernel
			emptyOutDir: true,
		},
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
			},
			// Force one copy of prosemirror; duplicate copies break tiptap's
			// instanceof checks and crash the list buttons.
			dedupe: [
				'prosemirror-model',
				'prosemirror-state',
				'prosemirror-view',
				'prosemirror-transform',
				'vue',
				'frappe-ui',
			],
		},
		optimizeDeps: {
			include: [
				'feather-icons',
				'tailwind.config.js',
				'highlight.js',
				'plyr',
			],
			exclude: mode === 'production' ? [] : ['frappe-ui'],
		},
	}
	return config
})

async function importFrappeUIPlugin(isDev) {
	if (isDev) {
		try {
			const module = await import('../frappe-ui/vite')
			return module.default
		} catch (error) {
			console.warn(
				'Local frappe-ui not found, falling back to npm package:',
				error.message
			)
		}
	}
	// Fall back to npm package if local import fails
	const module = await import('frappe-ui/vite')
	return module.default
}


<template>
	<div class="flex flex-col items-center w-full py-4 select-none">
		<!-- PDF Rendering Canvas Area -->
		<div
			ref="viewerArea"
			class="relative flex flex-col items-center justify-center w-full min-h-[500px] bg-surface-gray-2 dark:bg-surface-gray-7 rounded-xl p-4 sm:p-6 shadow-inner"
		>
			<div
				v-if="rendering"
				class="absolute z-10 flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-gray-7 bg-surface-base/90 backdrop-blur rounded-full shadow"
			>
				<span class="lucide-loader-2 size-4 animate-spin text-ink-gray-6" />
				{{ __('Rendering Page...') }}
			</div>

			<canvas
				ref="canvasRef"
				class="block max-w-full bg-white rounded shadow-md transition-opacity duration-200"
				:class="{ 'opacity-50': rendering }"
			/>
		</div>

		<!-- Reader Navigation Controls -->
		<div
			class="flex items-center justify-center gap-3 mt-4 px-4 py-2.5 bg-surface-base border rounded-xl shadow-sm text-sm"
		>
			<Button
				variant="subtle"
				:disabled="currentPage <= 1 || rendering"
				@click="goToPage(currentPage - 1)"
			>
				<template #prefix>
					<span class="lucide-chevron-left size-4" />
				</template>
				{{ __('Previous') }}
			</Button>

			<div class="flex items-center gap-1.5 font-medium text-ink-gray-8">
				<input
					v-model.number="pageInput"
					type="number"
					min="1"
					:max="totalPages"
					class="w-14 px-2 py-1 text-center font-medium border rounded-md bg-surface-gray-2 text-ink-gray-9 focus:outline-none focus:ring-1 focus:ring-outline-gray-4"
					@keydown.enter="goToPage(pageInput)"
					@blur="goToPage(pageInput)"
				/>
				<span class="text-ink-gray-5">/ {{ totalPages || 1 }}</span>
			</div>

			<Button
				variant="subtle"
				:disabled="currentPage >= totalPages || rendering"
				@click="goToPage(currentPage + 1)"
			>
				{{ __('Next') }}
				<template #suffix>
					<span class="lucide-chevron-right size-4" />
				</template>
			</Button>
		</div>
	</div>
</template>

<script setup>
import { Button, call } from 'frappe-ui'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPdfWorker } from '@/utils/pdfWorker'
import { safeUrl } from '@/utils/safeUrl'

const props = defineProps({
	fileUrl: { type: String, required: true },
	lessonId: { type: String, required: true },
	courseId: { type: String, required: true },
})

const emit = defineEmits(['lesson-complete', 'progress-update'])

const viewerArea = ref(null)
const canvasRef = ref(null)

const currentPage = ref(1)
const pageInput = ref(1)
const totalPages = ref(1)
const rendering = ref(false)

const pagesSeen = new Set()
const DWELL_MS = 2 * 60 * 1000 // 2-minute silent background dwell timer
let dwellTimer = null
let pdfDoc = null
let pdfjsLib = null
let sharedPdfWorker = null
let heldWorker = null

onMounted(async () => {
	acquireWorker()
	if (props.fileUrl) {
		await initPdf(props.fileUrl)
	}
	window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
	if (dwellTimer) clearTimeout(dwellTimer)
	window.removeEventListener('resize', onResize)
	releaseWorker()
})

watch(
	() => props.fileUrl,
	async (newUrl) => {
		if (newUrl) await initPdf(newUrl)
	}
)

let resizeTimeout = null
function onResize() {
	if (resizeTimeout) clearTimeout(resizeTimeout)
	resizeTimeout = setTimeout(() => {
		if (pdfDoc && currentPage.value) renderPage(currentPage.value)
	}, 200)
}

function acquireWorker() {
	if (heldWorker) return
	try {
		heldWorker = createPdfWorker()
	} catch (e) {
		console.warn('[PdfLessonViewer] Worker fallback:', e)
		heldWorker = null
	}
}

function releaseWorker() {
	if (sharedPdfWorker) {
		try { sharedPdfWorker.destroy() } catch {}
		sharedPdfWorker = null
	}
	if (heldWorker) {
		try { heldWorker.terminate() } catch {}
		heldWorker = null
	}
}

async function initPdf(url) {
	try {
		rendering.value = true
		if (!pdfjsLib) {
			pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
		}

		if (heldWorker && !sharedPdfWorker) {
			sharedPdfWorker = new pdfjsLib.PDFWorker({ port: heldWorker })
		}

		const base = import.meta.env.BASE_URL || '/'
		const loadingTask = pdfjsLib.getDocument({
			url: safeUrl(url),
			worker: sharedPdfWorker || undefined,
			cMapUrl: `${base}pdfjs/cmaps/`,
			cMapPacked: true,
			standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
		})
		pdfDoc = await loadingTask.promise
		totalPages.value = pdfDoc.numPages
		currentPage.value = 1
		pageInput.value = 1
		await renderPage(1)
	} catch (e) {
		console.error('[PdfLessonViewer] Failed to load PDF:', e)
	} finally {
		rendering.value = false
	}
}

async function renderPage(pageNum) {
	if (!pdfDoc || !canvasRef.value) return
	pageNum = Math.max(1, Math.min(totalPages.value, pageNum))

	rendering.value = true
	try {
		const page = await pdfDoc.getPage(pageNum)
		const containerWidth = viewerArea.value?.clientWidth
			? viewerArea.value.clientWidth - 48
			: 800
		const unscaledViewport = page.getViewport({ scale: 1 })
		const scale = Math.min(containerWidth / unscaledViewport.width, 1.8)
		const viewport = page.getViewport({ scale })

		const canvas = canvasRef.value
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		canvas.width = viewport.width
		canvas.height = viewport.height
		canvas.style.width = `${viewport.width}px`
		canvas.style.height = `${viewport.height}px`

		await page.render({ canvasContext: ctx, viewport }).promise

		currentPage.value = pageNum
		pageInput.value = pageNum

		// ── Silent 2-Minute Background Dwell Timer ─────────────────────────
		if (!pagesSeen.has(pageNum)) {
			if (dwellTimer) clearTimeout(dwellTimer)
			dwellTimer = setTimeout(async () => {
				pagesSeen.add(pageNum)
				await reportProgress(pageNum)
			}, DWELL_MS)
		}
	} catch (e) {
		console.error('[PdfLessonViewer] Render error on page', pageNum, e)
	} finally {
		rendering.value = false
	}
}

async function goToPage(n) {
	if (!pdfDoc || rendering.value) return
	n = Math.max(1, Math.min(totalPages.value, n || 1))
	if (n === currentPage.value) return
	if (dwellTimer) clearTimeout(dwellTimer)
	await renderPage(n)
}

async function reportProgress(pageNum) {
	try {
		const res = await call('lms.lms.api.record_pdf_reading_progress', {
			lesson_id: props.lessonId,
			course_id: props.courseId,
			page_number: pageNum,
			total_pages: totalPages.value,
		})

		const data = res?.message || res || {}
		emit('progress-update', {
			progress: data.pct_complete || 0,
			completed: Boolean(data.completed)
		})

		if (data.completed) {
			emit('lesson-complete')
		}
	} catch (e) {
		console.warn('[PdfLessonViewer] Progress report error:', e)
	}
}
</script>

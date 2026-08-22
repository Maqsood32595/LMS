/**
 * ── Fractal API Adapter ────────────────────────────────────────────────
 * Single data-layer seam between the preserved Frappe LMS UI and the
 * Fractal Kernel backend. Every call maps to a grandchild-cell endpoint:
 *
 *   get_user_info      → GET  /api/v1/auth/user
 *   get_courses        → GET  /api/v1/lms/courses
 *   get_course_details → GET  /api/v1/lms/courses/:id
 *   get_quiz           → GET  /api/v1/lms/courses/quizzes/:id
 *   submit_quiz        → POST /api/v1/lms/courses/quizzes/:id/submit
 *   get_lesson         → GET  /api/v1/lms/courses/content/lesson/:id
 *   video streams      → GET  /api/v1/lms/courses/content/stream/*
 */

const BASE = import.meta.env?.VITE_FRACTAL_API || ''
const TOKEN_KEY = 'fractal_token'

export function getToken() {
	return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
	t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	})
	if (!res.ok) {
		let msg = `${res.status} ${res.statusText}`
		try {
			msg = (await res.json())?.error || msg
		} catch (_) {}
		throw new Error(msg)
	}
	return res.json()
}

// ── Auth cell ────────────────────────────────────────────────────────────
export const registerUser = (payload) =>
	request('/api/v1/auth/register', { method: 'POST', body: payload })

export async function loginUser(email, password) {
	const { token, user } = await request('/api/v1/auth/login', {
		method: 'POST',
		body: { email, password },
	})
	setToken(token)
	return user
}
export const logoutUser = () => setToken(null)

/** Replaces frappe `get_user_info` */
export const getUserInfo = () => request('/api/v1/auth/user')
export const getMe = () => request('/api/v1/auth/me')
export const updateProfile = (patch) => request('/api/v1/auth/me', { method: 'PATCH', body: patch })

// ── LMS parent cell ──────────────────────────────────────────────────────
export const getPlatformStats = () => request('/api/v1/lms/stats')

// ── Courses child cell ───────────────────────────────────────────────────
/** Replaces frappe `get_courses`. query: { category, search, featured } */
export const getCourses = (query = {}) => {
	const qs = new URLSearchParams(query).toString()
	return request(`/api/v1/lms/courses${qs ? `?${qs}` : ''}`)
}
/** Replaces frappe `get_course_details` */
export const getCourseDetails = (idOrName) => request(`/api/v1/lms/courses/${idOrName}`)
export const enrollInCourse = (idOrName) =>
	request(`/api/v1/lms/courses/${idOrName}/enroll`, { method: 'POST' })
export const createCourse = (payload) =>
	request('/api/v1/lms/courses', { method: 'POST', body: payload })

// ── Quizzes grandchild cell ──────────────────────────────────────────────
export const getQuiz = (quizId) => request(`/api/v1/lms/courses/quizzes/${quizId}`)
export const submitQuiz = (quizId, answers) =>
	request(`/api/v1/lms/courses/quizzes/${quizId}/submit`, { method: 'POST', body: { answers } })
export const myQuizSubmissions = (quizId) =>
	request(`/api/v1/lms/courses/quizzes/${quizId}/my-submissions`)

// ── Content grandchild cell ──────────────────────────────────────────────
export const getLesson = (lessonId) =>
	request(`/api/v1/lms/courses/content/lesson/${lessonId}`)
/** Returns redirect target URL for GCS media under fractal-lms/ */
export const streamUrlFor = (objectPath) =>
	`${BASE}/api/v1/lms/courses/content/stream/${objectPath}`
export const createUploadRequest = (filename, folder) =>
	request('/api/v1/lms/courses/content/upload-request', { method: 'POST', body: { filename, folder } })

// ── Students grandchild cell ─────────────────────────────────────────────
export const getMyDashboard = () => request('/api/v1/lms/users/students/me/dashboard')
export const getCourseProgress = (courseId) =>
	request(`/api/v1/lms/users/students/me/progress/${courseId}`)
/** Replaces frappe `mark_lesson_progress` */
export const markLessonComplete = (lesson_id, course_id) =>
	request('/api/v1/lms/users/students/me/progress', { method: 'POST', body: { lesson_id, course_id } })

// ── Live child cell ──────────────────────────────────────────────────────
export const getLiveClasses = (query = {}) => {
	const qs = new URLSearchParams(query).toString()
	return request(`/api/v1/lms/live/classes${qs ? `?${qs}` : ''}`)
}
export default request

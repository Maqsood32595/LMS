<template>
	<div class="p-5">
		<div class="flex items-center justify-between">
			<div class="text-lg-semibold text-ink-gray-9">
				{{ __('Live Class') }}
			</div>
			<Button
				v-if="canCreateClass()"
				data-testid="live-class-add"
				@click="openLiveClassForm"
			>
				<template #prefix>
					<span class="lucide-plus h-4 w-4" />
				</template>
				<span>
					{{ __('Add') }}
				</span>
			</Button>
		</div>
		<div
			v-if="liveClasses.data?.length"
			class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5"
		>
			<div
				v-for="cls in liveClasses.data"
				:key="cls.name"
				class="flex flex-col border rounded-md h-full text-ink-gray-7 hover:border-outline-gray-3 p-3 relative group"
				:class="{
					'cursor-pointer': isAdmin() && cls.attendees > 0,
				}"
				@click="
					() => {
						openAttendanceModal(cls)
					}
				"
			>
				<div class="font-semibold text-ink-gray-9 mb-1">
					{{ cls.title }}
				</div>
				<div class="short-introduction">
					{{ cls.description }}
				</div>
				<div class="mt-auto space-y-3">
					<div class="flex items-center gap-x-2 text-p-sm">
						<span class="lucide-calendar w-4 h-4 text-ink-gray-5" />
						<span>
							{{ dayjs(cls.date).format('DD MMMM YYYY') }}
						</span>
					</div>
					<div class="flex items-center gap-x-2 text-p-sm">
						<span class="lucide-clock w-4 h-4 text-ink-gray-5" />
						<span>
							{{ dayjs(getClassStart(cls)).format('hh:mm A') }} -
							{{ dayjs(getClassEnd(cls)).format('hh:mm A') }}
						</span>
					</div>

					<div class="flex items-center justify-between mt-auto pt-2 border-t border-outline-gray-1">
						<div
							v-if="canAccessClass(cls) && cls.join_url"
							class="flex items-center gap-x-2 text-ink-gray-9 flex-1"
						>
							<a
								v-if="user.data?.is_moderator || user.data?.is_evaluator"
								:href="safeUrl(cls.start_url || cls.join_url)"
								v-external
								class="cursor-pointer inline-flex items-center justify-center gap-2 transition-colors focus:outline-none text-ink-gray-8 bg-surface-gray-2 hover:bg-surface-gray-3 active:bg-surface-gray-4 focus-visible:ring focus-visible:ring-outline-gray-3 h-7 text-p-sm px-2 rounded"
								:class="cls.join_url ? 'w-full' : 'w-1/2'"
							>
								<span class="lucide-monitor h-4 w-4" />
								{{ __('Start') }}
							</a>
							<a
								:href="safeUrl(cls.join_url)"
								v-external
								class="w-full cursor-pointer inline-flex items-center justify-center gap-2 transition-colors focus:outline-none text-ink-gray-8 bg-surface-gray-2 hover:bg-surface-gray-3 active:bg-surface-gray-4 focus-visible:ring focus-visible:ring-outline-gray-3 h-7 text-p-sm px-2 rounded"
							>
								<span class="lucide-video h-4 w-4" />
								{{ __('Join') }}
							</a>
						</div>
						<Tooltip
							v-else-if="hasClassEnded(cls)"
							:text="__('This class has ended')"
							placement="right"
						>
							<div class="flex items-center gap-x-2 text-ink-amber-6 w-fit text-p-sm">
								<span class="lucide-info w-4 h-4" />
								<span>
									{{ __('Ended') }}
								</span>
							</div>
						</Tooltip>
						<Tooltip
							v-else-if="cls.date > dayjs().format('YYYY-MM-DD')"
							:text="__('Class scheduled for ' + dayjs(cls.date).format('DD MMMM YYYY'))"
							placement="right"
						>
							<div class="flex items-center gap-x-2 text-ink-blue-6 w-fit text-p-sm">
								<span class="lucide-calendar-clock w-4 h-4" />
								<span>
									{{ __('Upcoming') }}
								</span>
							</div>
						</Tooltip>

						<!-- Small Trash Delete Icon in Lower Right Bottom Corner -->
						<button
							v-if="isAdmin()"
							type="button"
							class="text-ink-gray-4 hover:text-ink-red-6 transition-colors p-1 rounded hover:bg-surface-gray-2 ms-2 shrink-0"
							:title="__('Delete live class')"
							@click.stop="(e) => deleteLiveClass(cls, e)"
						>
							<span class="lucide-trash-2 size-3.5" />
						</button>
					</div>
				</div>
			</div>
		</div>
		<div v-else class="text-ink-gray-7 mt-5">
			{{ __('No live classes scheduled') }}
		</div>
	</div>

	<LiveClassAttendance
		v-if="showAttendance"
		v-model="showAttendance"
		:live_class="attendanceFor"
	/>
</template>
<script setup>
// TODO(a11y): the class card is click-activated — it opens the attendance
// modal — but carries nested Start/Join anchors, so it cannot become a
// <button> without invalid nesting. Reaching it by keyboard needs a dedicated
// action control, which is a redesign rather than an attribute.
import { createListResource, Button, Tooltip, call, toast } from 'frappe-ui'
import { inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { formatTime } from '@/utils/'
import { openBatchForm } from '@/composables/useBatchForms'
import LiveClassAttendance from '@/components/Modals/LiveClassAttendance.vue'
import { safeUrl } from '@/utils/safeUrl'

const user = inject('$user')
const route = useRoute()
const router = useRouter()
const dayjs = inject('$dayjs')
const readOnlyMode = window.read_only_mode
const showAttendance = ref(false)
const attendanceFor = ref(null)

const props = defineProps({
	batch: {
		type: Object,
		required: true,
	},
})

const permanentMeetUrl = ref(props.batch.data?.meet_link || '')
watch(
	() => props.batch.data?.meet_link,
	(val) => {
		if (val) permanentMeetUrl.value = val
	}
)

const savePermanentMeetUrl = async () => {
	if (!permanentMeetUrl.value.trim()) return
	try {
		await call('frappe.client.set_value', {
			doctype: 'LMS Batch',
			name: props.batch.data?.name,
			fieldname: 'meet_link',
			value: permanentMeetUrl.value.trim(),
		})
		if (props.batch.data) props.batch.data.meet_link = permanentMeetUrl.value.trim()
		toast({ title: __('Success'), message: __('Permanent classroom room link saved!'), icon: 'check' })
	} catch (e) {
		toast({ title: __('Error'), message: e.message || __('Failed to save room link'), icon: 'alert-circle' })
	}
}

const deleteLiveClass = async (cls, event) => {
	event?.stopPropagation()
	if (!confirm(__('Are you sure you want to delete this live class?'))) return
	try {
		await call('lms.lms.api.delete_documents', {
			documents: [{ doctype: 'LMS Live Class', name: cls.name }],
		})
		toast({ title: __('Success'), message: __('Live class deleted'), icon: 'check' })
		liveClasses.reload()
	} catch (e) {
		toast({ title: __('Error'), message: e.message || __('Failed to delete live class'), icon: 'alert-circle' })
	}
}

// The `cache` key is what lets LiveClassForm refresh this list after a create
// without a prop or a defineModel between them: it looks the instance up by
// this exact key (getCachedListResource) rather than constructing one, so the
// options below stay authoritative. Keep the key in step with the form's.
const liveClasses = createListResource({
	doctype: 'LMS Live Class',
	cache: ['liveClasses', props.batch.data?.name],
	filters: {
		batch_name: props.batch.data?.name,
	},
	fields: [
		'title',
		'description',
		'time',
		'date',
		'duration',
		'attendees',
		'start_url',
		'join_url',
		'owner',
		'conferencing_provider',
		'batch_name',
	],
	orderBy: 'date',
	auto: true,
})

const openLiveClassForm = () => {
	openBatchForm(router, 'NewLiveClass', props.batch.data?.name, route.hash)
}

const hasProviderAccount = () => {
	const data = props.batch.data
	if (data?.conferencing_provider === 'Zoom' && data?.zoom_account) return true
	if (
		data?.conferencing_provider === 'Google Meet' &&
		data?.google_meet_account
	)
		return true
	return false
}

const canCreateClass = () => {
	if (readOnlyMode) return false
	if (!hasProviderAccount()) return false
	return isAdmin()
}

const isAdmin = () => {
	return user.data?.is_moderator || user.data?.is_evaluator
}

const canAccessClass = (cls) => {
	if (hasClassEnded(cls)) return false
	if (isAdmin()) return true
	if (cls.date < dayjs().format('YYYY-MM-DD')) return false
	if (cls.date > dayjs().format('YYYY-MM-DD')) return false
	return true
}

const getClassStart = (cls) => {
	return new Date(`${cls.date}T${cls.time}`)
}

const getClassEnd = (cls) => {
	const classStart = getClassStart(cls)
	return new Date(classStart.getTime() + cls.duration * 60000)
}

const hasClassEnded = (cls) => {
	const classEnd = getClassEnd(cls)
	const now = new Date()
	return now > classEnd
}

const openAttendanceModal = (cls) => {
	if (!isAdmin()) return
	if (cls.attendees <= 0) return
	attendanceFor.value = cls
	showAttendance.value = true
}
</script>
<style>
.short-introduction {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	text-overflow: ellipsis;
	width: 100%;
	overflow: hidden;
	margin: 0.25rem 0 1.5rem;
	line-height: 1.5;
}
</style>

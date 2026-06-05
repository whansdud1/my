<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useNotificationsStore } from '../../stores/notifications';
import { scheduleApi, type CommonSlot, type EventCreate, type CalendarConnection } from '../../services/scheduleApi';
import CommonSlots from '../../components/CommonSlots.vue';
import MeetingForm from '../../components/MeetingForm.vue';

// 003-schedule-coordination — T013/T018 프로젝트 일정 탭
const route = useRoute();
const store = useScheduleStore();
const toast = useNotificationsStore();
const projectId = String(route.params.id);
const conn = ref<CalendarConnection | null>(null);

const TYPE_LABEL: Record<string, string> = { MEETING: '회의', DEADLINE: '마감', MILESTONE: '산출물' };

onMounted(async () => {
  await store.load(projectId);
  conn.value = await scheduleApi.getConnection();
});

const calendarConnected = computed(() => conn.value?.syncState === 'ACTIVE');

function pickSlot(_s: CommonSlot) {
  toast.info('아래 폼에서 해당 시간으로 회의를 생성하세요');
}

async function onCreate(body: EventCreate) {
  try {
    await store.createEvent(body);
    toast.success('일정이 추가되었습니다');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '추가 실패');
  }
}

async function onRsvp(eid: string, response: 'ATTEND' | 'DECLINE') {
  await store.rsvp(eid, response);
}

async function onCancel(eid: string) {
  if (!confirm('이 일정을 취소할까요?')) return;
  try {
    await store.cancel(eid);
    toast.success('일정이 취소되었습니다');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '취소 실패(팀장만 가능)');
  }
}

async function toggleCalendar() {
  if (calendarConnected.value) await scheduleApi.disconnectCalendar();
  else await scheduleApi.connectCalendar();
  conn.value = await scheduleApi.getConnection();
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}
function attendCount(rsvps: { response: string }[]): number {
  return rsvps.filter((r) => r.response === 'ATTEND').length;
}
</script>

<template>
  <section>
    <h1>프로젝트 일정</h1>

    <label class="cal-toggle">
      <input type="checkbox" :checked="calendarConnected" @change="toggleCalendar" />
      Google Calendar 동기화 {{ calendarConnected ? '켜짐' : '꺼짐' }}
    </label>

    <div v-if="store.loading">불러오는 중…</div>
    <template v-else>
      <div class="grid">
        <CommonSlots :slots="store.slots" :total-members="store.totalMembers" @pick="pickSlot" />
        <MeetingForm @submit="onCreate" />
      </div>

      <h3>등록된 일정</h3>
      <p v-if="!store.events.length" class="hint">아직 일정이 없습니다.</p>
      <ul v-else class="events">
        <li v-for="e in store.events" :key="e.id" class="event">
          <div class="ev-head">
            <span class="tag">{{ TYPE_LABEL[e.type] }}</span>
            <strong>{{ e.title }}</strong>
            <button class="link danger" @click="onCancel(e.id)">취소</button>
          </div>
          <div class="ev-time">{{ fmt(e.startsAt) }}<template v-if="e.endsAt"> – {{ fmt(e.endsAt) }}</template></div>
          <div v-if="e.type === 'MEETING'" class="rsvp">
            <span class="cnt">참석 {{ attendCount(e.rsvps) }}/{{ e.rsvps.length }}</span>
            <button class="btn small" @click="onRsvp(e.id, 'ATTEND')">참석</button>
            <button class="btn small ghost" @click="onRsvp(e.id, 'DECLINE')">불참</button>
          </div>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.cal-toggle { display: inline-flex; gap: 8px; align-items: center; margin: 8px 0 16px; font-size: 0.9rem; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
.hint { color: var(--c-fg-muted, #6b7280); font-size: 0.9rem; }
.events { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.event { border: 1px solid var(--c-border, #e5e7eb); border-radius: 10px; padding: 12px; }
.ev-head { display: flex; align-items: center; gap: 10px; }
.tag { font-size: 0.72rem; background: var(--c-bg-subtle, #f3f4f6); padding: 2px 8px; border-radius: 8px; }
.ev-time { color: var(--c-fg-muted, #6b7280); font-size: 0.85rem; margin: 4px 0; }
.rsvp { display: flex; align-items: center; gap: 8px; }
.cnt { font-size: 0.8rem; color: var(--c-fg-muted, #6b7280); }
.link { background: none; border: none; cursor: pointer; font-size: 0.78rem; }
.link.danger { color: var(--c-danger, #ef4444); margin-left: auto; }
.btn.small { padding: 3px 10px; font-size: 0.78rem; }
.btn.ghost { background: none; border: 1px solid var(--c-border, #e5e7eb); }
</style>

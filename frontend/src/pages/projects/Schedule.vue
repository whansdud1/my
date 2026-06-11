<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useNotificationsStore } from '../../stores/notifications';
import { useAuthStore } from '../../stores/auth';
import { scheduleApi, type CommonSlot, type EventCreate, type MeetingRecommendation } from '../../services/scheduleApi';
import CommonSlots from '../../components/CommonSlots.vue';
import MeetingForm from '../../components/MeetingForm.vue';

// 003-schedule-coordination — T013/T018 프로젝트 일정 탭
const route = useRoute();
const store = useScheduleStore();
const toast = useNotificationsStore();
const auth = useAuthStore();
const projectId = String(route.params.id);

const TYPE_LABEL: Record<string, string> = { MEETING: '회의', DEADLINE: '마감', MILESTONE: '산출물' };

// 프리미엄 — AI 일정 최적화
const isPremium = computed(() => !!auth.user?.premium);
const recs = ref<MeetingRecommendation[] | null>(null);
const optimizeNote = ref('');
const optimizing = ref(false);

async function runOptimize() {
  optimizing.value = true;
  try {
    const res = await scheduleApi.optimize(projectId, 60);
    recs.value = res.recommendations;
    optimizeNote.value = res.note;
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '최적화에 실패했습니다');
  } finally {
    optimizing.value = false;
  }
}

onMounted(async () => {
  await store.load(projectId);
});

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

function fmt(iso: string): string {
  return new Date(iso).toLocaleString();
}
function attendCount(rsvps: { response: string }[]): number {
  return rsvps.filter((r) => r.response === 'ATTEND').length;
}
</script>

<template>
  <section class="page">
    <h1>프로젝트 일정</h1>

    <div v-if="store.loading">불러오는 중…</div>
    <template v-else>
      <div class="grid">
        <CommonSlots :slots="store.slots" :total-members="store.totalMembers" @pick="pickSlot" />
        <MeetingForm @submit="onCreate" />
      </div>

      <!-- 프리미엄: AI 일정 최적화 -->
      <div class="optimize-card">
        <div class="opt-head">
          <h3>AI 일정 최적화 <span class="pchip">PREMIUM</span></h3>
          <button v-if="isPremium" class="btn small primary" :disabled="optimizing" @click="runOptimize">
            {{ optimizing ? '분석 중…' : '최적 회의시간 추천' }}
          </button>
        </div>

        <div v-if="!isPremium" class="opt-upsell">
          <p>팀원 가용시간·시간대 선호·기존 일정을 종합해 <b>가장 좋은 정기 회의 시간</b>을 AI가 추천합니다.</p>
          <RouterLink to="/subscription" class="btn small primary">프리미엄으로 잠금 해제</RouterLink>
        </div>

        <template v-else-if="recs">
          <p v-if="recs.length === 0" class="hint">{{ optimizeNote }}</p>
          <ol v-else class="recs">
            <li v-for="(r, i) in recs" :key="i" class="rec">
              <div class="rec-main">
                <span class="rec-rank">{{ i + 1 }}</span>
                <div>
                  <strong>{{ r.weekdayLabel }}요일 {{ r.timeLabel }}</strong>
                  <span class="rec-cov" :class="{ all: r.allAvailable }">
                    {{ r.allAvailable ? '전원 가능' : `${r.availableCount}/${r.totalMembers}명` }}
                  </span>
                </div>
                <span class="rec-score">{{ r.score }}점</span>
              </div>
              <p class="rec-why">{{ r.reasons.join(' · ') }}</p>
            </li>
          </ol>
          <p v-if="recs.length" class="hint">{{ optimizeNote }}</p>
        </template>
        <p v-else class="hint">버튼을 눌러 추천을 받아보세요.</p>
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

/* 프리미엄 AI 일정 최적화 */
.optimize-card { border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 8px 0 24px; background: linear-gradient(180deg, #fffbeb, var(--c-surface, #fff) 60%); }
.opt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.opt-head h3 { margin: 0; display: flex; align-items: center; gap: 8px; }
.pchip { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 999px; background: #fef3c7; color: #b45309; }
.opt-upsell { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
.opt-upsell p { margin: 0; font-size: 0.9rem; }
.recs { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
.rec { border: 1px solid var(--c-border, #e5e7eb); border-radius: 10px; padding: 10px 12px; background: var(--c-surface, #fff); }
.rec-main { display: flex; align-items: center; gap: 10px; }
.rec-rank { flex-shrink: 0; width: 22px; height: 22px; border-radius: 999px; background: #fef3c7; color: #b45309; font-weight: 800; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; }
.rec-cov { margin-left: 8px; font-size: 0.74rem; font-weight: 700; color: #1d4ed8; }
.rec-cov.all { color: #15803d; }
.rec-score { margin-left: auto; font-weight: 800; }
.rec-why { margin: 6px 0 0; font-size: 0.82rem; color: var(--c-fg-muted, #6b7280); }
</style>

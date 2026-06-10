<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { dashboardApi, type ProjectDashboard, type ActivityType } from '../../services/dashboardApi';
import { useNotificationsStore } from '../../stores/notifications';

// 016 — 팀 활동 실시간 모니터링 + 만족도/효율 분석 대시보드(To-Be ④·⑥)
const route = useRoute();
const toast = useNotificationsStore();
const projectId = String(route.params.id);

const data = ref<ProjectDashboard | null>(null);
const loading = ref(true);
const windowDays = ref(14);

const ACT_LABEL: Record<ActivityType, string> = {
  MEETING_JOIN: '회의 참여',
  UPLOAD: '자료 업로드',
  MESSAGE_RESP: '메시지 응답',
  DEADLINE_MET: '마감 준수',
  DEADLINE_MISS: '마감 지연',
};
const TYPE_LABEL: Record<string, string> = { MEETING: '회의', DEADLINE: '마감', MILESTONE: '산출물' };
const ACT_ORDER: ActivityType[] = ['MEETING_JOIN', 'UPLOAD', 'MESSAGE_RESP', 'DEADLINE_MET', 'DEADLINE_MISS'];

async function load() {
  loading.value = true;
  try {
    data.value = await dashboardApi.get(projectId, windowDays.value);
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '대시보드를 불러오지 못했습니다');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// 활동량 막대의 최대값(상대 비교용)
const maxMemberActivity = computed(() => {
  if (!data.value) return 1;
  return Math.max(1, ...data.value.activity.byMember.map((m) => m.total));
});

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}
function stars(n: number): string {
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}
</script>

<template>
  <section class="page">
    <div class="head">
      <div>
        <RouterLink :to="`/projects/${projectId}`" class="back">← 프로젝트로</RouterLink>
        <h1>팀 대시보드</h1>
      </div>
      <div class="head-actions">
        <select v-model.number="windowDays" @change="load" aria-label="기간">
          <option :value="7">최근 7일</option>
          <option :value="14">최근 14일</option>
          <option :value="30">최근 30일</option>
        </select>
        <RouterLink :to="`/projects/${projectId}/tasks`" class="btn ghost">📋 업무</RouterLink>
        <button class="btn ghost" @click="load">↻ 새로고침</button>
      </div>
    </div>

    <div v-if="loading" class="empty">불러오는 중…</div>

    <template v-else-if="data">
      <!-- KPI -->
      <div class="kpis">
        <div class="kpi"><span class="kpi-num">{{ data.members.length }}</span><span class="kpi-lbl">팀원</span></div>
        <div class="kpi">
          <span class="kpi-num">{{ data.tasks.stats.done }}/{{ data.tasks.stats.total }}</span>
          <span class="kpi-lbl">업무 완료</span>
        </div>
        <div class="kpi" :class="{ warn: data.tasks.stats.overdue > 0 }">
          <span class="kpi-num">{{ data.tasks.stats.overdue }}</span><span class="kpi-lbl">마감 초과</span>
        </div>
        <div class="kpi"><span class="kpi-num">{{ data.schedule.upcoming.length }}</span><span class="kpi-lbl">예정 일정</span></div>
        <div class="kpi" v-if="data.analysis.evaluation">
          <span class="kpi-num">{{ data.analysis.evaluation.overall }}</span><span class="kpi-lbl">평균 만족도</span>
        </div>
      </div>

      <div class="grid">
        <!-- 활동 모니터링 -->
        <div class="card">
          <h3>활동 모니터링 <small>(최근 {{ data.windowDays }}일)</small></h3>
          <div class="totals">
            <div v-for="k in ACT_ORDER" :key="k" class="total-chip">
              <span class="t-num">{{ data.activity.totals[k] }}</span>
              <span class="t-lbl">{{ ACT_LABEL[k] }}</span>
            </div>
          </div>
          <h4>팀원별 활동량</h4>
          <p v-if="!data.activity.byMember.length" class="muted">집계된 활동이 없습니다.</p>
          <ul v-else class="bars">
            <li v-for="m in data.activity.byMember" :key="m.userId">
              <span class="bar-name">{{ m.name }}</span>
              <span class="bar-track"><span class="bar-fill" :style="{ width: (m.total / maxMemberActivity * 100) + '%' }" /></span>
              <span class="bar-val">{{ m.total }}</span>
            </li>
          </ul>
        </div>

        <!-- 최근 활동 피드 -->
        <div class="card">
          <h3>최근 활동</h3>
          <p v-if="!data.activity.recent.length" class="muted">아직 활동 기록이 없습니다.</p>
          <ul v-else class="feed">
            <li v-for="(a, i) in data.activity.recent" :key="i">
              <strong>{{ a.name }}</strong>
              <span class="feed-act">{{ ACT_LABEL[a.activityType] }}</span>
              <span class="feed-time">{{ fmtTime(a.occurredAt) }}</span>
            </li>
          </ul>
        </div>

        <!-- 업무 진행 -->
        <div class="card">
          <h3>업무 진행</h3>
          <div class="task-stat">
            <span>할 일 {{ data.tasks.stats.todo }}</span>
            <span>진행 중 {{ data.tasks.stats.inProgress }}</span>
            <span>완료 {{ data.tasks.stats.done }}</span>
          </div>
          <h4>담당자별 완료율</h4>
          <p v-if="!data.tasks.byMember.length" class="muted">배정된 업무가 없습니다.</p>
          <ul v-else class="bars">
            <li v-for="m in data.tasks.byMember" :key="m.userId">
              <span class="bar-name">{{ m.name }}</span>
              <span class="bar-track"><span class="bar-fill green" :style="{ width: m.completionRate + '%' }" /></span>
              <span class="bar-val">{{ m.done }}/{{ m.assigned }}</span>
            </li>
          </ul>
        </div>

        <!-- 다가오는 일정 -->
        <div class="card">
          <h3>다가오는 일정</h3>
          <p v-if="!data.schedule.upcoming.length" class="muted">예정된 일정이 없습니다.</p>
          <ul v-else class="events">
            <li v-for="e in data.schedule.upcoming" :key="e.id">
              <span class="tag">{{ TYPE_LABEL[e.type] ?? e.type }}</span>
              <strong>{{ e.title }}</strong>
              <span class="feed-time">{{ fmtDate(e.startsAt) }}</span>
            </li>
          </ul>
        </div>

        <!-- 만족도 & 협업효율 분석 -->
        <div class="card wide">
          <h3>만족도 · 협업효율 분석</h3>
          <div class="analysis">
            <div class="sat">
              <h4>팀 상호 평가</h4>
              <template v-if="data.analysis.evaluation">
                <div class="sat-overall">{{ stars(data.analysis.evaluation.overall) }} <b>{{ data.analysis.evaluation.overall }}</b> / 5</div>
                <ul class="sat-list">
                  <li><span>만족도</span><b>{{ data.analysis.evaluation.avgSatisfaction }}</b></li>
                  <li><span>기여도</span><b>{{ data.analysis.evaluation.avgContribution }}</b></li>
                  <li><span>소통</span><b>{{ data.analysis.evaluation.avgCommunication }}</b></li>
                  <li><span>책임감</span><b>{{ data.analysis.evaluation.avgResponsibility }}</b></li>
                </ul>
                <p class="muted">평가 {{ data.analysis.evaluation.count }}건</p>
              </template>
              <p v-else class="muted">아직 제출된 평가가 없습니다.</p>
              <div v-if="data.analysis.peerStars" class="peer">팀원 별점 평균 {{ stars(data.analysis.peerStars.avg) }} <b>{{ data.analysis.peerStars.avg }}</b> ({{ data.analysis.peerStars.count }}건)</div>
            </div>

            <div class="eff">
              <h4>AI 협업효율 (활동 기반)</h4>
              <p v-if="!data.analysis.efficiency.length" class="muted">활동 데이터가 충분히 쌓이면 표시됩니다.</p>
              <table v-else class="eff-table">
                <thead>
                  <tr><th>팀원</th><th>종합</th><th>회의</th><th>업로드</th><th>마감</th><th>응답</th><th>완료</th></tr>
                </thead>
                <tbody>
                  <tr v-for="m in data.analysis.efficiency" :key="m.userId">
                    <td>{{ m.name }}</td>
                    <td><b>{{ m.total }}</b></td>
                    <td>{{ m.meetingRate }}</td>
                    <td>{{ m.uploadRate }}</td>
                    <td>{{ m.deadlineRate }}</td>
                    <td>{{ m.responseScore }}</td>
                    <td>{{ m.completionScore }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.page { max-width: 1024px; margin: 0 auto; padding: 24px var(--s-lg, 16px); }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.back { font-size: 0.82rem; color: var(--c-fg-muted, #6b7280); }
h1 { margin: 4px 0 0; }
.head-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.head-actions select { padding: 6px 10px; border: 1px solid var(--c-border, #e5e7eb); border-radius: 8px; font: inherit; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 12px; margin: 20px 0; }
.kpi { background: var(--c-surface, #fff); border: 1px solid var(--c-border, #e5e7eb); border-radius: 12px; padding: 16px; text-align: center; }
.kpi.warn { border-color: var(--c-danger, #ef4444); }
.kpi-num { display: block; font-size: 1.6rem; font-weight: 700; }
.kpi-lbl { font-size: 0.78rem; color: var(--c-fg-muted, #6b7280); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
.card { background: var(--c-surface, #fff); border: 1px solid var(--c-border, #e5e7eb); border-radius: 12px; padding: 16px; }
.card.wide { grid-column: 1 / -1; }
.card h3 { margin: 0 0 12px; font-size: 1rem; }
.card h3 small, .card h4 { color: var(--c-fg-muted, #6b7280); font-weight: 500; }
.card h4 { margin: 14px 0 8px; font-size: 0.82rem; }
.muted { color: var(--c-fg-muted, #9ca3af); font-size: 0.84rem; }
.totals { display: flex; gap: 8px; flex-wrap: wrap; }
.total-chip { background: var(--c-bg-subtle, #f3f4f6); border-radius: 10px; padding: 8px 12px; text-align: center; flex: 1; min-width: 72px; }
.t-num { display: block; font-size: 1.2rem; font-weight: 700; }
.t-lbl { font-size: 0.7rem; color: var(--c-fg-muted, #6b7280); }
.bars { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.bars li { display: grid; grid-template-columns: 80px 1fr 48px; align-items: center; gap: 8px; }
.bar-name { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 10px; background: var(--c-bg-subtle, #f3f4f6); border-radius: 999px; overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--c-primary, #2563eb); }
.bar-fill.green { background: #16a34a; }
.bar-val { font-size: 0.76rem; color: var(--c-fg-muted, #6b7280); text-align: right; }
.feed, .events { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.feed li, .events li { display: flex; align-items: center; gap: 8px; font-size: 0.84rem; }
.feed-act { color: var(--c-primary, #2563eb); font-size: 0.78rem; }
.feed-time { margin-left: auto; color: var(--c-fg-muted, #9ca3af); font-size: 0.74rem; }
.tag { font-size: 0.7rem; background: var(--c-bg-subtle, #f3f4f6); padding: 2px 8px; border-radius: 8px; }
.task-stat { display: flex; gap: 12px; font-size: 0.86rem; }
.analysis { display: grid; grid-template-columns: 1fr 1.4fr; gap: 20px; }
@media (max-width: 700px) { .analysis { grid-template-columns: 1fr; } }
.sat-overall { font-size: 1.1rem; color: #f59e0b; margin-bottom: 8px; }
.sat-overall b { color: var(--c-fg, #111827); }
.sat-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.sat-list li { display: flex; justify-content: space-between; font-size: 0.84rem; border-bottom: 1px solid var(--c-bg-subtle, #f3f4f6); padding: 3px 0; }
.peer { margin-top: 10px; font-size: 0.84rem; color: #f59e0b; }
.peer b { color: var(--c-fg, #111827); }
.eff-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.eff-table th, .eff-table td { padding: 5px 6px; text-align: center; border-bottom: 1px solid var(--c-bg-subtle, #f3f4f6); }
.eff-table th:first-child, .eff-table td:first-child { text-align: left; }
.btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--c-border, #e5e7eb); background: var(--c-surface, #fff); cursor: pointer; font: inherit; text-decoration: none; color: inherit; font-size: 0.82rem; }
.empty { color: var(--c-fg-muted, #6b7280); text-align: center; padding: 32px 0; }
</style>

<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { taskApi, type ProjectTask, type TaskStatus } from '../../services/taskApi';
import { useNotificationsStore } from '../../stores/notifications';

// 015 — 프로젝트 업무/태스크 보드(To-Be ③)
const route = useRoute();
const toast = useNotificationsStore();
const projectId = String(route.params.id);

const tasks = ref<ProjectTask[]>([]);
const members = ref<Array<{ userId: string; name: string }>>([]);
const loading = ref(true);
const saving = ref(false);

const form = reactive<{ title: string; assigneeId: string; dueDate: string }>({
  title: '',
  assigneeId: '',
  dueDate: '',
});

const COLUMNS: Array<{ key: TaskStatus; label: string }> = [
  { key: 'TODO', label: '할 일' },
  { key: 'IN_PROGRESS', label: '진행 중' },
  { key: 'DONE', label: '완료' },
];

const grouped = computed<Record<TaskStatus, ProjectTask[]>>(() => ({
  TODO: tasks.value.filter((t) => t.status === 'TODO'),
  IN_PROGRESS: tasks.value.filter((t) => t.status === 'IN_PROGRESS'),
  DONE: tasks.value.filter((t) => t.status === 'DONE'),
}));

const progress = computed(() => {
  const total = tasks.value.length;
  const done = grouped.value.DONE.length;
  return total ? Math.round((done / total) * 100) : 0;
});

const today = new Date().toISOString().slice(0, 10);
function isOverdue(t: ProjectTask): boolean {
  return t.status !== 'DONE' && !!t.dueDate && t.dueDate < today;
}

async function reload() {
  tasks.value = await taskApi.list(projectId);
}

onMounted(async () => {
  loading.value = true;
  try {
    const [, m] = await Promise.all([
      reload(),
      api.get<Array<{ userId: string; name: string }>>(`/projects/${projectId}/members`).then((r) => r.data),
    ]);
    members.value = m;
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '불러오기 실패');
  } finally {
    loading.value = false;
  }
});

async function onCreate() {
  if (!form.title.trim()) {
    toast.error('업무 제목을 입력하세요');
    return;
  }
  saving.value = true;
  try {
    await taskApi.create(projectId, {
      title: form.title.trim(),
      assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
      dueDate: form.dueDate || null,
    });
    form.title = '';
    form.assigneeId = '';
    form.dueDate = '';
    await reload();
    toast.success('업무가 추가되었습니다');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '추가 실패');
  } finally {
    saving.value = false;
  }
}

async function move(t: ProjectTask, status: TaskStatus) {
  if (t.status === status) return;
  try {
    await taskApi.update(t.id, { status });
    await reload();
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '상태 변경 실패');
  }
}

async function assign(t: ProjectTask, assigneeId: string) {
  try {
    await taskApi.update(t.id, { assigneeId: assigneeId ? Number(assigneeId) : null });
    await reload();
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '담당자 변경 실패');
  }
}

async function remove(t: ProjectTask) {
  if (!confirm('이 업무를 삭제할까요?')) return;
  try {
    await taskApi.remove(t.id);
    await reload();
    toast.success('업무가 삭제되었습니다');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '삭제 실패(작성자·팀장만 가능)');
  }
}

function nextStatus(s: TaskStatus): TaskStatus | null {
  if (s === 'TODO') return 'IN_PROGRESS';
  if (s === 'IN_PROGRESS') return 'DONE';
  return null;
}
function prevStatus(s: TaskStatus): TaskStatus | null {
  if (s === 'DONE') return 'IN_PROGRESS';
  if (s === 'IN_PROGRESS') return 'TODO';
  return null;
}
</script>

<template>
  <section class="page">
    <div class="head">
      <div>
        <RouterLink :to="`/projects/${projectId}`" class="back">← 프로젝트로</RouterLink>
        <h1>업무 관리</h1>
      </div>
      <RouterLink :to="`/projects/${projectId}/dashboard`" class="btn ghost">📊 대시보드</RouterLink>
    </div>

    <!-- 진행률 -->
    <div class="progress-wrap" v-if="tasks.length">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: progress + '%' }" /></div>
      <span class="progress-label">{{ grouped.DONE.length }}/{{ tasks.length }} 완료 ({{ progress }}%)</span>
    </div>

    <!-- 새 업무 -->
    <form class="new-task" @submit.prevent="onCreate">
      <input v-model="form.title" type="text" placeholder="할 일을 입력하세요 (예: 자료 조사)" maxlength="200" />
      <select v-model="form.assigneeId" aria-label="담당자">
        <option value="">담당자 없음</option>
        <option v-for="m in members" :key="m.userId" :value="m.userId">{{ m.name }}</option>
      </select>
      <input v-model="form.dueDate" type="date" :min="today" aria-label="마감일" />
      <button class="btn primary" :disabled="saving">{{ saving ? '추가 중…' : '추가' }}</button>
    </form>

    <div v-if="loading" class="empty">불러오는 중…</div>
    <p v-else-if="!tasks.length" class="empty">아직 등록된 업무가 없습니다. 첫 업무를 추가해 보세요.</p>

    <!-- 보드 -->
    <div v-else class="board">
      <div v-for="col in COLUMNS" :key="col.key" class="column">
        <h3 class="col-head">{{ col.label }} <span class="cnt">{{ grouped[col.key].length }}</span></h3>
        <p v-if="!grouped[col.key].length" class="col-empty">비어 있음</p>
        <article v-for="t in grouped[col.key]" :key="t.id" class="task" :class="{ overdue: isOverdue(t) }">
          <div class="task-title">{{ t.title }}</div>
          <div class="task-meta">
            <select :value="t.assigneeId ?? ''" class="assignee" @change="assign(t, ($event.target as HTMLSelectElement).value)">
              <option value="">담당자 없음</option>
              <option v-for="m in members" :key="m.userId" :value="m.userId">{{ m.name }}</option>
            </select>
            <span v-if="t.dueDate" class="due" :class="{ late: isOverdue(t) }">📅 {{ t.dueDate }}</span>
          </div>
          <div class="task-actions">
            <button v-if="prevStatus(t.status)" class="link" @click="move(t, prevStatus(t.status)!)">←</button>
            <button v-if="nextStatus(t.status)" class="link strong" @click="move(t, nextStatus(t.status)!)">
              {{ t.status === 'TODO' ? '시작' : '완료' }} →
            </button>
            <button class="link danger" @click="remove(t)">삭제</button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page { max-width: 1024px; margin: 0 auto; padding: 24px var(--s-lg, 16px); }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.back { font-size: 0.82rem; color: var(--c-fg-muted, #6b7280); }
h1 { margin: 4px 0 0; }
.progress-wrap { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
.progress-bar { flex: 1; height: 8px; background: var(--c-bg-subtle, #f3f4f6); border-radius: 999px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--c-primary, #2563eb); transition: width 0.3s; }
.progress-label { font-size: 0.82rem; color: var(--c-fg-muted, #6b7280); white-space: nowrap; }
.new-task { display: flex; gap: 8px; flex-wrap: wrap; margin: 16px 0 24px; }
.new-task input[type='text'] { flex: 1; min-width: 200px; }
.new-task input, .new-task select { padding: 8px 10px; border: 1px solid var(--c-border, #e5e7eb); border-radius: 8px; font: inherit; }
.board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 800px) { .board { grid-template-columns: 1fr; } }
.column { background: var(--c-bg-subtle, #f9fafb); border-radius: 12px; padding: 12px; }
.col-head { margin: 0 0 10px; font-size: 0.92rem; display: flex; align-items: center; gap: 6px; }
.col-head .cnt { font-size: 0.74rem; background: var(--c-border, #e5e7eb); border-radius: 999px; padding: 1px 8px; }
.col-empty { color: var(--c-fg-muted, #9ca3af); font-size: 0.82rem; text-align: center; padding: 12px 0; }
.task { background: var(--c-surface, #fff); border: 1px solid var(--c-border, #e5e7eb); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
.task.overdue { border-color: var(--c-danger, #ef4444); }
.task-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 6px; }
.task-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.assignee { font-size: 0.76rem; padding: 2px 6px; border: 1px solid var(--c-border, #e5e7eb); border-radius: 6px; }
.due { font-size: 0.74rem; color: var(--c-fg-muted, #6b7280); }
.due.late { color: var(--c-danger, #ef4444); font-weight: 600; }
.task-actions { display: flex; gap: 10px; align-items: center; }
.link { background: none; border: none; cursor: pointer; font-size: 0.78rem; color: var(--c-fg-muted, #6b7280); padding: 0; }
.link.strong { color: var(--c-primary, #2563eb); font-weight: 600; }
.link.danger { color: var(--c-danger, #ef4444); margin-left: auto; }
.btn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--c-border, #e5e7eb); background: var(--c-surface, #fff); cursor: pointer; font: inherit; text-decoration: none; color: inherit; }
.btn.primary { background: var(--c-primary, #2563eb); color: #fff; border-color: transparent; }
.btn.ghost { font-size: 0.82rem; }
.empty { color: var(--c-fg-muted, #6b7280); text-align: center; padding: 32px 0; }
</style>

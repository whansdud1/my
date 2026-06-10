<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

interface MyProject {
  id: string;
  title: string;
  status: 'RECRUIT' | 'RUNNING' | 'CLOSED' | 'ARCHIVED';
  endDate: string | null;
  myRole: string;
  myState: string;
}

const projects = ref<MyProject[]>([]);
const loading = ref(true);
const notify = useNotificationsStore();

function statusLabel(status: string) {
  if (status === 'RECRUIT') return '팀원 모집 중';
  if (status === 'RUNNING') return '진행 중';
  return '완료';
}

onMounted(async () => {
  try {
    const { data } = await api.get<MyProject[]>('/projects/mine');
    projects.value = data;
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '프로젝트를 불러올 수 없습니다.');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="page hub">
    <header class="page-head">
      <h1>추천 팀원</h1>
      <p class="hint">프로젝트를 선택하면 역할별 · 별점(★) 높은 순 추천 팀원을 볼 수 있습니다.</p>
    </header>

    <div v-if="loading">불러오는 중…</div>
    <div
      v-else-if="projects.length === 0"
      class="empty card"
    >
      <p>참여 중인 프로젝트가 없습니다. 먼저 프로젝트를 만들어보세요.</p>
      <RouterLink
        to="/projects/new"
        class="btn primary"
      >+ 새 프로젝트</RouterLink>
    </div>
    <ul
      v-else
      class="list"
    >
      <li
        v-for="p in projects"
        :key="p.id"
        class="card"
      >
        <div class="row">
          <RouterLink
            :to="`/projects/${p.id}/recommendations`"
            class="title"
          >{{ p.title }}</RouterLink>
          <span
            class="status"
            :data-status="p.status"
          >{{ statusLabel(p.status) }}</span>
        </div>
        <div class="row foot">
          <span class="meta">내 역할 {{ p.myRole }}</span>
          <RouterLink
            :to="`/projects/${p.id}/recommendations`"
            class="btn"
          >추천 팀원 보기 →</RouterLink>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.hub {
  max-width: 760px;
  margin: 0 auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
  margin-top: 4px;
}
.list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.row.foot {
  margin-top: 8px;
}
.title {
  font-size: 1.05rem;
  font-weight: 600;
}
.meta {
  color: var(--c-fg-muted);
  font-size: 0.85rem;
}
.status {
  font-size: 0.78rem;
  color: var(--c-fg-muted);
  white-space: nowrap;
}
.empty {
  text-align: center;
  padding: 32px;
}
</style>

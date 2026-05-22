<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../services/api';
import { RouterLink } from 'vue-router';

interface Pending {
  projectId: string;
  projectTitle: string;
  endedAt: string;
  dueAt: string;
  submitted: boolean;
}

const list = ref<Pending[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const { data } = await api.get<Pending[]>('/evaluations/pending');
    list.value = data;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section>
    <h1>내 평가</h1>
    <p class="hint">종료된 프로젝트에 대한 동료 평가는 14일 이내 제출해야 합니다.</p>

    <div v-if="loading">불러오는 중…</div>
    <div v-else-if="list.length === 0" class="card">현재 작성할 평가가 없습니다.</div>
    <ul v-else class="list">
      <li v-for="p in list" :key="p.projectId" class="card">
        <div class="row">
          <strong>{{ p.projectTitle }}</strong>
          <span :class="{ submitted: p.submitted, due: !p.submitted }">
            {{ p.submitted ? '✓ 제출 완료' : `마감 ${p.dueAt}` }}
          </span>
        </div>
        <RouterLink
          v-if="!p.submitted"
          :to="`/evaluations/${p.projectId}/submit`"
          class="btn primary"
          >평가 작성</RouterLink
        >
      </li>
    </ul>
  </section>
</template>

<style scoped>
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.submitted {
  color: var(--c-success);
}
.due {
  color: var(--c-warning);
}
</style>

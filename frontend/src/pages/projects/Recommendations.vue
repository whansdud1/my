<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

interface Candidate {
  userId: string;
  name: string;
  major?: string;
  grade?: number;
  rating: number;
  matchScore: number;
  breakdown: { role: number; overlap: number; style: number; rating: number; trust: number; diversity: number };
  preferredRoles: string[];
}

const route = useRoute();
const id = route.params.id as string;
const list = ref<Candidate[]>([]);
const loading = ref(true);
const notify = useNotificationsStore();

onMounted(async () => {
  try {
    const { data } = await api.get<Candidate[]>(`/projects/${id}/recommendations`, {
      params: { limit: 10 },
    });
    list.value = data;
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '추천을 불러올 수 없습니다.');
  } finally {
    loading.value = false;
  }
});

async function invite(c: Candidate) {
  try {
    await api.post(`/projects/${id}/invites`, { userId: c.userId });
    notify.success(`${c.name} 에게 초대를 보냈습니다.`);
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '초대 발송 실패');
  }
}
</script>

<template>
  <section class="page rec">
    <h1>매칭 후보</h1>
    <p class="hint">적합도 점수 기준 상위 10명. 점수 막대에 마우스를 올리면 세부 가중치를 볼 수 있습니다.</p>

    <div v-if="loading">계산 중…</div>
    <div v-else-if="list.length === 0" class="card empty">
      <p>현재 조건에 맞는 후보가 없습니다. 프로젝트 조건을 조정해보세요.</p>
    </div>
    <div v-else class="grid">
      <article v-for="c in list" :key="c.userId" class="card cand">
        <header>
          <h3>{{ c.name }}</h3>
          <span class="score">{{ c.matchScore.toFixed(1) }}</span>
        </header>
        <p class="meta">
          {{ c.major }} · {{ c.grade }}학년 · ★{{ c.rating.toFixed(1) }}
        </p>
        <div class="roles">
          <span v-for="r in c.preferredRoles" :key="r" class="chip">{{ r }}</span>
        </div>
        <div class="bar" :title="JSON.stringify(c.breakdown, null, 2)">
          <span
            v-for="(v, k) in c.breakdown"
            :key="k"
            :style="{ flex: v }"
            :class="`seg seg-${k}`"
            :aria-label="`${k} ${v}`"
          ></span>
        </div>
        <button class="btn primary" @click="invite(c)">초대</button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.rec {
  max-width: 1100px;
  margin: 0 auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 12px;
}
.cand header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.cand h3 {
  margin: 0;
  font-size: 1.05rem;
}
.score {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--c-accent);
}
.meta {
  color: var(--c-fg-muted);
  font-size: 0.88rem;
  margin: 4px 0 8px;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.chip {
  background: var(--c-accent-soft);
  color: var(--c-accent);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
}
.bar {
  display: flex;
  height: 8px;
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 10px;
  cursor: help;
}
.seg {
  height: 100%;
}
.seg-role {
  background: #3b82f6;
}
.seg-overlap {
  background: #22c55e;
}
.seg-style {
  background: #a855f7;
}
.seg-rating {
  background: #f59e0b;
}
.seg-trust {
  background: #14b8a6;
}
.seg-diversity {
  background: #ef4444;
}
.empty {
  text-align: center;
  padding: 32px;
}
</style>

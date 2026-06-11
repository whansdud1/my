<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
  breakdown: {
    role: number;
    overlap: number;
    style: number;
    rating: number;
    trust: number;
    diversity: number;
  };
  preferredRoles: string[];
}

interface RoleGroup {
  role: string;
  candidates: Candidate[];
}

const route = useRoute();
const id = route.params.id as string;
const groups = ref<RoleGroup[]>([]);
const activeRole = ref<string>('');
const loading = ref(true);
const notify = useNotificationsStore();

// 현재 선택된 역할 탭의 후보 (별점 높은 순 상위 10명)
const activeCandidates = computed<Candidate[]>(
  () => groups.value.find((g) => g.role === activeRole.value)?.candidates ?? [],
);

onMounted(async () => {
  try {
    const { data } = await api.get<RoleGroup[]>(`/projects/${id}/recommendations/by-role`);
    groups.value = data;
    // 후보가 있는 첫 역할을 기본 탭으로, 없으면 첫 역할
    activeRole.value = (data.find((g) => g.candidates.length > 0) ?? data[0])?.role ?? '';
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
    <div class="head">
      <div>
        <h1>추천 팀원</h1>
        <p class="hint">
          역할별 탭 · 별점(★) 높은 순 상위 10명. 점수 막대에 마우스를 올리면 세부 가중치를 볼 수
          있습니다.
        </p>
      </div>
    </div>

    <div v-if="loading">
      계산 중…
    </div>
    <div
      v-else-if="groups.length === 0"
      class="card empty"
    >
      <p>모집 역할이 없어 후보를 나눌 수 없습니다. 프로젝트의 모집 역할을 먼저 설정해보세요.</p>
    </div>
    <template v-else>
      <!-- 역할별 탭 -->
      <nav
        class="tabs"
        role="tablist"
      >
        <button
          v-for="g in groups"
          :key="g.role"
          class="tab"
          :class="{ active: activeRole === g.role }"
          role="tab"
          :aria-selected="activeRole === g.role"
          @click="activeRole = g.role"
        >
          {{ g.role }}
          <span class="tab-count">{{ g.candidates.length }}</span>
        </button>
      </nav>

      <div
        v-if="activeCandidates.length === 0"
        class="card empty"
      >
        <p>이 역할에 맞는 후보가 아직 없습니다.</p>
      </div>
      <div
        v-else
        class="grid"
      >
        <article
          v-for="c in activeCandidates"
          :key="c.userId"
          class="card cand"
        >
          <header>
            <h3>{{ c.name }}</h3>
            <span class="score">★{{ c.rating.toFixed(1) }}</span>
          </header>
          <p class="meta">
            {{ c.major }} · {{ c.grade }}학년 · 적합도 {{ c.matchScore.toFixed(1) }}
          </p>
          <div class="roles">
            <span
              v-for="r in c.preferredRoles"
              :key="r"
              class="chip"
            >{{ r }}</span>
          </div>
          <div
            class="bar"
            :title="JSON.stringify(c.breakdown, null, 2)"
          >
            <span
              v-for="(v, k) in c.breakdown"
              :key="k"
              :style="{ flex: v }"
              :class="`seg seg-${k}`"
              :aria-label="`${k} ${v}`"
            />
          </div>
          <button
            class="btn primary"
            @click="invite(c)"
          >
            초대
          </button>
        </article>
      </div>
    </template>
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

/* 역할별 탭 */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid var(--c-border, #e5e7eb);
  margin-top: 16px;
}
.tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 8px 14px;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--c-fg-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
}
.tab:hover {
  color: var(--c-fg, #111);
}
.tab.active {
  color: var(--c-accent);
  border-bottom-color: var(--c-accent);
}
.tab-count {
  background: var(--c-accent-soft);
  color: var(--c-accent);
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0 7px;
  border-radius: 999px;
  line-height: 1.5;
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

/* 헤더 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
</style>

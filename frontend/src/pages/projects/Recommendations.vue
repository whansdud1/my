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

// --- 자동 팀 편성 ---
interface ComposePick {
  userId: string;
  name: string;
  major?: string;
  grade?: number;
  rating: number;
  role: string;
  roleMatched: boolean;
  matchScore: number;
  breakdown: Candidate['breakdown'];
  preferredRoles: string[];
}
interface ComposeResult {
  projectId: string;
  targetSize: number;
  acceptedCount: number;
  openSlots: number;
  picks: ComposePick[];
  unfilledRoles: Array<{ role: string; remaining: number }>;
  teamFitAvg: number;
  committed: boolean;
  invited?: Array<{ userId: string; role: string; ok: boolean; reason?: string }>;
}

const composing = ref(false);
const committing = ref(false);
const proposal = ref<ComposeResult | null>(null);

async function autoCompose() {
  composing.value = true;
  try {
    const { data } = await api.post<ComposeResult>(`/projects/${id}/auto-compose`, {
      commit: false,
    });
    proposal.value = data;
    if (data.picks.length === 0) {
      notify.error('채울 수 있는 후보가 없습니다. 모집 조건을 조정해보세요.');
    }
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '자동 편성에 실패했습니다.');
  } finally {
    composing.value = false;
  }
}

async function commitCompose() {
  committing.value = true;
  try {
    const { data } = await api.post<ComposeResult>(`/projects/${id}/auto-compose`, {
      commit: true,
    });
    const okCount = (data.invited ?? []).filter((i) => i.ok).length;
    const failCount = (data.invited ?? []).length - okCount;
    notify.success(
      failCount > 0
        ? `${okCount}명 초대 완료, ${failCount}명 실패`
        : `${okCount}명에게 일괄 초대를 보냈습니다.`,
    );
    proposal.value = null;
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '일괄 초대에 실패했습니다.');
  } finally {
    committing.value = false;
  }
}

function closeProposal() {
  proposal.value = null;
}
</script>

<template>
  <section class="page rec">
    <div class="head">
      <div>
        <h1>매칭 후보</h1>
        <p class="hint">
          역할별 탭 · 별점(★) 높은 순 상위 10명. 점수 막대에 마우스를 올리면 세부 가중치를 볼 수
          있습니다.
        </p>
      </div>
      <button
        class="btn primary auto-btn"
        :disabled="composing"
        @click="autoCompose"
      >
        {{ composing ? '편성 중…' : '⚡ 자동 팀 편성' }}
      </button>
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

    <!-- 자동 팀 편성 제안 모달 -->
    <div
      v-if="proposal"
      class="modal-backdrop"
      @click.self="closeProposal"
    >
      <div
        class="modal"
        role="dialog"
        aria-label="자동 팀 편성 제안"
      >
        <header class="modal-head">
          <h2>자동 팀 편성 제안</h2>
          <button
            class="close"
            aria-label="닫기"
            @click="closeProposal"
          >
            ✕
          </button>
        </header>

        <p class="summary">
          현재 {{ proposal.acceptedCount }}명 / 정원 {{ proposal.targetSize }}명 · 빈 자리
          {{ proposal.openSlots }}개에 <strong>{{ proposal.picks.length }}명</strong>을 제안합니다.
          <span
            v-if="proposal.picks.length"
            class="fit"
          >평균 적합도 {{ proposal.teamFitAvg.toFixed(1) }}</span>
        </p>

        <ul
          v-if="proposal.picks.length"
          class="picks"
        >
          <li
            v-for="p in proposal.picks"
            :key="p.userId"
            class="pick"
          >
            <div class="pick-main">
              <span
                class="role-tag"
                :class="{ mismatch: !p.roleMatched }"
              >{{ p.role }}</span>
              <span class="pick-name">{{ p.name }}</span>
              <span class="pick-meta">{{ p.major }} · {{ p.grade }}학년 · ★{{ p.rating.toFixed(1) }}</span>
              <span
                v-if="!p.roleMatched"
                class="warn"
                title="후보의 선호 역할과 다른 역할로 배정됨"
              >역할 불일치</span>
            </div>
            <span
              class="pick-score"
              :title="JSON.stringify(p.breakdown, null, 2)"
            >{{
              p.matchScore.toFixed(1)
            }}</span>
          </li>
        </ul>
        <p
          v-else
          class="empty-note"
        >
          제안할 후보가 없습니다.
        </p>

        <p
          v-if="proposal.unfilledRoles.length"
          class="unfilled"
        >
          ⚠ 후보 부족으로 미충원:
          <span
            v-for="u in proposal.unfilledRoles"
            :key="u.role"
            class="chip"
          >{{ u.role }} {{ u.remaining }}</span>
        </p>

        <footer class="modal-foot">
          <button
            class="btn ghost"
            @click="closeProposal"
          >
            취소
          </button>
          <button
            class="btn primary"
            :disabled="committing || proposal.picks.length === 0"
            @click="commitCompose"
          >
            {{ committing ? '초대 발송 중…' : `${proposal.picks.length}명 일괄 초대` }}
          </button>
        </footer>
      </div>
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

/* 헤더 + 자동 편성 버튼 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.auto-btn {
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 4px;
}

/* 제안 모달 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 16px;
}
.modal {
  background: var(--c-bg, #fff);
  border-radius: 12px;
  max-width: 560px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  padding: 20px 22px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.modal-head h2 {
  margin: 0;
  font-size: 1.2rem;
}
.close {
  background: none;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  color: var(--c-fg-muted);
}
.summary {
  color: var(--c-fg-muted);
  font-size: 0.92rem;
  margin: 4px 0 14px;
}
.summary .fit {
  margin-left: 6px;
  color: var(--c-accent);
  font-weight: 600;
}
.picks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pick {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--c-border, #e5e7eb);
  border-radius: 8px;
}
.pick-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.role-tag {
  background: var(--c-accent-soft, #e0e7ff);
  color: var(--c-accent, #4f46e5);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
}
.role-tag.mismatch {
  background: #fef3c7;
  color: #b45309;
}
.pick-name {
  font-weight: 600;
}
.pick-meta {
  color: var(--c-fg-muted);
  font-size: 0.82rem;
}
.warn {
  color: #b45309;
  font-size: 0.74rem;
}
.pick-score {
  font-weight: 700;
  color: var(--c-accent);
  cursor: help;
}
.unfilled {
  margin-top: 12px;
  font-size: 0.86rem;
  color: #b45309;
}
.unfilled .chip {
  background: #fef3c7;
  color: #b45309;
  margin-left: 4px;
}
.empty-note {
  text-align: center;
  color: var(--c-fg-muted);
  padding: 16px;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
</style>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useProjectStore, type Applicant } from '../../stores/projects';
import { useNotificationsStore } from '../../stores/notifications';
import ProjectChat from '../../components/ProjectChat.vue';
import StarRating from '../../components/StarRating.vue';

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const store = useProjectStore();
const notify = useNotificationsStore();

interface Member {
  userId: string;
  name: string;
  role: string;
  joinedAt: string;
}

const members = ref<Member[]>([]);
const applicants = ref<Applicant[]>([]);
const inviteEmail = ref('');
const inviteLoading = ref(false);

const applyRole = ref('');
const applyLoading = ref(false);
const decideLoading = ref<string | null>(null);

const proj = computed(() => store.current);
const isOwner = computed(() => !!proj.value?.isOwner);
const myState = computed(() => proj.value?.myMembership?.state ?? null);
const roles = computed(() => proj.value?.roles ?? []);
const openRoles = computed(() => roles.value.filter((r) => r.remaining > 0));
const recruitClosed = computed(() => !!proj.value?.recruitClosed);
// 시작됨: 팀장이 '프로젝트 시작'을 눌러 RECRUIT 를 벗어난 상태
const started = computed(() => !!proj.value && proj.value.status !== 'RECRUIT');
// 삭제 가능: 팀장이며 아직 모집 중(RECRUIT)일 때만
const canDelete = computed(() => isOwner.value && proj.value?.status === 'RECRUIT');
// 프로젝트 시작 가능: 팀장이며 아직 시작 전(RECRUIT)일 때 — 팀장은 언제든 시작 가능
const canStart = computed(() => isOwner.value && proj.value?.status === 'RECRUIT');
// 완료됨(CLOSED/ARCHIVED)
const completed = computed(
  () => proj.value?.status === 'CLOSED' || proj.value?.status === 'ARCHIVED',
);
// 프로젝트 완료 가능: 팀장이며 진행 중(RUNNING)일 때
const canComplete = computed(() => isOwner.value && proj.value?.status === 'RUNNING');
// 팀원 평가 가능: 완료된 프로젝트 + ACCEPTED 멤버(=팀장 포함)
const canEvaluate = computed(() => completed.value && (isOwner.value || myState.value === 'ACCEPTED'));

// 팀 채팅: 프로젝트가 시작된 뒤 + ACCEPTED 멤버(=팀장 포함)만 참여 가능
const canChat = computed(() => started.value && (isOwner.value || myState.value === 'ACCEPTED'));
const activeTab = ref<'overview' | 'chat' | 'eval'>('overview');
const chatUnread = ref(0);

// 지원 가능 조건: 모집 중(미종료) + 팀장 아님 + (미지원 또는 과거 탈퇴/거절) + 남은 역할 존재
const canApply = computed(
  () =>
    !!proj.value &&
    !recruitClosed.value &&
    proj.value.status === 'RECRUIT' &&
    !isOwner.value &&
    (myState.value === null || myState.value === 'LEFT' || myState.value === 'REJECTED') &&
    openRoles.value.length > 0,
);

async function loadMembers() {
  try {
    const { data } = await api.get<Member[]>(`/projects/${id}/members`);
    members.value = data;
  } catch {
    members.value = [];
  }
}

// 지원자 평판(종합 별점 + 익명 후기) — 팀장이 승인 판단 시 참고
interface UserReview {
  stars: number;
  comment: string;
  ratedAt: string;
}
interface UserReputation {
  stars: number;
  count: number;
  reviews: UserReview[];
}
const applicantRep = ref<Record<string, UserReputation>>({});
const expandedApplicant = ref<string | null>(null);

async function loadApplicantReputations() {
  await Promise.all(
    applicants.value.map(async (a) => {
      try {
        const { data } = await api.get<UserReputation>(`/users/${a.userId}/reviews`);
        applicantRep.value[a.userId] = data;
      } catch {
        applicantRep.value[a.userId] = { stars: 0, count: 0, reviews: [] };
      }
    }),
  );
}

function toggleReviews(uid: string) {
  expandedApplicant.value = expandedApplicant.value === uid ? null : uid;
}

async function loadApplicants() {
  if (!isOwner.value) return;
  try {
    applicants.value = await store.fetchApplicants(id);
    await loadApplicantReputations();
  } catch {
    applicants.value = [];
  }
}

async function reload() {
  await store.fetchOne(id);
  await Promise.all([loadMembers(), loadApplicants(), loadEvaluation()]);
}

onMounted(reload);

async function doApply() {
  if (!applyRole.value) {
    notify.warn('지원할 역할을 선택해주세요.');
    return;
  }
  applyLoading.value = true;
  try {
    await store.apply(id, applyRole.value);
    notify.success(`'${applyRole.value}' 역할로 지원했습니다. 팀장 승인을 기다려주세요.`);
    applyRole.value = '';
    await reload();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '지원에 실패했습니다.');
  } finally {
    applyLoading.value = false;
  }
}

async function decide(userId: string, action: 'ACCEPT' | 'REJECT') {
  decideLoading.value = userId + action;
  try {
    await store.decide(id, userId, action);
    notify.success(action === 'ACCEPT' ? '지원을 수락했습니다.' : '지원을 거절했습니다.');
    await reload();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '처리에 실패했습니다.');
  } finally {
    decideLoading.value = null;
  }
}

async function sendInvite() {
  inviteLoading.value = true;
  try {
    await api.post(`/projects/${id}/invites`, { email: inviteEmail.value });
    notify.success(`${inviteEmail.value} 에게 초대를 보냈습니다.`);
    inviteEmail.value = '';
    await reload();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '초대 발송에 실패했습니다.');
  } finally {
    inviteLoading.value = false;
  }
}

// --- 팀원 별점 평가 ---
interface EvalRow {
  userId: string;
  name: string;
  role: string;
  stars: number;
  comment: string;
}
const evalRows = ref<EvalRow[]>([]);
const evalLoading = ref(false);
const evalSubmitting = ref(false);

async function loadEvaluation() {
  if (!canEvaluate.value) {
    evalRows.value = [];
    return;
  }
  evalLoading.value = true;
  try {
    const [tmRes, mineRes] = await Promise.all([
      api.get<Array<{ userId: string; name: string; role: string }>>(`/projects/${id}/teammates`),
      api.get<Array<{ rateeId: string; stars: number; comment: string | null }>>(
        `/projects/${id}/ratings/mine`,
      ),
    ]);
    const mine = new Map(mineRes.data.map((m) => [m.rateeId, m]));
    evalRows.value = tmRes.data.map((t) => ({
      userId: t.userId,
      name: t.name,
      role: t.role,
      stars: mine.get(t.userId)?.stars ?? 0,
      comment: mine.get(t.userId)?.comment ?? '',
    }));
  } catch {
    evalRows.value = [];
  } finally {
    evalLoading.value = false;
  }
}

async function submitRatings() {
  // 코멘트만 적고 별점을 안 준 경우 — 코멘트가 저장되지 않으므로 막고 안내
  const missingStar = evalRows.value.filter((r) => r.comment.trim() && r.stars === 0);
  if (missingStar.length > 0) {
    notify.warn(
      `${missingStar.map((r) => r.name).join(', ')}님은 코멘트만 있고 별점이 없습니다. 별점을 함께 선택해주세요.`,
    );
    return;
  }
  const items = evalRows.value
    .filter((r) => r.stars > 0)
    .map((r) => ({ rateeId: r.userId, stars: r.stars, comment: r.comment.trim() || undefined }));
  if (items.length === 0) {
    notify.warn('한 명 이상에게 별점을 매겨주세요.');
    return;
  }
  evalSubmitting.value = true;
  try {
    await api.post(`/projects/${id}/ratings`, { items });
    notify.success('팀원 평가를 저장했습니다. 감사합니다!');
    await loadEvaluation();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '평가 저장에 실패했습니다.');
  } finally {
    evalSubmitting.value = false;
  }
}

const completing = ref(false);
async function completeProject() {
  if (!window.confirm('프로젝트를 완료할까요? 완료하면 팀원들이 서로를 별점으로 평가할 수 있습니다.')) return;
  completing.value = true;
  try {
    await store.complete(id);
    notify.success('프로젝트를 완료했습니다. 팀원 평가를 시작할 수 있어요.');
    activeTab.value = 'eval';
    await reload();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '프로젝트 완료에 실패했습니다.');
  } finally {
    completing.value = false;
  }
}

const starting = ref(false);
async function startProject() {
  const msg = recruitClosed.value
    ? '프로젝트를 시작할까요? 시작하면 팀 채팅이 열리고 더 이상 모집할 수 없습니다.'
    : '아직 모집이 끝나지 않았습니다. 지금 시작하면 추가 모집이 마감되고 팀 채팅이 열립니다. 시작할까요?';
  if (!window.confirm(msg)) return;
  starting.value = true;
  try {
    await store.start(id);
    notify.success('프로젝트를 시작했습니다. 이제 팀 채팅을 사용할 수 있어요.');
    activeTab.value = 'chat';
    await reload();
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '프로젝트 시작에 실패했습니다.');
  } finally {
    starting.value = false;
  }
}

const deleting = ref(false);
async function deleteProject() {
  if (!window.confirm('이 프로젝트를 삭제할까요? 되돌릴 수 없습니다.')) return;
  deleting.value = true;
  try {
    await store.remove(id);
    notify.success('프로젝트를 삭제했습니다.');
    router.push('/projects');
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '삭제에 실패했습니다.');
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="page detail" v-if="proj">
    <header class="head">
      <h1>{{ proj.title }}</h1>
      <div class="head-right">
        <span
          class="status"
          :class="{ closed: completed || (recruitClosed && !started), running: started && !completed }"
        >
          {{ completed ? '완료' : started ? '진행 중' : recruitClosed ? '팀원 모집 종료' : '팀원 모집 중' }}
        </span>
        <button v-if="canStart" class="btn primary small" :disabled="starting" @click="startProject">
          {{ starting ? '시작 중…' : '⚡ 프로젝트 시작' }}
        </button>
        <button v-if="canComplete" class="btn primary small" :disabled="completing" @click="completeProject">
          {{ completing ? '완료 중…' : '✓ 프로젝트 완료' }}
        </button>
        <button v-if="canDelete" class="btn danger small" :disabled="deleting" @click="deleteProject">
          {{ deleting ? '삭제 중…' : '프로젝트 삭제' }}
        </button>
      </div>
    </header>
    <p class="desc">{{ proj.description }}</p>

    <!-- 탭: 개요 / 팀 채팅 -->
    <nav class="tabs">
      <button
        type="button"
        :class="{ active: activeTab === 'overview' }"
        @click="activeTab = 'overview'"
      >
        개요
      </button>
      <button
        v-if="canChat"
        type="button"
        :class="{ active: activeTab === 'chat' }"
        @click="activeTab = 'chat'"
      >
        팀 채팅
        <span v-if="chatUnread > 0" class="tab-badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
      </button>
      <button
        v-if="canEvaluate"
        type="button"
        :class="{ active: activeTab === 'eval' }"
        @click="activeTab = 'eval'"
      >
        팀원 평가
      </button>
    </nav>

    <!-- 팀원 별점 평가 -->
    <div v-if="canEvaluate" v-show="activeTab === 'eval'" class="eval-panel">
      <div class="card">
        <h3>팀원 평가</h3>
        <p class="eval-help">
          함께한 팀원에게 별점을 남겨주세요. 별 반 개(0.5점) 단위로 줄 수 있어요. 언제든 다시 수정할 수 있습니다.
          <strong>모든 평가는 익명으로 전달</strong>되며, 누가 어떤 평가를 남겼는지는 공개되지 않습니다.
        </p>
        <div v-if="evalLoading" class="empty">불러오는 중…</div>
        <div v-else-if="evalRows.length === 0" class="empty">평가할 팀원이 없습니다.</div>
        <ul v-else class="eval-list">
          <li v-for="row in evalRows" :key="row.userId" class="eval-row">
            <div class="eval-who">
              <strong>{{ row.name }}</strong>
              <span class="role">{{ row.role }}</span>
            </div>
            <div class="eval-stars">
              <StarRating v-model="row.stars" :size="30" />
              <span class="eval-score">{{ row.stars > 0 ? row.stars.toFixed(1) : '—' }}</span>
            </div>
            <textarea
              class="input eval-comment"
              v-model="row.comment"
              maxlength="500"
              rows="2"
              placeholder="이 팀원의 좋았던 점·아쉬웠던 점을 간략히 적어주세요 (선택, 익명)"
            ></textarea>
          </li>
        </ul>
        <div class="eval-actions" v-if="evalRows.length > 0">
          <button class="btn primary" :disabled="evalSubmitting" @click="submitRatings">
            {{ evalSubmitting ? '저장 중…' : '평가 저장' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 팀 채팅 패널 — 계속 마운트해 두어(숨김) 다른 탭에서도 안읽음을 집계 -->
    <ProjectChat
      v-if="canChat"
      v-show="activeTab === 'chat'"
      :project-id="id"
      :active="activeTab === 'chat'"
      @update:unread="chatUnread = $event"
    />

    <!-- 개요 -->
    <div v-show="activeTab === 'overview'">
    <!-- 팀장 안내: 시작 전이면 채팅이 잠겨 있음 -->
    <div v-if="canStart" class="start-hint">
      <span>
        팀원을 다 모았다면 <strong>프로젝트 시작</strong>을 눌러주세요. 시작하면 팀 채팅이 열립니다.
      </span>
      <button class="btn primary small" :disabled="starting" @click="startProject">
        {{ starting ? '시작 중…' : '⚡ 프로젝트 시작' }}
      </button>
    </div>
    <!-- 역할 현황 -->
    <div class="card">
      <div class="roles-head">
        <h3>역할 현황</h3>
        <span v-if="recruitClosed" class="closed-badge">팀원 모집 종료</span>
      </div>
      <ul class="roles-status" v-if="roles.length">
        <li v-for="r in roles" :key="r.role" :class="{ full: r.remaining === 0 }">
          <span class="rname">{{ r.role }}</span>
          <span class="rcount">{{ r.filled }} / {{ r.needed }}</span>
          <span class="rtag" :class="r.remaining === 0 ? 'done' : 'open'">
            {{ r.remaining === 0 ? '마감' : `${r.remaining}자리 남음` }}
          </span>
        </li>
      </ul>
      <p v-else class="empty">지정된 필요 역할이 없습니다.</p>

      <!-- 지원하기 (팀장 아님 · 미참여) -->
      <form v-if="canApply" @submit.prevent="doApply" class="apply">
        <select class="input" v-model="applyRole">
          <option value="" disabled>지원할 역할 선택</option>
          <option v-for="r in openRoles" :key="r.role" :value="r.role">
            {{ r.role }} ({{ r.remaining }}자리)
          </option>
        </select>
        <button class="btn primary" :disabled="applyLoading">
          {{ applyLoading ? '지원 중…' : '이 역할로 지원' }}
        </button>
      </form>
      <p v-else-if="myState === 'APPLIED'" class="my-state pending">
        지원 완료 — 팀장 승인 대기 중 ({{ proj.myMembership?.role }})
      </p>
      <p v-else-if="myState === 'ACCEPTED'" class="my-state ok">
        참여 중 ({{ proj.myMembership?.role }})
      </p>
      <p v-else-if="!isOwner && recruitClosed" class="my-state closed-text">
        팀원 모집이 종료되어 더 이상 지원할 수 없습니다.
      </p>
      <p v-else-if="!isOwner && openRoles.length === 0" class="empty">남은 역할이 없습니다.</p>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>팀원 ({{ members.length }} / {{ proj.capacity }})</h3>
        <ul class="members">
          <li v-for="m in members" :key="m.userId">
            <strong>{{ m.name }}</strong>
            <span class="role">{{ m.role }}</span>
          </li>
          <li v-if="members.length === 0" class="empty">아직 팀원이 없습니다.</li>
        </ul>
        <form v-if="isOwner" @submit.prevent="sendInvite" class="invite">
          <input
            class="input"
            v-model="inviteEmail"
            type="email"
            placeholder="초대할 이메일"
            required
          />
          <button class="btn primary" :disabled="inviteLoading">초대</button>
        </form>
      </div>

      <!-- 지원자 관리 (팀장만) -->
      <div class="card" v-if="isOwner">
        <h3>지원자 ({{ applicants.length }})</h3>
        <ul class="applicants">
          <li v-for="a in applicants" :key="a.userId" class="applicant">
            <div class="arow">
              <div class="ainfo">
                <strong>{{ a.name }}</strong>
                <span class="role">{{ a.role }}</span>
                <span class="arating" v-if="applicantRep[a.userId]">
                  <StarRating :model-value="applicantRep[a.userId].stars" readonly :size="15" />
                  <span class="arating-num">
                    <template v-if="applicantRep[a.userId].count > 0">
                      {{ applicantRep[a.userId].stars.toFixed(1) }} ({{ applicantRep[a.userId].count }})
                    </template>
                    <template v-else>평가 없음</template>
                  </span>
                </span>
              </div>
              <div class="abtns">
                <button
                  v-if="applicantRep[a.userId]?.reviews.length"
                  class="btn small ghost"
                  @click="toggleReviews(a.userId)"
                >
                  {{ expandedApplicant === a.userId ? '후기 닫기' : `후기 ${applicantRep[a.userId].reviews.length}` }}
                </button>
                <button
                  class="btn small primary"
                  :disabled="decideLoading === a.userId + 'ACCEPT'"
                  @click="decide(a.userId, 'ACCEPT')"
                >
                  수락
                </button>
                <button
                  class="btn small"
                  :disabled="decideLoading === a.userId + 'REJECT'"
                  @click="decide(a.userId, 'REJECT')"
                >
                  거절
                </button>
              </div>
            </div>
            <ul v-if="expandedApplicant === a.userId" class="reviews">
              <li v-for="(rv, i) in applicantRep[a.userId].reviews" :key="i" class="review">
                <div class="review-head">
                  <StarRating :model-value="rv.stars" readonly :size="14" />
                  <span class="review-date">{{ rv.ratedAt }}</span>
                </div>
                <p class="review-comment">{{ rv.comment }}</p>
              </li>
            </ul>
          </li>
          <li v-if="applicants.length === 0" class="empty">아직 지원자가 없습니다.</li>
        </ul>
      </div>

      <div class="card">
        <h3>다음 행동</h3>
        <ul class="actions">
          <li>
            <RouterLink :to="`/projects/${id}/recommendations`" class="btn"
              >추천 팀원 보기</RouterLink
            >
          </li>
          <li>
            <RouterLink :to="`/projects/${id}/schedule`" class="btn">일정 조율</RouterLink>
          </li>
          <li>
            <RouterLink :to="`/projects/${id}/tasks`" class="btn">업무 관리</RouterLink>
          </li>
          <li>
            <RouterLink :to="`/projects/${id}/dashboard`" class="btn">팀 대시보드</RouterLink>
          </li>
        </ul>
      </div>
    </div>
    </div>
  </section>
  <div v-else>불러오는 중…</div>
</template>

<style scoped>
.detail {
  max-width: 900px;
  margin: 0 auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-md);
  margin-bottom: var(--s-xs);
}
.head h1 {
  font-size: 34px;
  margin: 0;
}
.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.btn.danger {
  background: #fdecec;
  color: #c0392b;
  border: 1px solid #f5c6c6;
}
.btn.danger:hover {
  background: #fbdcdc;
}
.status {
  flex-shrink: 0;
  background: var(--c-accent-soft);
  color: var(--c-accent);
  padding: 4px 12px;
  border-radius: var(--r-pill);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.status.closed {
  background: var(--c-canvas-parchment);
  color: var(--c-ink-muted-48);
}
.status.running {
  background: var(--c-success-soft, #e3f5e8);
  color: var(--c-success, #2e7d32);
}
.eval-help {
  color: var(--c-fg-muted);
  font-size: 0.92rem;
  margin: 0 0 var(--s-md);
}
.eval-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-md);
}
.eval-row {
  display: grid;
  grid-template-columns: 160px auto 1fr;
  align-items: center;
  gap: var(--s-md);
  padding: 12px 0;
  border-bottom: 1px solid var(--c-border);
}
@media (max-width: 640px) {
  .eval-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
.eval-who {
  display: flex;
  flex-direction: column;
}
.eval-stars {
  display: flex;
  align-items: center;
  gap: 8px;
}
.eval-score {
  font-weight: 700;
  color: #d99100;
  min-width: 2.2em;
}
.eval-comment {
  width: 100%;
}
.eval-actions {
  margin-top: var(--s-md);
  display: flex;
  justify-content: flex-end;
}
textarea.eval-comment {
  resize: vertical;
  font: inherit;
}

/* 지원자 평판 */
.applicants li.applicant {
  display: block;
  align-items: stretch;
}
.applicant .arow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-sm);
}
.arating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.arating-num {
  font-size: 0.8rem;
  color: var(--c-fg-muted);
  font-weight: 600;
}
.btn.ghost {
  background: transparent;
  border: 1px solid var(--c-border);
  color: var(--c-fg-muted);
}
.reviews {
  list-style: none;
  margin: 8px 0 0;
  padding: 10px 12px;
  background: var(--c-canvas-parchment, #faf8f3);
  border-radius: var(--r-md, 8px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.review-date {
  font-size: 0.75rem;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
}
.review-comment {
  margin: 2px 0 0;
  font-size: 0.9rem;
  color: var(--c-ink, var(--c-fg));
  white-space: pre-wrap;
}
.start-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-sm);
  flex-wrap: wrap;
  margin-top: var(--s-md);
  padding: 12px 16px;
  border: 1px solid var(--c-accent-soft, var(--c-border));
  background: var(--c-accent-soft, var(--c-canvas-parchment));
  border-radius: var(--r-md, 10px);
  font-size: 0.92rem;
}
.roles-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.closed-badge {
  background: var(--c-border);
  color: var(--c-fg-muted);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}
.my-state.closed-text {
  color: var(--c-fg-muted);
  font-weight: 600;
}
.desc {
  color: var(--c-ink-muted-80);
  font-size: 17px;
  margin-bottom: var(--s-md);
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--c-border);
  margin-bottom: var(--s-md);
}
.tabs button {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 10px 14px;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  cursor: pointer;
  margin-bottom: -1px;
}
.tabs button.active {
  color: var(--c-primary, #0066cc);
  border-bottom-color: var(--c-primary, #0066cc);
}
.tab-badge {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  margin-left: 6px;
  border-radius: 999px;
  background: var(--c-danger, #b00020);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  vertical-align: middle;
}
.tabs button:hover {
  color: var(--c-ink, var(--c-fg));
}
.card {
  margin-top: var(--s-md);
}
.card h3 {
  font-size: 19px;
  margin: 0 0 var(--s-sm);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-md);
  margin-top: var(--s-md);
}
@media (max-width: 720px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}

/* 역할 현황 */
.roles-status {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.roles-status li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--c-border);
}
.roles-status .rname {
  font-weight: 600;
}
.roles-status .rcount {
  color: var(--c-fg-muted);
  font-size: 0.85rem;
  margin-left: auto;
}
.rtag {
  font-size: 0.78rem;
  padding: 2px 8px;
  border-radius: 999px;
}
.rtag.open {
  background: var(--c-accent-soft);
  color: var(--c-accent);
}
.rtag.done {
  background: var(--c-border);
  color: var(--c-fg-muted);
}
.apply {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.apply .input {
  flex: 1;
}
.my-state {
  margin-top: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}
.my-state.pending {
  color: var(--c-accent);
}
.my-state.ok {
  color: var(--c-success, #2e7d32);
}

.members,
.applicants {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.members li {
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid var(--c-border);
  padding: 6px 0;
}
.applicants li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--c-border);
  padding: 6px 0;
}
.applicants .ainfo {
  display: flex;
  flex-direction: column;
}
.abtns {
  display: flex;
  gap: 6px;
}
.btn.small {
  padding: 4px 10px;
  font-size: 0.82rem;
}
.role {
  color: var(--c-fg-muted);
  font-size: 0.85rem;
}
.invite {
  display: flex;
  gap: 6px;
}
.actions {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.empty {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
</style>

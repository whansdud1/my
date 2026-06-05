<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useProjectStore, type Applicant } from '../../stores/projects';
import { useNotificationsStore } from '../../stores/notifications';

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
// 삭제 가능: 팀장이며 아직 모집 중(RECRUIT)일 때만
const canDelete = computed(() => isOwner.value && proj.value?.status === 'RECRUIT');

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

async function loadApplicants() {
  if (!isOwner.value) return;
  try {
    applicants.value = await store.fetchApplicants(id);
  } catch {
    applicants.value = [];
  }
}

async function reload() {
  await store.fetchOne(id);
  await Promise.all([loadMembers(), loadApplicants()]);
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
        <span class="status" :class="{ closed: recruitClosed }">
          {{ recruitClosed ? '팀원 모집 종료' : '팀원 모집 중' }}
        </span>
        <button v-if="canDelete" class="btn danger small" :disabled="deleting" @click="deleteProject">
          {{ deleting ? '삭제 중…' : '프로젝트 삭제' }}
        </button>
      </div>
    </header>
    <p class="desc">{{ proj.description }}</p>

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
          <li v-for="a in applicants" :key="a.userId">
            <div class="ainfo">
              <strong>{{ a.name }}</strong>
              <span class="role">{{ a.role }}</span>
            </div>
            <div class="abtns">
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
          </li>
          <li v-if="applicants.length === 0" class="empty">아직 지원자가 없습니다.</li>
        </ul>
      </div>

      <div class="card">
        <h3>다음 행동</h3>
        <ul class="actions">
          <li>
            <RouterLink :to="`/projects/${id}/recommendations`" class="btn"
              >매칭 후보 보기</RouterLink
            >
          </li>
          <li>
            <RouterLink :to="`/projects/${id}/schedule`" class="btn">일정 조율</RouterLink>
          </li>
        </ul>
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

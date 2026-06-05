<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';
import { useProjectStore, type MyProject } from '../../stores/projects';
import { PROJECT_ROLES } from '../../constants/roles';

interface Profile {
  name: string;
  gender?: 'M' | 'F' | 'X';
  grade?: number;
  major?: string;
  preferredRoles: string[];
  bio?: string;
}

const profile = ref<Profile>({ name: '', preferredRoles: [] });
const ALL_ROLES = PROJECT_ROLES;
const loading = ref(false);
const notify = useNotificationsStore();
const projects = useProjectStore();

const myProjects = ref<MyProject[]>([]);
// 진행 중(지원 대기 + 참여 중)인 것 — 본인이 만든 OWNER도 참여로 함께 표시
const activeProjects = computed(() =>
  myProjects.value.filter((p) => p.myState === 'APPLIED' || p.myState === 'ACCEPTED'),
);

function stateLabel(s: MyProject['myState']) {
  return s === 'APPLIED' ? '지원 대기중' : s === 'ACCEPTED' ? '참여중' : '초대됨';
}

onMounted(async () => {
  try {
    const { data } = await api.get<Profile>('/users/me');
    profile.value = { ...profile.value, ...data };
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '프로필을 불러올 수 없습니다.');
  }
  try {
    myProjects.value = await projects.fetchMine();
  } catch {
    myProjects.value = [];
  }
});

async function save() {
  loading.value = true;
  try {
    await api.patch('/users/me', profile.value);
    notify.success('프로필이 저장되었습니다.');
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '저장에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}

function toggleRole(r: string) {
  const i = profile.value.preferredRoles.indexOf(r);
  if (i >= 0) profile.value.preferredRoles.splice(i, 1);
  else profile.value.preferredRoles.push(r);
}
</script>

<template>
  <section class="page profile">
    <h1>프로필 편집</h1>
    <form @submit.prevent="save" class="card">
      <label>
        <span>이름</span>
        <input class="input" v-model="profile.name" required />
      </label>
      <label>
        <span>학년</span>
        <select class="select" v-model="profile.grade">
          <option :value="undefined">선택</option>
          <option v-for="g in [1, 2, 3, 4]" :key="g" :value="g">{{ g }}학년</option>
        </select>
      </label>
      <label>
        <span>전공</span>
        <input class="input" v-model="profile.major" placeholder="예: 경영학과" />
      </label>
      <label>
        <span>성별</span>
        <select class="select" v-model="profile.gender">
          <option :value="undefined">선택</option>
          <option value="M">남</option>
          <option value="F">여</option>
          <option value="X">표시 안 함</option>
        </select>
      </label>

      <div>
        <span class="lbl">선호 역할</span>
        <div class="roles">
          <button
            type="button"
            v-for="r in ALL_ROLES"
            :key="r"
            class="chip"
            :class="{ active: profile.preferredRoles.includes(r) }"
            @click="toggleRole(r)"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <label>
        <span>자기소개</span>
        <textarea class="textarea" v-model="profile.bio" rows="4" maxlength="500"></textarea>
      </label>

      <div class="row">
        <button class="btn primary" :disabled="loading">{{ loading ? '저장 중…' : '저장' }}</button>
        <RouterLink to="/profile/availability" class="btn">가용 시간 편집 →</RouterLink>
      </div>
    </form>

    <!-- 내 프로젝트: 지원/참여 중인 프로젝트 -->
    <div class="card my-projects">
      <h2>내 프로젝트</h2>
      <ul v-if="activeProjects.length" class="mp-list">
        <li v-for="p in activeProjects" :key="p.id">
          <RouterLink :to="`/projects/${p.id}`" class="mp-title">{{ p.title }}</RouterLink>
          <div class="mp-meta">
            <span class="mp-role">{{ p.myRole }}</span>
            <span class="mp-state" :class="p.myState.toLowerCase()">{{ stateLabel(p.myState) }}</span>
            <span class="mp-recruit" :class="{ closed: p.recruitClosed }">
              {{ p.recruitClosed ? '모집 종료' : '모집 중' }}
            </span>
          </div>
        </li>
      </ul>
      <p v-else class="empty">아직 지원하거나 참여 중인 프로젝트가 없습니다.</p>
    </div>
  </section>
</template>

<style scoped>
.profile {
  max-width: 640px;
  margin: 24px auto;
}
.profile .card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.profile label,
.lbl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  background: var(--c-bg);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--c-fg);
}
.chip.active {
  background: var(--c-accent-soft);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

/* 내 프로젝트 */
.my-projects {
  margin-top: 20px;
}
.my-projects h2 {
  margin: 0 0 12px 0;
  font-size: 1.2rem;
}
.mp-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mp-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--c-border);
}
.mp-title {
  font-weight: 600;
  color: var(--c-fg);
  text-decoration: none;
}
.mp-title:hover {
  color: var(--c-accent);
}
.mp-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.mp-role {
  font-size: 0.8rem;
  color: var(--c-fg-muted);
}
.mp-state,
.mp-recruit {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.mp-state.applied {
  background: var(--c-accent-soft);
  color: var(--c-accent);
}
.mp-state.accepted {
  background: #e7f5ec;
  color: #047857;
}
.mp-state.invited {
  background: var(--c-border);
  color: var(--c-fg-muted);
}
.mp-recruit {
  background: #e7f5ec;
  color: #047857;
}
.mp-recruit.closed {
  background: var(--c-border);
  color: var(--c-fg-muted);
}
.my-projects .empty {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
</style>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';
import { useProjectStore, type MyProject } from '../../stores/projects';
import { PROJECT_ROLES } from '../../constants/roles';

// 백엔드(/users/me)와 동일한 필드명 사용 — department/selfIntro (이전의 major/bio 는 저장이 안 됐음)
interface Profile {
  name: string;
  gender?: 'M' | 'F' | 'OTHER' | 'UNSPEC';
  grade?: number | null;
  department?: string | null;
  university?: string | null;
  preferredRoles: string[];
  selfIntro?: string | null;
}

const profile = ref<Profile>({ name: '', preferredRoles: [] });
const ALL_ROLES = PROJECT_ROLES;
const loading = ref(false);
const notify = useNotificationsStore();
const projects = useProjectStore();

const myProjects = ref<MyProject[]>([]);
// 진행 중(지원 대기 + 참여 중, 아직 안 끝난 것)
const activeProjects = computed(() =>
  myProjects.value.filter((p) => !p.finished && (p.myState === 'APPLIED' || p.myState === 'ACCEPTED')),
);
// 지난 프로젝트: 참여(ACCEPTED, 팀장 포함)했고 끝난 것
const pastProjects = computed(() =>
  myProjects.value.filter((p) => p.finished && p.myState === 'ACCEPTED'),
);

function stateLabel(s: MyProject['myState']) {
  return s === 'APPLIED' ? '지원 대기중' : s === 'ACCEPTED' ? '참여중' : '초대됨';
}

// 프로젝트별 안읽은 채팅 수
const chatUnread = ref<Record<string, number>>({});

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
  try {
    const { data } = await api.get<{ total: number; byProject: Record<string, number> }>(
      '/projects/chat-unread',
    );
    chatUnread.value = data.byProject ?? {};
  } catch {
    chatUnread.value = {};
  }
});

async function save() {
  loading.value = true;
  try {
    // 편집 가능한 필드만 명시적으로 전송 (백엔드 PATCH /users/me 스키마와 일치)
    await api.patch('/users/me', {
      name: profile.value.name,
      gender: profile.value.gender,
      grade: profile.value.grade ?? null,
      department: profile.value.department ?? null,
      university: profile.value.university ?? null,
      selfIntro: profile.value.selfIntro ?? null,
      preferredRoles: profile.value.preferredRoles,
    });
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
        <input class="input" v-model="profile.department" placeholder="예: 경영학과" />
      </label>
      <label>
        <span>성별</span>
        <select class="select" v-model="profile.gender">
          <option :value="undefined">선택</option>
          <option value="M">남</option>
          <option value="F">여</option>
          <option value="UNSPEC">표시 안 함</option>
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
        <textarea class="textarea" v-model="profile.selfIntro" rows="4" maxlength="500"></textarea>
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
          <RouterLink :to="`/projects/${p.id}`" class="mp-title">
            {{ p.title }}
            <span v-if="chatUnread[p.id]" class="mp-unread" title="안 읽은 메시지">
              💬 {{ chatUnread[p.id] > 99 ? '99+' : chatUnread[p.id] }}
            </span>
          </RouterLink>
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

    <!-- 지난 프로젝트: 참여했고 끝난 프로젝트 모음 -->
    <div class="card my-projects">
      <h2>지난 프로젝트</h2>
      <ul v-if="pastProjects.length" class="mp-list">
        <li v-for="p in pastProjects" :key="p.id">
          <RouterLink :to="`/projects/${p.id}`" class="mp-title">{{ p.title }}</RouterLink>
          <div class="mp-meta">
            <span class="mp-role">{{ p.myRole }}</span>
            <span class="mp-state past">완료</span>
            <span v-if="p.endDate" class="mp-role">~ {{ p.endDate }}</span>
          </div>
        </li>
      </ul>
      <p v-else class="empty">완료된 프로젝트가 없습니다.</p>
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
.mp-unread {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--c-danger, #b00020);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  vertical-align: middle;
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
.mp-state.past {
  background: var(--c-canvas-parchment, #f0ece4);
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

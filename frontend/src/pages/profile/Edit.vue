<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

interface Profile {
  name: string;
  gender?: 'M' | 'F' | 'X';
  grade?: number;
  major?: string;
  preferredRoles: string[];
  bio?: string;
}

const profile = ref<Profile>({ name: '', preferredRoles: [] });
const ALL_ROLES = ['기획', '발표', '디자인', '자료조사', '문서작성', '일정관리', '개발', '데이터'];
const loading = ref(false);
const notify = useNotificationsStore();

onMounted(async () => {
  try {
    const { data } = await api.get<Profile>('/users/me');
    profile.value = { ...profile.value, ...data };
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '프로필을 불러올 수 없습니다.');
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
  <section class="profile">
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
</style>

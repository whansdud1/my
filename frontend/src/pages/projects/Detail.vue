<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { api } from '../../services/api';
import { useProjectStore } from '../../stores/projects';
import { useNotificationsStore } from '../../stores/notifications';

const route = useRoute();
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
const inviteEmail = ref('');
const inviteLoading = ref(false);

onMounted(async () => {
  await store.fetchOne(id);
  try {
    const { data } = await api.get<Member[]>(`/projects/${id}/members`);
    members.value = data;
  } catch {
    /* empty members */
  }
});

async function sendInvite() {
  inviteLoading.value = true;
  try {
    await api.post(`/projects/${id}/invites`, { email: inviteEmail.value });
    notify.success(`${inviteEmail.value} 에게 초대를 보냈습니다.`);
    inviteEmail.value = '';
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '초대 발송에 실패했습니다.');
  } finally {
    inviteLoading.value = false;
  }
}
</script>

<template>
  <section class="detail" v-if="store.current">
    <header class="head">
      <h1>{{ store.current.title }}</h1>
      <span class="status">{{ store.current.status }}</span>
    </header>
    <p class="desc">{{ store.current.description }}</p>

    <div class="grid-2">
      <div class="card">
        <h3>팀원 ({{ members.length }} / {{ store.current.capacity }})</h3>
        <ul class="members">
          <li v-for="m in members" :key="m.userId">
            <strong>{{ m.name }}</strong>
            <span class="role">{{ m.role }}</span>
          </li>
          <li v-if="members.length === 0" class="empty">아직 팀원이 없습니다.</li>
        </ul>
        <form @submit.prevent="sendInvite" class="invite">
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
          <li><span class="muted">대시보드 · 활동 — 곧 제공</span></li>
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
}
.status {
  background: var(--c-accent-soft);
  color: var(--c-accent);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
}
.desc {
  color: var(--c-fg-muted);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.members {
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
.members .role {
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
.muted {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.empty {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
</style>

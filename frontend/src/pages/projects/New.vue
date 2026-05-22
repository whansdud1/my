<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore } from '../../stores/projects';
import { useNotificationsStore } from '../../stores/notifications';

const form = reactive({
  title: '',
  description: '',
  capacity: 4,
  startDate: '',
  endDate: '',
  requiredRoles: [] as string[],
  preferredTimeNote: '',
});

const ALL_ROLES = ['기획', '발표', '디자인', '자료조사', '문서작성', '일정관리', '개발', '데이터'];
const loading = ref(false);
const router = useRouter();
const projects = useProjectStore();
const notify = useNotificationsStore();

function toggleRole(r: string) {
  const i = form.requiredRoles.indexOf(r);
  if (i >= 0) form.requiredRoles.splice(i, 1);
  else form.requiredRoles.push(r);
}

async function submit() {
  loading.value = true;
  try {
    const p = await projects.create(form);
    notify.success('프로젝트가 생성되었습니다.');
    router.push(`/projects/${p.id}`);
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '생성에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="new-project">
    <h1>새 프로젝트</h1>
    <form @submit.prevent="submit" class="card">
      <label>
        <span>제목</span>
        <input class="input" v-model="form.title" required maxlength="100" />
      </label>
      <label>
        <span>설명</span>
        <textarea class="textarea" v-model="form.description" rows="4" maxlength="1000"></textarea>
      </label>
      <div class="grid-2">
        <label>
          <span>모집 인원 (본인 포함)</span>
          <input
            class="input"
            type="number"
            v-model.number="form.capacity"
            min="2"
            max="10"
            required
          />
        </label>
        <label>
          <span>선호 작업 시간대</span>
          <input class="input" v-model="form.preferredTimeNote" placeholder="예: 평일 야간" />
        </label>
        <label>
          <span>시작일</span>
          <input class="input" type="date" v-model="form.startDate" required />
        </label>
        <label>
          <span>종료일</span>
          <input class="input" type="date" v-model="form.endDate" required />
        </label>
      </div>
      <div>
        <span class="lbl">필요 역할</span>
        <div class="roles">
          <button
            type="button"
            v-for="r in ALL_ROLES"
            :key="r"
            class="chip"
            :class="{ active: form.requiredRoles.includes(r) }"
            @click="toggleRole(r)"
          >
            {{ r }}
          </button>
        </div>
      </div>
      <button class="btn primary" :disabled="loading">
        {{ loading ? '생성 중…' : '프로젝트 생성' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.new-project {
  max-width: 720px;
  margin: 24px auto;
}
.new-project .card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lbl {
  display: block;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
  margin-bottom: 6px;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
</style>

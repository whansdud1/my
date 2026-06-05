<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

interface Teammate {
  userId: string;
  name: string;
  role: string;
}

interface Scores {
  contribution: number;
  communication: number;
  responsibility: number;
  satisfaction: number;
  comment: string;
}

const route = useRoute();
const router = useRouter();
const projectId = route.params.projectId as string;
const teammates = ref<Teammate[]>([]);
const scores = ref<Record<string, Scores>>({});
const loading = ref(false);
const notify = useNotificationsStore();

onMounted(async () => {
  const { data } = await api.get<Teammate[]>(`/projects/${projectId}/teammates`);
  teammates.value = data;
  for (const t of data) {
    scores.value[t.userId] = {
      contribution: 3,
      communication: 3,
      responsibility: 3,
      satisfaction: 3,
      comment: '',
    };
  }
});

async function submit() {
  loading.value = true;
  try {
    const items = Object.entries(scores.value).map(([atId, s]) => ({ ateeId: atId, ...s }));
    await api.post(`/projects/${projectId}/evaluations`, { items });
    notify.success('평가가 제출되었습니다. (익명 처리)');
    router.push({ name: 'evaluations' });
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '제출에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page eval-submit">
    <h1>동료 평가</h1>
    <p class="hint">
      평가는 익명 처리되며, 본인 평가는 불가합니다. 4개 항목(1~5점) + 자유 코멘트로 구성됩니다.
    </p>

    <form @submit.prevent="submit">
      <article v-for="t in teammates" :key="t.userId" class="card peer">
        <header>
          <h3>{{ t.name }}</h3>
          <span class="role">{{ t.role }}</span>
        </header>

        <div v-for="key in ['contribution', 'communication', 'responsibility', 'satisfaction'] as const" :key="key" class="row">
          <span class="lbl">{{
            { contribution: '기여도', communication: '소통', responsibility: '책임감', satisfaction: '만족도' }[key]
          }}</span>
          <div class="scale">
            <label v-for="n in 5" :key="n">
              <input type="radio" :name="`${t.userId}-${key}`" :value="n" v-model.number="scores[t.userId][key]" />
              <span>{{ n }}</span>
            </label>
          </div>
        </div>

        <label class="comment">
          <span>자유 코멘트 (선택)</span>
          <textarea
            class="textarea"
            v-model="scores[t.userId].comment"
            rows="3"
            maxlength="500"
          ></textarea>
        </label>
      </article>

      <button class="btn primary" :disabled="loading || teammates.length === 0">
        {{ loading ? '제출 중…' : '제출' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.eval-submit {
  max-width: 720px;
  margin: 24px auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.peer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.peer header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.role {
  color: var(--c-fg-muted);
  font-size: 0.85rem;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.scale {
  display: flex;
  gap: 12px;
}
.scale label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
.comment {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
</style>

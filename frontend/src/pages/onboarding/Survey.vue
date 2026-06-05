<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

// FR-A2: 협업 성향 12문항 (5점 리커트). 실제 문항은 운영자 콘솔에서 갱신.
const QUESTIONS: string[] = [
  '나는 마감 며칠 전 미리 작업을 끝내는 편이다',
  '나는 회의에서 의견을 적극적으로 제시한다',
  '나는 갈등 상황에서 조정자 역할을 선호한다',
  '나는 세부 사항 검토에 시간을 많이 들인다',
  '나는 변경 사항을 빠르게 수용하는 편이다',
  '나는 정해진 절차를 따르는 것을 선호한다',
  '나는 새로운 아이디어를 자주 제안한다',
  '나는 발표·전달에 자신이 있다',
  '나는 동료의 진척을 자주 확인한다',
  '나는 위험·문제를 사전에 공유한다',
  '나는 결정이 늦어지면 답답함을 느낀다',
  '나는 협업 도구·문서화를 적극 활용한다',
];
const answers = ref<number[]>(QUESTIONS.map(() => 3));
const loading = ref(false);
const router = useRouter();
const notify = useNotificationsStore();

async function submit() {
  loading.value = true;
  try {
    await api.post('/users/me/survey', { answers: answers.value });
    notify.success('성향 설문이 저장되었습니다.');
    router.push({ name: 'profile' });
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '저장에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page survey">
    <h1>협업 성향 설문</h1>
    <p class="hint">5점 척도: 1 (매우 아니다) – 3 (보통) – 5 (매우 그렇다)</p>
    <form @submit.prevent="submit" class="card">
      <div v-for="(q, i) in QUESTIONS" :key="i" class="q">
        <span class="qtext">{{ i + 1 }}. {{ q }}</span>
        <div class="scale">
          <label v-for="n in 5" :key="n">
            <input type="radio" :name="`q${i}`" :value="n" v-model.number="answers[i]" />
            <span>{{ n }}</span>
          </label>
        </div>
      </div>
      <button class="btn primary" :disabled="loading">{{ loading ? '저장 중…' : '제출' }}</button>
    </form>
  </section>
</template>

<style scoped>
.survey {
  max-width: 720px;
  margin: 24px auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.q {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--c-border);
}
.q:last-of-type {
  border-bottom: none;
}
.scale {
  display: flex;
  gap: 14px;
}
.scale label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
</style>

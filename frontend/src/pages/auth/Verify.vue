<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

const route = useRoute();
const router = useRouter();
const notify = useNotificationsStore();

const token = computed(() => (route.query.token as string) || '');
const email = computed(() => (route.query.email as string) || '');
const status = ref<'pending' | 'verifying' | 'ok' | 'fail'>('pending');
const message = ref<string>('');

async function verify(t: string) {
  status.value = 'verifying';
  try {
    await api.post('/auth/verify-email', { token: t });
    status.value = 'ok';
    message.value = '이메일 인증이 완료되었습니다.';
    notify.success(message.value);
    setTimeout(() => router.push({ name: 'login' }), 1500);
  } catch (e) {
    status.value = 'fail';
    message.value = (e as { detail?: string }).detail ?? '인증에 실패했습니다.';
  }
}

onMounted(() => {
  if (token.value) verify(token.value);
});
</script>

<template>
  <section class="verify">
    <h1>이메일 인증</h1>
    <div class="card">
      <template v-if="status === 'pending'">
        <p><strong>{{ email }}</strong> 로 인증 메일을 발송했습니다.</p>
        <p class="hint">메일에 포함된 링크를 클릭하면 자동으로 인증됩니다.</p>
      </template>
      <template v-else-if="status === 'verifying'">
        <p>인증 처리 중…</p>
      </template>
      <template v-else-if="status === 'ok'">
        <p class="ok">✓ {{ message }}</p>
      </template>
      <template v-else>
        <p class="err">✗ {{ message }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.verify {
  max-width: 480px;
  margin: 48px auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.ok {
  color: var(--c-success);
}
.err {
  color: var(--c-danger);
}
</style>

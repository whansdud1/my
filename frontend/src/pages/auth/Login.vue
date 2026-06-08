<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useNotificationsStore } from '../../stores/notifications';

const email = ref('');
const password = ref('');
const loading = ref(false);

const auth = useAuthStore();
const notify = useNotificationsStore();
const route = useRoute();
const router = useRouter();

async function onSubmit() {
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    notify.success('로그인되었습니다.');
    const redirect = (route.query.redirect as string) || '/projects';
    router.push(redirect);
  } catch (e) {
    notify.error((e as { detail?: string; title?: string }).detail ?? '로그인에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="auth-tile">
    <div class="auth-card">
      <h2>로그인</h2>
      <p class="lead-sm muted">계속하려면 계정에 로그인하세요.</p>
      <form @submit.prevent="onSubmit" class="form">
        <label class="field">
          <span>이메일</span>
          <input class="input" type="email" v-model="email" required autocomplete="email" />
        </label>
        <label class="field">
          <span>비밀번호</span>
          <input
            class="input"
            type="password"
            v-model="password"
            required
            autocomplete="current-password"
          />
        </label>
        <button class="btn primary" :disabled="loading">
          {{ loading ? '확인 중…' : '로그인' }}
        </button>
        <div class="foot">
          <RouterLink to="/signup">처음이신가요? 회원가입 &rsaquo;</RouterLink>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.auth-tile {
  background: var(--c-canvas-parchment);
  min-height: calc(100vh - 44px - 200px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 96px var(--s-lg);
}
.auth-card {
  background: var(--c-canvas);
  border-radius: var(--r-lg);
  padding: var(--s-xxl);
  width: 100%;
  max-width: 420px;
  border: 1px solid var(--c-hairline);
  text-align: center;
}
.auth-card h2 {
  font-size: 34px;
  margin-bottom: var(--s-xs);
}
.lead-sm {
  font-size: 17px;
  margin-bottom: var(--s-xl);
  color: var(--c-ink-muted-48);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--s-md);
  text-align: left;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > span {
  font-size: 14px;
  letter-spacing: -0.224px;
  color: var(--c-ink-muted-80);
}
.form .btn.primary {
  margin-top: var(--s-xs);
  width: 100%;
}
.foot {
  text-align: center;
  margin-top: var(--s-xs);
  font-size: 14px;
}
</style>

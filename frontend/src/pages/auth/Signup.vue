<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useNotificationsStore } from '../../stores/notifications';

const email = ref('');
const password = ref('');
const name = ref('');
const consentTos = ref(false);
const consentPrivacy = ref(false);
const consentEval = ref(false);
const loading = ref(false);

const auth = useAuthStore();
const notify = useNotificationsStore();
const router = useRouter();

async function onSubmit() {
  if (!consentTos.value || !consentPrivacy.value || !consentEval.value) {
    notify.warn('필수 동의 항목에 체크해주세요.');
    return;
  }
  loading.value = true;
  try {
    await auth.signup({
      email: email.value,
      password: password.value,
      name: name.value,
      consents: ['TOS', 'PRIVACY', 'EVALUATION_DATA'],
    });
    notify.success('가입 메일을 발송했습니다. 인증을 완료해주세요.');
    router.push({ name: 'verify', query: { email: email.value } });
  } catch (e) {
    notify.error((e as { detail?: string; title?: string }).detail ?? '가입에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="auth-form">
    <h1>회원가입</h1>
    <p class="hint">대학 이메일(.ac.kr) 사용을 권장합니다.</p>
    <form @submit.prevent="onSubmit" class="card">
      <label>
        <span>이름</span>
        <input class="input" v-model="name" required minlength="2" />
      </label>
      <label>
        <span>이메일</span>
        <input class="input" type="email" v-model="email" required />
      </label>
      <label>
        <span>비밀번호 (8자 이상)</span>
        <input class="input" type="password" v-model="password" required minlength="8" />
      </label>
      <fieldset class="consents">
        <legend>약관 동의 (필수)</legend>
        <label><input type="checkbox" v-model="consentTos" /> 서비스 이용약관</label>
        <label><input type="checkbox" v-model="consentPrivacy" /> 개인정보 처리방침</label>
        <label><input type="checkbox" v-model="consentEval" /> 협업 데이터 수집 및 평가 활용</label>
      </fieldset>
      <button class="btn primary" :disabled="loading">{{ loading ? '처리 중…' : '가입' }}</button>
    </form>
  </section>
</template>

<style scoped>
.auth-form {
  max-width: 440px;
  margin: 32px auto;
}
.auth-form .card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
.consents {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.consents legend {
  padding: 0 6px;
  font-size: 0.85rem;
  color: var(--c-fg-muted);
}
.consents label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--c-fg);
}
.hint {
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
</style>

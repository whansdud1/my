<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { notificationApi, type PreferenceBundle } from '../../services/notificationApi';
import { useNotificationsStore } from '../../stores/notifications';

// 002-notification-system — T027 알림 설정
// 종류×채널 토글 + 방해 금지/야간 시간대. 필수 종류(mandatory)는 비활성 불가.

const toast = useNotificationsStore();
const bundle = ref<PreferenceBundle | null>(null);
const loading = ref(true);
const saving = ref(false);

// 종류 코드 → 한국어 라벨
const LABELS: Record<string, string> = {
  MATCH_READY: '매칭 완료',
  TEAM_JOIN_REQUEST: '팀 합류 요청',
  TEAM_JOIN_RESULT: '합류 요청 결과',
  COLLAB_RISK: '협업 위험 신호',
  EVAL_REQUEST: '평가 요청',
  EVAL_REMINDER: '평가 리마인더',
  SCHEDULE_CHANGE: '일정 변경',
  ADMIN_REVIEW: '관리자 검토',
  SECURITY_ALERT: '보안 알림',
  SYSTEM_NOTICE: '시스템 공지',
};

function label(code: string): string {
  return LABELS[code] ?? code;
}

onMounted(async () => {
  try {
    bundle.value = await notificationApi.getPreferences();
  } finally {
    loading.value = false;
  }
});

async function save() {
  if (!bundle.value) return;
  saving.value = true;
  try {
    bundle.value = await notificationApi.updatePreferences(bundle.value);
    toast.success('알림 설정이 저장되었습니다');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '저장에 실패했습니다');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="page">
    <h1>알림 설정</h1>
    <p class="hint">알림 종류별로 받을 채널을 선택하세요. 보안 알림은 항상 수신됩니다.</p>

    <div v-if="loading">불러오는 중…</div>
    <template v-else-if="bundle">
      <table class="prefs">
        <thead>
          <tr>
            <th>알림 종류</th>
            <th>인앱</th>
            <th>이메일</th>
            <th>푸시</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in bundle.preferences" :key="p.type">
            <td>
              {{ label(p.type) }}
              <span v-if="p.mandatory" class="req">필수</span>
            </td>
            <td><input type="checkbox" v-model="p.inApp" :disabled="p.mandatory" /></td>
            <td><input type="checkbox" v-model="p.email" :disabled="p.mandatory" /></td>
            <td><input type="checkbox" v-model="p.push" disabled title="푸시는 추후 제공" /></td>
          </tr>
        </tbody>
      </table>

      <h2>방해 금지</h2>
      <div class="quiet">
        <label class="dnd">
          <input type="checkbox" v-model="bundle.global.dndEnabled" /> 방해 금지 모드
        </label>
        <label>야간 시작 <input type="time" v-model="bundle.global.quietStart" /></label>
        <label>야간 종료 <input type="time" v-model="bundle.global.quietEnd" /></label>
      </div>
      <p class="hint">야간 시간대에는 긴급 알림을 제외한 이메일이 다음 날 아침으로 묶여 발송됩니다.</p>

      <button class="btn primary" :disabled="saving" @click="save()">
        {{ saving ? '저장 중…' : '저장' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.hint {
  color: var(--c-fg-muted, #6b7280);
  font-size: 0.9rem;
}
.prefs {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}
.prefs th,
.prefs td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--c-border, #e5e7eb);
  text-align: center;
}
.prefs th:first-child,
.prefs td:first-child {
  text-align: left;
}
.req {
  font-size: 0.68rem;
  color: var(--c-danger, #ef4444);
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 1px 5px;
  margin-left: 6px;
}
.quiet {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
  margin: 10px 0;
}
.dnd {
  font-weight: 600;
}
.btn.primary {
  margin-top: 16px;
}
</style>

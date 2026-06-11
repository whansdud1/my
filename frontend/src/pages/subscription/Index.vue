<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { subscriptionApi, type SubscriptionStatus } from '../../services/subscriptionApi';
import { useNotificationsStore } from '../../stores/notifications';
import { useAuthStore } from '../../stores/auth';

// 프리미엄 구독 — 모의 결제(월 4,900원, 30일 자동 갱신).
const toast = useNotificationsStore();
const auth = useAuthStore();

const status = ref<SubscriptionStatus | null>(null);
const loading = ref(true);
const busy = ref(false);

const premium = computed(() => status.value?.premium ?? false);
const canceled = computed(() => status.value?.billingState === 'CANCELED');

async function load() {
  loading.value = true;
  try {
    status.value = await subscriptionApi.get();
    auth.setPremium(status.value.premium);
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '구독 정보를 불러오지 못했습니다');
  } finally {
    loading.value = false;
  }
}

async function subscribe() {
  busy.value = true;
  try {
    status.value = await subscriptionApi.subscribe();
    auth.setPremium(status.value.premium);
    toast.success('프리미엄 구독이 시작되었습니다 🎉');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '구독에 실패했습니다');
  } finally {
    busy.value = false;
  }
}

async function cancel() {
  if (!confirm('정말 해지하시겠어요? 남은 기간까지는 계속 이용할 수 있어요.')) return;
  busy.value = true;
  try {
    status.value = await subscriptionApi.cancel();
    auth.setPremium(status.value.premium);
    toast.info('해지가 예약되었습니다. 남은 기간까지 이용 가능합니다.');
  } catch (e) {
    const err = e as { detail?: string; title?: string };
    toast.error(err.detail ?? err.title ?? '해지에 실패했습니다');
  } finally {
    busy.value = false;
  }
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-';
}
function won(n: number): string {
  return n.toLocaleString('ko-KR');
}

onMounted(load);
</script>

<template>
  <section class="page">
    <header class="head">
      <h1>프리미엄 구독</h1>
      <p class="sub">더 똑똑한 팀플을 위한 프리미엄 기능</p>
    </header>

    <div v-if="loading" class="empty">불러오는 중…</div>

    <div v-else class="plan-card" :class="{ active: premium }">
      <div class="plan-top">
        <div>
          <span class="badge" :class="{ on: premium }">{{ premium ? 'PREMIUM' : 'FREE' }}</span>
          <h2 class="price"><b>{{ won(status?.priceKrw ?? 4900) }}</b>원<span class="per">/월</span></h2>
          <p class="cycle">{{ status?.periodDays ?? 30 }}일마다 자동 갱신</p>
        </div>
        <div class="state" v-if="premium">
          <p v-if="canceled" class="warn">해지 예약됨 · {{ fmtDate(status?.endsAt ?? null) }} 까지 이용</p>
          <p v-else class="ok">이용 중 · {{ fmtDate(status?.endsAt ?? null) }} 갱신 예정</p>
        </div>
      </div>

      <ul class="features">
        <li v-for="(f, i) in status?.features ?? []" :key="i">
          <span class="check">✓</span> {{ f }}
        </li>
      </ul>

      <div class="actions">
        <template v-if="!premium">
          <button class="btn primary big" :disabled="busy" @click="subscribe">
            {{ busy ? '처리 중…' : `월 ${won(status?.priceKrw ?? 4900)}원 구독하기` }}
          </button>
          <p class="mock-note">* 모의 결제입니다. 실제 금액이 청구되지 않습니다.</p>
        </template>
        <template v-else-if="canceled">
          <button class="btn primary big" :disabled="busy" @click="subscribe">
            {{ busy ? '처리 중…' : '자동 갱신 다시 켜기' }}
          </button>
        </template>
        <template v-else>
          <button class="btn ghost" :disabled="busy" @click="cancel">구독 해지</button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page { max-width: 560px; margin: 0 auto; padding: 32px var(--s-lg, 16px); }
.head { text-align: center; margin-bottom: 24px; }
.head h1 { margin: 0; }
.sub { color: var(--c-fg-muted, #6b7280); margin: 6px 0 0; }
.empty { text-align: center; color: var(--c-fg-muted, #6b7280); padding: 40px 0; }
.plan-card {
  border: 1px solid var(--c-border, #e5e7eb);
  border-radius: 18px;
  padding: 24px;
  background: var(--c-surface, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.05);
}
.plan-card.active { border-color: #f59e0b; box-shadow: 0 8px 28px rgba(245, 158, 11, 0.15); }
.plan-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.badge { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px; background: var(--c-bg-subtle, #f3f4f6); color: var(--c-fg-muted, #6b7280); }
.badge.on { background: #fef3c7; color: #b45309; }
.price { margin: 10px 0 2px; font-size: 1.4rem; font-weight: 500; }
.price b { font-size: 2.2rem; font-weight: 800; }
.per { color: var(--c-fg-muted, #6b7280); font-size: 1rem; margin-left: 2px; }
.cycle { margin: 0; color: var(--c-fg-muted, #9ca3af); font-size: 0.84rem; }
.state { text-align: right; font-size: 0.84rem; }
.state .ok { color: #047857; margin: 0; }
.state .warn { color: #b45309; margin: 0; }
.features { list-style: none; padding: 0; margin: 20px 0; display: flex; flex-direction: column; gap: 12px; }
.features li { display: flex; align-items: flex-start; gap: 10px; font-size: 0.95rem; }
.check { color: #16a34a; font-weight: 800; flex-shrink: 0; }
.actions { margin-top: 8px; }
.btn { padding: 8px 16px; border-radius: 10px; border: 1px solid var(--c-border, #e5e7eb); background: var(--c-surface, #fff); cursor: pointer; font: inherit; }
.btn.big { width: 100%; padding: 14px; font-size: 1rem; font-weight: 700; }
.btn.primary { background: var(--c-primary, #0066cc); color: #fff; border-color: var(--c-primary, #0066cc); }
.btn.primary:disabled { opacity: 0.6; cursor: default; }
.btn.ghost { color: var(--c-danger, #ef4444); }
.mock-note { text-align: center; color: var(--c-fg-muted, #9ca3af); font-size: 0.76rem; margin: 10px 0 0; }
</style>

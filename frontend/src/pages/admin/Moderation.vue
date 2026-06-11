<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { moderationApi, type ModerationFlag } from '../../services/moderationApi';
import { useNotificationsStore } from '../../stores/notifications';

// US8 — 관리자 검토 큐: 악성으로 탐지된 평가 리뷰/별점을 유지(keep)·삭제(remove) 처리.

const toast = useNotificationsStore();
const flags = ref<ModerationFlag[]>([]);
const pendingCount = ref(0);
const filter = ref<'pending' | 'kept' | 'removed' | 'all'>('pending');
const loading = ref(true);
const busy = ref<string | null>(null);

const KIND_LABEL: Record<string, string> = {
  TOXIC_TEXT: '악성 텍스트',
  RATING_ANOMALY: '허위/보복성 별점',
};
const SEV_LABEL: Record<string, string> = { low: '낮음', medium: '보통', high: '높음' };

const visible = computed(() => flags.value);

async function load() {
  loading.value = true;
  try {
    const res = await moderationApi.list(filter.value);
    flags.value = res.flags;
    pendingCount.value = res.pendingCount;
  } catch (e) {
    toast.error((e as { detail?: string }).detail ?? '목록을 불러오지 못했습니다.');
  } finally {
    loading.value = false;
  }
}

async function resolve(f: ModerationFlag, decision: 'keep' | 'remove') {
  busy.value = f.id;
  try {
    await moderationApi.resolve(f.id, decision);
    toast.success(decision === 'keep' ? '유지 처리했습니다.' : '삭제(차단) 처리했습니다.');
    await load();
  } catch (e) {
    toast.error((e as { detail?: string }).detail ?? '처리에 실패했습니다.');
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>

<template>
  <section class="page">
    <h1>리뷰 검토 <span v-if="pendingCount" class="pending">{{ pendingCount }}건 대기</span></h1>
    <p class="hint">
      평가 리뷰에서 악성 텍스트(욕설·인격모독) 또는 허위/보복성 별점으로 탐지된 항목입니다.
      유지하면 정상 노출되고, 삭제하면 차단(코멘트 제거·평점 평균에서 제외)됩니다.
    </p>

    <div class="tabs">
      <button v-for="f in (['pending','kept','removed','all'] as const)" :key="f"
              :class="{ active: filter === f }" @click="filter = f; load()">
        {{ { pending: '대기', kept: '유지됨', removed: '삭제됨', all: '전체' }[f] }}
      </button>
    </div>

    <div v-if="loading">불러오는 중…</div>
    <div v-else-if="visible.length === 0" class="empty">항목이 없습니다.</div>
    <ul v-else class="list">
      <li v-for="f in visible" :key="f.id" class="card" :class="f.severity">
        <div class="row1">
          <span class="kind">{{ KIND_LABEL[f.kind] ?? f.kind }}</span>
          <span class="sev" :class="f.severity">심각도 {{ SEV_LABEL[f.severity] }}</span>
          <span class="state" :class="f.state">{{ { pending: '대기', kept: '유지', removed: '삭제' }[f.state] }}</span>
        </div>
        <blockquote v-if="f.snippet" class="snippet">“{{ f.snippet }}”</blockquote>
        <p class="meta">
          <span v-if="f.detail?.reason">{{ f.detail.reason }}</span>
          <span v-else-if="f.detail?.reasons">{{ (f.detail.reasons as string[]).join(' · ') }}</span>
        </p>
        <div v-if="f.state === 'pending'" class="actions">
          <button class="btn keep" :disabled="busy === f.id" @click="resolve(f, 'keep')">유지(정상)</button>
          <button class="btn remove" :disabled="busy === f.id" @click="resolve(f, 'remove')">삭제(차단)</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page { max-width: 760px; }
.pending { font-size: 0.8rem; color: var(--c-danger, #ef4444); margin-left: 8px; }
.hint { color: var(--c-fg-muted, #6b7280); font-size: 0.9rem; }
.tabs { display: flex; gap: 8px; margin: 14px 0; }
.tabs button { border: 1px solid var(--c-border, #e5e7eb); background: none; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.tabs button.active { background: var(--c-primary, #2563eb); color: #fff; border-color: transparent; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.card { border: 1px solid var(--c-border, #e5e7eb); border-left-width: 4px; border-radius: 10px; padding: 12px 14px; }
.card.high { border-left-color: #ef4444; }
.card.medium { border-left-color: #f59e0b; }
.card.low { border-left-color: #9ca3af; }
.row1 { display: flex; gap: 10px; align-items: center; font-size: 0.8rem; }
.kind { font-weight: 600; }
.sev.high { color: #ef4444; }
.sev.medium { color: #f59e0b; }
.state { margin-left: auto; color: var(--c-fg-muted, #9ca3af); }
.snippet { margin: 8px 0; padding: 8px 10px; background: var(--c-bg-subtle, #f9fafb); border-radius: 8px; font-size: 0.9rem; }
.meta { font-size: 0.82rem; color: var(--c-fg-muted, #6b7280); margin: 4px 0 0; }
.actions { display: flex; gap: 8px; margin-top: 10px; }
.btn { border: none; border-radius: 8px; padding: 7px 14px; cursor: pointer; font-size: 0.85rem; }
.btn.keep { background: var(--c-bg-subtle, #f1f5f9); }
.btn.remove { background: var(--c-danger, #ef4444); color: #fff; }
.empty { padding: 32px; text-align: center; color: var(--c-fg-muted, #9ca3af); }
</style>

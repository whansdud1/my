<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useProjectStore } from '../../stores/projects';
import { RouterLink } from 'vue-router';

const store = useProjectStore();

// 탭: 모집 중(RECRUIT) / 진행 중(RUNNING) / 완료(CLOSED)
type Tab = 'RECRUIT' | 'RUNNING' | 'CLOSED';
const tabs: Array<{ key: Tab; label: string }> = [
  { key: 'RECRUIT', label: '모집 중' },
  { key: 'RUNNING', label: '진행 중' },
  { key: 'CLOSED', label: '완료' },
];
const activeTab = ref<Tab>('RECRUIT');

// 검색어(제목·설명 검색) — 현재 탭 안에서 적용된다.
const q = ref('');
const searching = computed(() => q.value.trim().length > 0);

function load() {
  store.fetchList({ status: activeTab.value, q: q.value.trim() || undefined });
}

function selectTab(tab: Tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  load();
}

// 입력 중 가벼운 디바운스로 자동 검색
let debounce: ReturnType<typeof setTimeout> | null = null;
function onSearchInput() {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(load, 300);
}
function clearSearch() {
  if (!q.value) return;
  q.value = '';
  load();
}

onMounted(load);

function statusLabel(status: string) {
  if (status === 'RECRUIT') return '팀원 모집 중';
  if (status === 'RUNNING') return '진행 중';
  return '완료';
}

const emptyText: Record<Tab, string> = {
  RECRUIT: '모집 중인 프로젝트가 없습니다.',
  RUNNING: '진행 중인 프로젝트가 없습니다.',
  CLOSED: '완료된 프로젝트가 없습니다.',
};
</script>

<template>
  <section class="page">
    <header class="page-head">
      <h1>프로젝트</h1>
      <RouterLink to="/projects/new" class="btn primary">+ 새 프로젝트</RouterLink>
    </header>

    <nav class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        type="button"
        :class="{ active: activeTab === t.key }"
        @click="selectTab(t.key)"
      >
        {{ t.label }}
      </button>
    </nav>

    <form class="searchbar" role="search" @submit.prevent="load">
      <span class="search-ico" aria-hidden="true">🔍</span>
      <input
        v-model="q"
        type="search"
        class="search-input"
        :placeholder="`${tabs.find((t) => t.key === activeTab)?.label} 프로젝트 검색 (제목·설명·역할·작성자)`"
        aria-label="프로젝트 검색"
        @input="onSearchInput"
      />
      <button v-if="searching" type="button" class="search-clear" aria-label="검색어 지우기" @click="clearSearch">
        ✕
      </button>
    </form>

    <div v-if="store.loading">불러오는 중…</div>
    <div v-else-if="store.list.length === 0" class="empty card">
      <p v-if="searching">'{{ q.trim() }}'에 대한 검색 결과가 없습니다.</p>
      <p v-else>{{ emptyText[activeTab] }}</p>
      <button v-if="searching" type="button" class="btn" @click="clearSearch">검색 초기화</button>
      <RouterLink v-else-if="activeTab === 'RECRUIT'" to="/projects/new" class="btn primary">
        첫 프로젝트 만들기
      </RouterLink>
    </div>
    <ul v-else class="list">
      <li v-for="p in store.list" :key="p.id" class="card">
        <div class="row">
          <RouterLink :to="`/projects/${p.id}`" class="title">{{ p.title }}</RouterLink>
          <span class="status" :data-status="p.status">{{ statusLabel(p.status) }}</span>
        </div>
        <p class="desc">{{ p.description }}</p>
        <div class="meta">
          <span>모집 {{ p.capacity }}명</span>
          <span>{{ p.startDate }} ~ {{ p.endDate }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--s-lg);
}
.page-head h1 {
  font-size: 40px;
  margin: 0;
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--c-border);
  margin-bottom: var(--s-lg);
}
.tabs button {
  appearance: none;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 10px 16px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  cursor: pointer;
  margin-bottom: -1px;
}
.tabs button.active {
  color: var(--c-primary, #0066cc);
  border-bottom-color: var(--c-primary, #0066cc);
}
.tabs button:hover {
  color: var(--c-ink, var(--c-fg));
}
.searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--c-canvas);
  border: 1px solid var(--c-border);
  border-radius: var(--r-pill, 999px);
  padding: 8px 14px;
  margin-bottom: var(--s-lg);
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.searchbar:focus-within {
  border-color: var(--c-primary, #0066cc);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary, #0066cc) 14%, transparent);
}
.search-ico {
  font-size: 0.95rem;
  opacity: 0.6;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: none;
  font: inherit;
  font-size: 15px;
  color: var(--c-ink, var(--c-fg));
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.search-clear {
  appearance: none;
  border: none;
  background: var(--c-canvas-parchment, #f3f4f6);
  color: var(--c-ink-muted-48, var(--c-fg-muted));
  width: 22px;
  height: 22px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  flex-shrink: 0;
}
.search-clear:hover {
  background: var(--c-border, #e5e7eb);
  color: var(--c-ink, var(--c-fg));
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--s-md);
}
.list .card {
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}
.list .card:hover {
  border-color: var(--c-primary);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-sm);
}
.title {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--c-ink);
  text-decoration: none;
  font-size: 19px;
  letter-spacing: -0.2px;
}
.title:hover {
  text-decoration: none;
  color: var(--c-primary);
}
.status {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.1px;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  background: var(--c-accent-soft);
  color: var(--c-accent);
  white-space: nowrap;
}
.status[data-status='RUNNING'] {
  background: #e7f5ec;
  color: #047857;
}
.status[data-status='COMPLETED'],
.status[data-status='CLOSED'],
.status[data-status='ARCHIVED'] {
  background: var(--c-canvas-parchment);
  color: var(--c-ink-muted-48);
}
.desc {
  color: var(--c-ink-muted-80);
  font-size: 15px;
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.meta {
  display: flex;
  justify-content: space-between;
  gap: var(--s-sm);
  font-size: 13px;
  color: var(--c-ink-muted-48);
  margin-top: auto;
  padding-top: var(--s-xs);
  border-top: 1px solid var(--c-divider-soft);
}
.empty {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-md);
  padding: var(--s-section) var(--s-lg);
}
.empty p {
  font-size: 19px;
  color: var(--c-ink-muted-48);
  margin: 0;
}
</style>

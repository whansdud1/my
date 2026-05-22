<script setup lang="ts">
import { onMounted } from 'vue';
import { useProjectStore } from '../../stores/projects';
import { RouterLink } from 'vue-router';

const store = useProjectStore();
onMounted(() => store.fetchList());
</script>

<template>
  <section>
    <header class="page-head">
      <h1>프로젝트</h1>
      <RouterLink to="/projects/new" class="btn primary">+ 새 프로젝트</RouterLink>
    </header>

    <div v-if="store.loading">불러오는 중…</div>
    <div v-else-if="store.list.length === 0" class="empty card">
      <p>아직 프로젝트가 없습니다.</p>
      <RouterLink to="/projects/new" class="btn">첫 프로젝트 만들기</RouterLink>
    </div>
    <ul v-else class="list">
      <li v-for="p in store.list" :key="p.id" class="card">
        <div class="row">
          <RouterLink :to="`/projects/${p.id}`" class="title">{{ p.title }}</RouterLink>
          <span class="status" :data-status="p.status">{{ p.status }}</span>
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
  margin-bottom: 12px;
}
.list {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.title {
  font-weight: 600;
  color: var(--c-fg);
  text-decoration: none;
  font-size: 1.05rem;
}
.status {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--c-accent-soft);
  color: var(--c-accent);
}
.status[data-status='COMPLETED'] {
  background: #d1fae5;
  color: #047857;
}
.desc {
  color: var(--c-fg-muted);
  font-size: 0.92rem;
  margin: 6px 0;
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--c-fg-muted);
}
.empty {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
}
</style>

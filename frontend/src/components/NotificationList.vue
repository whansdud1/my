<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useNotificationCenter } from '../stores/notificationCenter';
import type { NotificationDto } from '../services/notificationApi';

// 002-notification-system — T019 알림 목록 드롭다운
defineEmits<{ close: [] }>();

const center = useNotificationCenter();
const router = useRouter();
const onlyUnread = ref(false);

const visible = computed(() =>
  onlyUnread.value ? center.items.filter((n) => n.status === 'unread') : center.items,
);

async function open(n: NotificationDto) {
  if (n.status === 'unread') await center.markRead(n.id);
  if (n.deepLink) {
    center.open = false;
    // 내부 경로면 라우터로, 외부면 location
    if (n.deepLink.startsWith('/')) router.push(n.deepLink);
    else window.location.href = n.deepLink;
  }
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return d.toLocaleDateString();
}
</script>

<template>
  <div class="panel" @keydown.esc="$emit('close')">
    <header class="head">
      <strong>알림</strong>
      <div class="actions">
        <label class="filter">
          <input type="checkbox" v-model="onlyUnread" /> 안읽음만
        </label>
        <button class="link" @click="center.markAllRead()">전체 읽음</button>
        <RouterLink to="/settings/notifications" class="link" @click="$emit('close')">설정</RouterLink>
      </div>
    </header>

    <div v-if="center.loading" class="empty">불러오는 중…</div>
    <div v-else-if="visible.length === 0" class="empty">알림이 없습니다.</div>
    <ul v-else class="list">
      <li
        v-for="n in visible"
        :key="n.id"
        :class="['item', { unread: n.status === 'unread', critical: n.priority === 'critical' }]"
        @click="open(n)"
      >
        <div class="row">
          <span class="title">{{ n.title }}</span>
          <span class="time">{{ fmt(n.createdAt) }}</span>
        </div>
        <p class="body">{{ n.body }}<span v-if="n.groupCount > 1" class="grp"> ·{{ n.groupCount }}건</span></p>
      </li>
    </ul>

    <button v-if="center.nextCursor" class="more" @click="center.loadMore()">더 보기</button>
  </div>
</template>

<style scoped>
.panel {
  position: absolute;
  right: 0;
  top: 120%;
  width: 340px;
  max-height: 460px;
  overflow-y: auto;
  background: var(--c-bg, #fff);
  /* 패널이 흰 글씨의 다크 헤더(.global-nav) 안에 렌더되므로 글씨색을 명시적으로 되돌린다 */
  color: var(--c-ink, #1d1d1f);
  border: 1px solid var(--c-border, #e5e7eb);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  z-index: 50;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-border, #e5e7eb);
  position: sticky;
  top: 0;
  background: inherit;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filter {
  font-size: 0.78rem;
  color: var(--c-fg-muted, #6b7280);
}
.link {
  background: none;
  border: none;
  color: var(--c-primary, #2563eb);
  cursor: pointer;
  font-size: 0.78rem;
  text-decoration: none;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--c-border, #f1f5f9);
  cursor: pointer;
}
.item:hover {
  background: var(--c-bg-subtle, #f9fafb);
}
.item.unread {
  background: var(--c-primary-subtle, #eff6ff);
}
.item.critical .title {
  color: var(--c-danger, #ef4444);
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.title {
  font-weight: 600;
  font-size: 0.88rem;
}
.time {
  font-size: 0.72rem;
  color: var(--c-fg-muted, #9ca3af);
  white-space: nowrap;
}
.body {
  margin: 4px 0 0;
  font-size: 0.8rem;
  color: var(--c-fg-muted, #6b7280);
}
.grp {
  color: var(--c-primary, #2563eb);
  font-weight: 600;
}
.empty {
  padding: 32px 14px;
  text-align: center;
  color: var(--c-fg-muted, #9ca3af);
  font-size: 0.85rem;
}
.more {
  width: 100%;
  padding: 10px;
  background: none;
  border: none;
  border-top: 1px solid var(--c-border, #e5e7eb);
  color: var(--c-primary, #2563eb);
  cursor: pointer;
  font-size: 0.82rem;
}
</style>

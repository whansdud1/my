<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useNotificationCenter } from '../stores/notificationCenter';
import NotificationList from './NotificationList.vue';

// 002-notification-system — T018 알림 벨 + 안읽음 배지
const center = useNotificationCenter();

onMounted(() => center.startPolling());
onUnmounted(() => center.stopPolling());
</script>

<template>
  <div class="bell-wrap">
    <button class="bell" :aria-label="`알림 ${center.unreadCount}건`" @click="center.toggle()">
      🔔
      <span v-if="center.unreadCount > 0" class="badge">{{
        center.unreadCount > 99 ? '99+' : center.unreadCount
      }}</span>
    </button>
    <NotificationList v-if="center.open" @close="center.open = false" />
  </div>
</template>

<style scoped>
.bell-wrap {
  position: relative;
  display: inline-block;
}
.bell {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.25rem;
  position: relative;
  padding: 6px;
}
.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--c-danger, #ef4444);
  color: #fff;
  font-size: 0.65rem;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 10px;
  font-weight: 600;
}
</style>

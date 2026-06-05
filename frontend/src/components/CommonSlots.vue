<script setup lang="ts">
import type { CommonSlot } from '../services/scheduleApi';

// 003-schedule-coordination — T009 공통 시간 후보 표시
defineProps<{ slots: CommonSlot[]; totalMembers: number }>();
const emit = defineEmits<{ pick: [slot: CommonSlot] }>();

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
</script>

<template>
  <div>
    <h3>공통 가능 시간</h3>
    <p v-if="!slots.length" class="hint">공통 가능한 시간이 없습니다. 팀원들의 가용시간 입력을 확인하세요.</p>
    <ul v-else class="slots">
      <li v-for="(s, i) in slots" :key="i" class="slot" @click="emit('pick', s)">
        <span class="day">{{ WEEKDAYS[s.weekday] }}요일</span>
        <span class="time">{{ hhmm(s.startMin) }}–{{ hhmm(s.endMin) }}</span>
        <span :class="['badge', { full: s.availableCount === s.totalMembers }]">
          {{ s.availableCount }}/{{ s.totalMembers }}명
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.hint { color: var(--c-fg-muted, #6b7280); font-size: 0.9rem; }
.slots { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.slot {
  display: flex; align-items: center; gap: 12px; padding: 10px 12px;
  border: 1px solid var(--c-border, #e5e7eb); border-radius: 10px; cursor: pointer;
}
.slot:hover { background: var(--c-bg-subtle, #f9fafb); }
.day { font-weight: 600; min-width: 56px; }
.time { font-variant-numeric: tabular-nums; }
.badge {
  margin-left: auto; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px;
  background: var(--c-bg-subtle, #f3f4f6); color: var(--c-fg-muted, #6b7280);
}
.badge.full { background: #dcfce7; color: #16a34a; font-weight: 600; }
</style>

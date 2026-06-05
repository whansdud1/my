<script setup lang="ts">
import { ref } from 'vue';
import type { EventCreate } from '../services/scheduleApi';

// 003-schedule-coordination — T013 일정 생성 폼
const emit = defineEmits<{ submit: [body: EventCreate] }>();

const type = ref<EventCreate['type']>('MEETING');
const title = ref('');
const startsAt = ref('');
const endsAt = ref('');
const repeatWeeks = ref(0);
const error = ref('');

function submit() {
  error.value = '';
  if (!title.value.trim() || !startsAt.value) {
    error.value = '제목과 시작 시각을 입력하세요';
    return;
  }
  const body: EventCreate = {
    type: type.value,
    title: title.value.trim(),
    startsAt: new Date(startsAt.value).toISOString(),
  };
  if (type.value === 'MEETING' && endsAt.value) body.endsAt = new Date(endsAt.value).toISOString();
  if (type.value === 'MEETING' && repeatWeeks.value > 0) body.repeatWeeks = repeatWeeks.value;
  emit('submit', body);
  title.value = '';
  startsAt.value = '';
  endsAt.value = '';
  repeatWeeks.value = 0;
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <h3>일정 추가</h3>
    <div class="row">
      <select v-model="type">
        <option value="MEETING">회의</option>
        <option value="DEADLINE">마감</option>
        <option value="MILESTONE">산출물</option>
      </select>
      <input v-model="title" placeholder="제목" maxlength="150" />
    </div>
    <div class="row">
      <label>시작 <input type="datetime-local" v-model="startsAt" /></label>
      <label v-if="type === 'MEETING'">종료 <input type="datetime-local" v-model="endsAt" /></label>
    </div>
    <div class="row" v-if="type === 'MEETING'">
      <label>반복(주) <input type="number" min="0" max="8" v-model.number="repeatWeeks" style="width: 64px" /></label>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <button class="btn primary" type="submit">추가</button>
  </form>
</template>

<style scoped>
.form { border: 1px solid var(--c-border, #e5e7eb); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.row input[type='text'], .row input:not([type]), .row input[placeholder] { flex: 1; min-width: 140px; }
.err { color: var(--c-danger, #ef4444); font-size: 0.82rem; margin: 0; }
.btn.primary { align-self: flex-start; }
</style>

<script setup lang="ts">
import { reactive, onMounted, ref } from 'vue';
import { api } from '../../services/api';
import { useNotificationsStore } from '../../stores/notifications';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// grid[d][h] = boolean
const grid = reactive<boolean[][]>(DAYS.map(() => HOURS.map(() => false)));
const nightPreferred = ref(false);
const loading = ref(false);
const notify = useNotificationsStore();

interface Slot {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
}

onMounted(async () => {
  try {
    const { data } = await api.get<{ slots: Slot[]; nightPreferred: boolean }>(
      '/users/me/availability',
    );
    nightPreferred.value = data.nightPreferred;
    for (const s of data.slots) {
      for (let h = s.startHour; h < s.endHour; h++) {
        grid[s.dayOfWeek][h] = true;
      }
    }
  } catch {
    /* 신규 사용자는 데이터 없을 수 있음 */
  }
});

function toggle(d: number, h: number) {
  grid[d][h] = !grid[d][h];
}

function compress(): Slot[] {
  // 연속된 hour 를 [start, end) 슬롯으로 묶음
  const slots: Slot[] = [];
  for (let d = 0; d < DAYS.length; d++) {
    let start: number | null = null;
    for (let h = 0; h <= HOURS.length; h++) {
      const on = h < HOURS.length && grid[d][h];
      if (on && start === null) start = h;
      else if (!on && start !== null) {
        slots.push({ dayOfWeek: d, startHour: start, endHour: h });
        start = null;
      }
    }
  }
  return slots;
}

async function save() {
  loading.value = true;
  try {
    await api.put('/users/me/availability', {
      slots: compress(),
      nightPreferred: nightPreferred.value,
    });
    notify.success('가용 시간이 저장되었습니다.');
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '저장에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page avail">
    <h1>가용 시간 편집</h1>
    <p class="hint">셀을 클릭해 가능 시간을 선택하세요. (드래그 미지원, 클릭 토글)</p>
    <div class="card">
      <div class="grid">
        <div class="corner"></div>
        <div v-for="d in DAYS" :key="d" class="hd">{{ d }}</div>
        <template v-for="h in HOURS" :key="h">
          <div class="hd-row">{{ String(h).padStart(2, '0') }}:00</div>
          <button
            v-for="(_, d) in DAYS"
            :key="`${d}-${h}`"
            class="cell"
            :class="{ on: grid[d][h] }"
            @click="toggle(d, h)"
            :aria-label="`${DAYS[d]} ${h}시`"
            :aria-pressed="grid[d][h]"
          ></button>
        </template>
      </div>

      <label class="night">
        <input type="checkbox" v-model="nightPreferred" />
        야간(22:00–02:00) 작업 선호
      </label>

      <button class="btn primary" :disabled="loading" @click="save">
        {{ loading ? '저장 중…' : '저장' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.avail {
  max-width: 720px;
  margin: 24px auto;
}
.hint {
  color: var(--c-fg-muted);
  font-size: 0.9rem;
}
.grid {
  display: grid;
  grid-template-columns: 56px repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 14px;
}
.hd {
  text-align: center;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 4px 0;
}
.corner {
}
.hd-row {
  font-size: 0.75rem;
  color: var(--c-fg-muted);
  padding-right: 6px;
  text-align: right;
}
.cell {
  height: 22px;
  border: 1px solid var(--c-border);
  background: var(--c-bg);
  cursor: pointer;
  border-radius: 3px;
}
.cell.on {
  background: var(--c-accent);
  border-color: var(--c-accent);
}
.night {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
}
</style>

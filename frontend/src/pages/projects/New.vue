<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore } from '../../stores/projects';
import { useNotificationsStore } from '../../stores/notifications';
import { PROJECT_ROLES } from '../../constants/roles';

const form = reactive({
  title: '',
  description: '',
  capacity: 4,
  startDate: '',
  endDate: '',
  preferredTimeNote: '',
});

// 역할별 모집 인원 — { 역할명: 인원수 }
const roleCounts = reactive<Record<string, number>>({});

const ALL_ROLES = PROJECT_ROLES;
const loading = ref(false);
const router = useRouter();
const projects = useProjectStore();
const notify = useNotificationsStore();

const selectedRoles = computed(() => ALL_ROLES.filter((r) => r in roleCounts));
// 역할별 모집 인원 합계
const roleSum = computed(() =>
  selectedRoles.value.reduce((s, r) => s + (Number(roleCounts[r]) || 0), 0),
);
// 팀장 본인(1명)을 제외하고 역할로 모집할 인원
const needToRecruit = computed(() => (Number(form.capacity) || 0) - 1);
// 합계 일치 여부: 팀장 1명 + 역할별 합계 = 총 모집 인원
const sumMatches = computed(() => selectedRoles.value.length > 0 && roleSum.value === needToRecruit.value);

function toggleRole(r: string) {
  if (r in roleCounts) delete roleCounts[r];
  else roleCounts[r] = 1;
}

// 날짜 입력: 필드 아무 곳이나 누르면 네이티브 달력이 바로 열리게 한다.
// (Safari 등 브라우저별로 아이콘 클릭이 필요한 편차를 없애기 위함)
function openDatePicker(e: Event) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    /* 사용자 제스처 밖 호출/미지원 시 기본 동작에 맡김 */
  }
}

function setCount(r: string, v: number) {
  roleCounts[r] = Math.max(1, Math.floor(Number(v) || 1));
}

async function submit() {
  if (selectedRoles.value.length === 0) {
    notify.warn('필요 역할을 1개 이상 선택해주세요.');
    return;
  }
  if (!sumMatches.value) {
    notify.warn(
      `역할별 모집 인원 합계(${roleSum.value}명)와 팀장 1명을 더하면 ${roleSum.value + 1}명입니다. 총 모집 인원(${form.capacity}명)과 일치시켜 주세요.`,
    );
    return;
  }
  loading.value = true;
  try {
    const requiredRoles = selectedRoles.value.map((r) => ({ role: r, count: roleCounts[r] }));
    const p = await projects.create({ ...form, requiredRoles });
    notify.success('프로젝트가 생성되었습니다.');
    router.push(`/projects/${p.id}`);
  } catch (e) {
    notify.error((e as { detail?: string }).detail ?? '생성에 실패했습니다.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page new-project">
    <h1>새 프로젝트</h1>
    <form @submit.prevent="submit" class="card">
      <label>
        <span>제목</span>
        <input class="input" v-model="form.title" required maxlength="100" />
      </label>
      <label>
        <span>설명</span>
        <textarea class="textarea" v-model="form.description" rows="4" maxlength="1000"></textarea>
      </label>
      <div class="grid-2">
        <label>
          <span>총 모집 인원 (본인 포함)</span>
          <input
            class="input"
            type="number"
            v-model.number="form.capacity"
            min="2"
            max="20"
            required
          />
        </label>
        <label>
          <span>선호 작업 시간대</span>
          <input class="input" v-model="form.preferredTimeNote" placeholder="예: 평일 야간" />
        </label>
        <label>
          <span>시작일</span>
          <input
            class="input"
            type="date"
            v-model="form.startDate"
            required
            @click="openDatePicker"
            @focus="openDatePicker"
          />
        </label>
        <label>
          <span>종료일</span>
          <input
            class="input"
            type="date"
            v-model="form.endDate"
            required
            @click="openDatePicker"
            @focus="openDatePicker"
          />
        </label>
      </div>

      <div>
        <span class="lbl">필요 역할 (역할별 모집 인원)</span>
        <div class="roles">
          <button
            type="button"
            v-for="r in ALL_ROLES"
            :key="r"
            class="chip"
            :class="{ active: r in roleCounts }"
            @click="toggleRole(r)"
          >
            {{ r }}
          </button>
        </div>

        <!-- 선택한 역할별 인원 입력 -->
        <ul v-if="selectedRoles.length" class="role-counts">
          <li v-for="r in selectedRoles" :key="r">
            <span class="rc-name">{{ r }}</span>
            <input
              class="input rc-input"
              type="number"
              min="1"
              :max="20"
              :value="roleCounts[r]"
              @input="setCount(r, ($event.target as HTMLInputElement).valueAsNumber)"
            />
            <span class="rc-unit">명</span>
          </li>
        </ul>

        <!-- 합계 검증 안내 -->
        <p v-if="selectedRoles.length" class="sum-hint" :class="{ ok: sumMatches, bad: !sumMatches }">
          팀장 1명 + 역할별 합계 {{ roleSum }}명 = {{ roleSum + 1 }}명
          / 총 모집 인원 {{ form.capacity }}명
          <strong>{{ sumMatches ? '✓ 일치' : '✗ 불일치' }}</strong>
        </p>
        <p v-else class="lbl muted">역할을 선택하면 역할별 모집 인원을 정할 수 있습니다.</p>
      </div>

      <button class="btn primary" :disabled="loading || !sumMatches">
        {{ loading ? '생성 중…' : '프로젝트 생성' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.new-project {
  max-width: 720px;
  margin: 24px auto;
}
.new-project .card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.lbl {
  display: block;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
  margin-bottom: 6px;
}
.lbl.muted {
  margin-top: 8px;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  background: var(--c-bg);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--c-fg);
}
.chip.active {
  background: var(--c-accent-soft);
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.role-counts {
  list-style: none;
  padding: 0;
  margin: 12px 0 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.role-counts li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-name {
  min-width: 96px;
  font-size: 0.9rem;
  color: var(--c-fg);
}
.rc-input {
  width: 88px;
}
.rc-unit {
  font-size: 0.85rem;
  color: var(--c-fg-muted);
}
.sum-hint {
  margin-top: 12px;
  font-size: 0.88rem;
  padding: 8px 12px;
  border-radius: 8px;
}
.sum-hint.ok {
  background: #e7f5ec;
  color: #047857;
}
.sum-hint.bad {
  background: #fdecec;
  color: #c0392b;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9rem;
  color: var(--c-fg-muted);
}
</style>

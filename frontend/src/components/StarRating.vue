<script setup lang="ts">
import { ref, computed } from 'vue';

// 0.5 단위(반개) 별점 위젯. 5점 만점.
// 입력: 각 별의 좌/우 절반을 클릭해 0.5 단위로 선택. readonly 면 표시 전용.
const props = withDefaults(
  defineProps<{
    modelValue?: number;
    readonly?: boolean;
    size?: number; // px
  }>(),
  { modelValue: 0, readonly: false, size: 28 },
);

const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>();

const hover = ref<number | null>(null);
const display = computed(() => hover.value ?? props.modelValue ?? 0);

// 별 한 칸(1..5)의 채움 비율(0/50/100%)
function fillPct(star: number): number {
  const v = display.value;
  if (v >= star) return 100;
  if (v >= star - 0.5) return 50;
  return 0;
}

function pick(v: number) {
  if (props.readonly) return;
  // 같은 값을 다시 누르면 해제(0점)
  emit('update:modelValue', props.modelValue === v ? 0 : v);
}
function setHover(v: number | null) {
  if (props.readonly) return;
  hover.value = v;
}
</script>

<template>
  <div
    class="stars"
    :class="{ readonly }"
    :style="{ fontSize: size + 'px' }"
    @mouseleave="setHover(null)"
  >
    <span v-for="star in 5" :key="star" class="star">
      <span class="bg">★</span>
      <span class="fg" :style="{ width: fillPct(star) + '%' }">★</span>
      <template v-if="!readonly">
        <button
          type="button"
          class="hit left"
          :aria-label="`${star - 0.5}점`"
          @click="pick(star - 0.5)"
          @mouseenter="setHover(star - 0.5)"
        ></button>
        <button
          type="button"
          class="hit right"
          :aria-label="`${star}점`"
          @click="pick(star)"
          @mouseenter="setHover(star)"
        ></button>
      </template>
    </span>
  </div>
</template>

<style scoped>
.stars {
  display: inline-flex;
  line-height: 1;
  gap: 1px;
}
.star {
  position: relative;
  display: inline-block;
  width: 1em;
  height: 1em;
}
.bg {
  color: var(--c-border, #d9d9d9);
}
.fg {
  position: absolute;
  left: 0;
  top: 0;
  overflow: hidden;
  color: #f5b301;
  white-space: nowrap;
}
.hit {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.hit.left {
  left: 0;
}
.hit.right {
  right: 0;
}
.stars.readonly .star {
  cursor: default;
}
</style>

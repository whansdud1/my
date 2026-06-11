<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';
import DefaultLayout from './layouts/DefaultLayout.vue';
import { useAuthStore } from './stores/auth';

// 앱 로드 시 로그인 상태면 최신 사용자 정보(프리미엄 여부 포함)를 갱신한다.
const auth = useAuthStore();
onMounted(() => {
  if (auth.accessToken) auth.fetchMe().catch(() => {});
});
</script>

<template>
  <DefaultLayout>
    <RouterView />
  </DefaultLayout>
</template>

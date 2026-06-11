<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { brandingApi, type SiteBranding } from '../services/brandingApi';

// 관리자가 설정한 메인 화면 브랜딩(배너 이미지·문구). 실패해도 기본 화면은 그대로 노출.
const branding = ref<SiteBranding | null>(null);

const isBackground = computed(() => branding.value?.imageMode === 'background');

// 관리자가 지정한 배너 표시 배율(%)을 기본 크기(폭 880px·높이 360px)에 적용(배너 모드).
const bannerStyle = computed(() => {
  const scale = (branding.value?.imageScale ?? 100) / 100;
  return {
    maxWidth: `${Math.round(880 * scale)}px`,
    maxHeight: `${Math.round(360 * scale)}px`,
  };
});

// 배경 전체 모드 — 히어로 영역 전체에 이미지를 깐다(문구는 그 위, 흰 스크림으로 가독성 확보).
const heroStyle = computed(() =>
  isBackground.value && branding.value?.imageUrl
    ? { backgroundImage: `url("${branding.value.imageUrl}")` }
    : {},
);

// --- 하단 검은색 영역 이미지(히어로와 동일 구조) ---
const darkIsBackground = computed(() => branding.value?.darkImageMode === 'background');
const darkBannerStyle = computed(() => {
  const scale = (branding.value?.darkImageScale ?? 100) / 100;
  return {
    maxWidth: `${Math.round(880 * scale)}px`,
    maxHeight: `${Math.round(360 * scale)}px`,
  };
});
const darkTileStyle = computed(() =>
  darkIsBackground.value && branding.value?.darkImageUrl
    ? { backgroundImage: `url("${branding.value.darkImageUrl}")` }
    : {},
);

onMounted(async () => {
  try {
    branding.value = await brandingApi.get();
  } catch {
    /* 브랜딩 없음/오류는 무시 — 기본 화면 노출 */
  }
});
</script>

<template>
  <!-- TILE 1: canvas hero (light) -->
  <section class="tile tile-canvas hero" :class="{ 'hero--bg': isBackground && branding?.imageUrl }" :style="heroStyle">
    <img v-if="branding?.imageUrl && !isBackground" :src="branding.imageUrl" alt="" class="hero-banner" :style="bannerStyle" />
    <h1>{{ branding?.headline || 'UniTeam.' }}</h1>
    <p class="lead">{{ branding?.subtext || '대학생 팀 프로젝트, 더 합리적인 매칭으로.' }}</p>
    <div class="ctas">
      <RouterLink class="btn primary" to="/signup">시작하기</RouterLink>
      <RouterLink class="btn secondary" to="/login">로그인 &rsaquo;</RouterLink>
    </div>
  </section>

  <!-- TILE 2: dark — value proposition (관리자 편집 가능, 줄바꿈은 그대로 반영) -->
  <section
    class="tile tile-dark"
    :class="{ 'tile-dark--bg': darkIsBackground && branding?.darkImageUrl }"
    :style="darkTileStyle"
  >
    <img
      v-if="branding?.darkImageUrl && !darkIsBackground"
      :src="branding.darkImageUrl"
      alt=""
      class="hero-banner"
      :style="darkBannerStyle"
    />
    <h2 class="dark-headline">{{ branding?.darkHeadline || '최적의 팀을\n단 5초에.' }}</h2>
    <p class="lead lead-on-dark dark-subtext">{{
      branding?.darkSubtext ||
      '전공·일정·협업 성향·평가 이력을 종합한 6축 가중치로\n가장 잘 어울리는 팀원을 추천합니다.'
    }}</p>
    <RouterLink class="btn primary" to="/projects">{{ branding?.darkCta || '매칭 시작 ›' }}</RouterLink>
  </section>
</template>

<style scoped>
.hero {
  padding: 120px var(--s-lg) 96px;
}
/* 배경 전체 모드 — 이미지를 히어로 영역 전체에 깔고, 흰 스크림 위에 문구를 올린다. */
.hero--bg {
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.hero--bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.55); /* 문구 가독성 스크림 */
  z-index: 0;
}
.hero--bg > * {
  position: relative; /* 문구·버튼을 스크림 위로 */
  z-index: 1;
}
.hero-banner {
  display: block;
  width: 100%;
  max-width: 880px;
  max-height: 360px;
  object-fit: cover;
  border-radius: var(--r-lg, 16px);
  border: 1px solid var(--c-hairline);
  margin: 0 auto var(--s-xl);
}
.hero h1 {
  margin-bottom: var(--s-md);
}
.hero .lead {
  margin-bottom: var(--s-xl);
}
.ctas {
  display: inline-flex;
  gap: var(--s-md);
  flex-wrap: wrap;
  justify-content: center;
}

.tile-dark .lead-on-dark {
  color: var(--c-body-muted);
  margin-bottom: var(--s-xl);
}
/* 관리자가 입력한 줄바꿈(\n)을 그대로 렌더 */
.dark-headline,
.dark-subtext {
  white-space: pre-line;
}
/* 배경 전체 모드 — 검은색 영역 전체에 이미지를 깔고, 어두운 스크림 위에 문구를 올린다. */
.tile-dark--bg {
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.tile-dark--bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55); /* 문구 가독성 스크림(어두운 영역) */
  z-index: 0;
}
.tile-dark--bg > * {
  position: relative; /* 문구·버튼을 스크림 위로 */
  z-index: 1;
}
.tile-dark .btn.primary:focus-visible {
  outline-color: var(--c-primary-on-dark);
}

@media (max-width: 720px) {
  .hero h1 {
    font-size: 40px;
    line-height: 1.1;
  }
  .hero {
    padding: 64px var(--s-lg) 48px;
  }
  .tile-dark h2,
  .tile-canvas h2 {
    font-size: 32px;
  }
}
</style>

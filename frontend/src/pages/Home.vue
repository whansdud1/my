<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../services/api';

const health = ref<{ status: string; uptime: number } | null>(null);
const healthError = ref<string | null>(null);

onMounted(async () => {
  try {
    const { data } = await api.get('/health');
    health.value = data;
  } catch (e) {
    healthError.value = (e as { detail?: string; title?: string }).detail ?? '백엔드 응답 없음';
  }
});
</script>

<template>
  <!-- TILE 1: canvas hero (light) -->
  <section class="tile tile-canvas hero">
    <h1>UniTeam.</h1>
    <p class="lead">대학생 팀 프로젝트, 더 합리적인 매칭으로.</p>
    <div class="ctas">
      <RouterLink class="btn primary" to="/signup">시작하기</RouterLink>
      <RouterLink class="btn secondary" to="/login">로그인 &rsaquo;</RouterLink>
    </div>
  </section>

  <!-- TILE 2: dark — value proposition -->
  <section class="tile tile-dark">
    <h2>최적의 팀을<br />단 5초에.</h2>
    <p class="lead lead-on-dark">
      전공·일정·협업 성향·평가 이력을 종합한 6축 가중치로<br />
      가장 잘 어울리는 팀원을 추천합니다.
    </p>
    <RouterLink class="btn primary" to="/projects">매칭 시작 &rsaquo;</RouterLink>
  </section>

  <!-- TILE 3: parchment — 3 feature cards -->
  <section class="tile tile-parchment">
    <h2>핵심 가치 루프</h2>
    <div class="features container-wide">
      <article class="feat-card">
        <div class="feat-num">01</div>
        <h4>가입 &middot; 프로필</h4>
        <p class="caption">학과·학년·선호 역할·가용 시간·12문항 협업 성향 설문</p>
      </article>
      <article class="feat-card">
        <div class="feat-num">02</div>
        <h4>프로젝트 &middot; 매칭</h4>
        <p class="caption">FR-B6 동시 3건 가드 + 7일 캐시된 적합도 점수 추천</p>
      </article>
      <article class="feat-card">
        <div class="feat-num">03</div>
        <h4>평가 &middot; 평점</h4>
        <p class="caption">동료 4축 평가 + AI 활동 분석 = 종합 별점 (0.6 peer + 0.4 AI)</p>
      </article>
    </div>
  </section>

  <!-- TILE 4: canvas — system status -->
  <section class="tile tile-canvas">
    <h2 class="status-h2">시스템 상태</h2>
    <div class="status-card card">
      <template v-if="health">
        <div class="status-row">
          <span class="dot ok" />
          <strong>백엔드</strong>
          <span class="caption">/api/v1/health · uptime {{ Math.floor(health.uptime) }}s</span>
        </div>
        <p class="fine-print muted">
          frontend :9518 · backend :9538 · domain
          <code>p18.sumzip.com</code>
        </p>
      </template>
      <template v-else-if="healthError">
        <div class="status-row">
          <span class="dot err" />
          <strong>백엔드</strong>
          <span class="caption">{{ healthError }}</span>
        </div>
      </template>
      <template v-else>
        <p class="caption muted">확인 중…</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding: 120px var(--s-lg) 96px;
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
.tile-dark .btn.primary:focus-visible {
  outline-color: var(--c-primary-on-dark);
}

/* ---- features grid ---- */
.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s-lg);
  margin-top: var(--s-xl);
  text-align: left;
}
.feat-card {
  background: var(--c-canvas);
  border: 1px solid var(--c-hairline);
  border-radius: var(--r-lg);
  padding: var(--s-lg);
  min-height: 180px;
  display: flex;
  flex-direction: column;
  gap: var(--s-xs);
}
.feat-num {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--c-primary);
  letter-spacing: -0.224px;
}
.feat-card h4 {
  margin: 0;
}
.feat-card .caption {
  color: var(--c-ink-muted-80);
}

/* ---- status ---- */
.status-h2 {
  margin-bottom: var(--s-xl);
}
.status-card {
  max-width: 520px;
  margin: 0 auto;
  text-align: left;
}
.status-row {
  display: flex;
  align-items: center;
  gap: var(--s-sm);
  margin-bottom: var(--s-sm);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  display: inline-block;
}
.dot.ok {
  background: var(--c-success);
}
.dot.err {
  background: var(--c-danger);
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
  .tile-parchment h2,
  .tile-canvas h2 {
    font-size: 32px;
  }
  .features {
    grid-template-columns: 1fr;
  }
}
</style>

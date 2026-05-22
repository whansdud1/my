<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useNotificationsStore } from '../stores/notifications';
import { computed } from 'vue';

const auth = useAuthStore();
const notify = useNotificationsStore();
const isAuthed = computed(() => !!auth.accessToken);
</script>

<template>
  <div class="app-shell">
    <!-- Apple global-nav: black, 44px, nav-link 12px -->
    <header class="global-nav" role="banner">
      <nav class="global-nav-inner" aria-label="primary">
        <RouterLink to="/" class="brand">UniTeam</RouterLink>
        <div class="nav-spacer" />
        <RouterLink to="/projects">프로젝트</RouterLink>
        <RouterLink v-if="isAuthed" to="/evaluations">평가</RouterLink>
        <RouterLink v-if="isAuthed" to="/profile">프로필</RouterLink>
        <RouterLink v-if="!isAuthed" to="/login">로그인</RouterLink>
        <button v-else class="nav-logout" @click="auth.logout()">로그아웃</button>
      </nav>
    </header>

    <main class="app-main">
      <slot />
    </main>

    <!-- Apple footer: parchment, fine-print -->
    <footer class="app-footer" role="contentinfo">
      <div class="footer-inner">
        <p class="fine-print">© UniTeam · MIS2601 — 대학생 팀 매칭 플랫폼</p>
        <p class="fine-print">
          <a href="https://p18.sumzip.com" target="_blank" rel="noopener">p18.sumzip.com</a>
        </p>
      </div>
    </footer>

    <!-- Toast stack -->
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <div v-for="t in notify.toasts" :key="t.id" class="toast" :class="t.level">
        {{ t.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--c-canvas);
}

/* ---- global-nav (Apple): pure black, 44px, sticky ---- */
.global-nav {
  background: var(--c-surface-black);
  color: var(--c-on-dark);
  height: 44px;
  position: sticky;
  top: 0;
  z-index: 100;
}
.global-nav-inner {
  max-width: 1024px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  gap: var(--s-lg);
  padding: 0 var(--s-lg);
}
.brand {
  color: var(--c-on-dark);
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.18px;
}
.brand:hover {
  text-decoration: none;
  opacity: 0.86;
}
.nav-spacer {
  flex: 1;
}
.global-nav a {
  color: var(--c-on-dark);
  font-size: 12px;
  letter-spacing: -0.12px;
  line-height: 1;
  opacity: 0.86;
  padding: 4px 8px;
}
.global-nav a:hover {
  opacity: 1;
  text-decoration: none;
}
.global-nav a.router-link-active {
  opacity: 1;
}
.nav-logout {
  background: transparent;
  border: 0;
  color: var(--c-on-dark);
  font: inherit;
  font-size: 12px;
  letter-spacing: -0.12px;
  opacity: 0.86;
  cursor: pointer;
  padding: 4px 8px;
}
.nav-logout:hover {
  opacity: 1;
}

/* ---- main content ---- */
.app-main {
  padding: 0;
}

/* ---- footer (Apple parchment) ---- */
.app-footer {
  background: var(--c-canvas-parchment);
  color: var(--c-ink-muted-80);
  padding: 64px var(--s-lg);
}
.footer-inner {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--s-md);
}
.footer-inner .fine-print {
  margin: 0;
}
</style>

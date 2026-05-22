<template>
  <section class="not-found">
    <h1>404</h1>
    <p>요청하신 페이지를 찾을 수 없습니다.</p>
    <RouterLink class="btn" to="/">홈으로</RouterLink>
  </section>
</template>

<style scoped>
.not-found {
  text-align: center;
  padding: 64px 24px;
}
h1 {
  font-size: 4rem;
  margin: 0;
  color: var(--c-fg-muted);
}
</style>

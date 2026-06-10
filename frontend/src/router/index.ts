import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('../pages/Home.vue') },

  // Auth (US1)
  { path: '/signup', name: 'signup', component: () => import('../pages/auth/Signup.vue') },
  { path: '/login', name: 'login', component: () => import('../pages/auth/Login.vue') },

  // Profile (US1)
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../pages/profile/Edit.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile/availability',
    name: 'availability',
    component: () => import('../pages/profile/Availability.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/onboarding/survey',
    name: 'survey',
    component: () => import('../pages/onboarding/Survey.vue'),
    meta: { requiresAuth: true },
  },

  // 추천 팀원 허브 — 내 프로젝트별 추천 팀원 진입점
  {
    path: '/recommend',
    name: 'recommend-hub',
    component: () => import('../pages/projects/RecommendHub.vue'),
    meta: { requiresAuth: true },
  },

  // Projects (US2)
  {
    path: '/projects',
    name: 'projects',
    component: () => import('../pages/projects/List.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/new',
    name: 'project-new',
    component: () => import('../pages/projects/New.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('../pages/projects/Detail.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:id/recommendations',
    name: 'project-recommendations',
    component: () => import('../pages/projects/Recommendations.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:id/schedule',
    name: 'project-schedule',
    component: () => import('../pages/projects/Schedule.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:id/tasks',
    name: 'project-tasks',
    component: () => import('../pages/projects/Tasks.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects/:id/dashboard',
    name: 'project-dashboard',
    component: () => import('../pages/projects/Dashboard.vue'),
    meta: { requiresAuth: true },
  },

  // Evaluations (US4)
  {
    path: '/evaluations',
    name: 'evaluations',
    component: () => import('../pages/evaluations/Inbox.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/evaluations/:projectId/submit',
    name: 'evaluation-submit',
    component: () => import('../pages/evaluations/Submit.vue'),
    meta: { requiresAuth: true },
  },

  // Notifications (002-notification-system)
  {
    path: '/settings/notifications',
    name: 'notification-settings',
    component: () => import('../pages/settings/Notifications.vue'),
    meta: { requiresAuth: true },
  },

  // 404 fallback
  { path: '/:pathMatch(.*)*', component: () => import('../pages/NotFound.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 로그인한 사용자에게는 랜딩(홈)·로그인·회원가입 화면을 노출하지 않는다.
const GUEST_ONLY = new Set(['home', 'login', 'signup']);

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (auth.accessToken && GUEST_ONLY.has(to.name as string)) {
    return { name: 'projects' };
  }

  if (to.meta.requiresAuth && !auth.accessToken) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  return true;
});

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('../pages/Home.vue') },

  // Auth (US1)
  { path: '/signup', name: 'signup', component: () => import('../pages/auth/Signup.vue') },
  { path: '/login', name: 'login', component: () => import('../pages/auth/Login.vue') },
  { path: '/verify', name: 'verify', component: () => import('../pages/auth/Verify.vue') },

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

  // 404 fallback
  { path: '/:pathMatch(.*)*', component: () => import('../pages/NotFound.vue') },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    if (!auth.accessToken) {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  return true;
});

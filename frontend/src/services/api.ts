import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

// 백엔드와의 단일 통로. 운영에서는 동일 origin(/api/v1), 개발에서는 Vite proxy가 9538로 전달.

interface OkEnvelope<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  code: string;
  status: number;
  title: string;
  detail?: string;
  details?: Record<string, unknown>;
  instance?: string;
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL: BASE,
  withCredentials: true,
  timeout: 30_000,
});

// --- request interceptor: 인증 토큰 자동 첨부
api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const token = readAccessToken();
  if (token && cfg.headers) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// 인증 관련 엔드포인트는 401 자동 갱신 대상에서 제외(무한 루프 방지)
function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/refresh') ||
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/logout')
  );
}

// 동시 401 발생 시 refresh 를 한 번만 수행하기 위한 공유 프로미스
let refreshPromise: Promise<string> | null = null;

export async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    // 인터셉터 재귀를 피하기 위해 기본 axios 로 호출(쿠키의 refresh 토큰 사용)
    refreshPromise = axios
      .post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data?.data?.accessToken as string | undefined;
        if (!token) throw new Error('no access token in refresh response');
        writeAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// --- response interceptor: envelope 언래핑 + 401 자동 토큰 갱신 + RFC 7807 에러 → ApiError
api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && body.ok === true && 'data' in body) {
      // 데이터만 반환 — 호출부는 res.data 가 곧 payload
      res.data = (body as OkEnvelope<unknown>).data;
    }
    return res;
  },
  async (err: AxiosError) => {
    const status = err.response?.status ?? 0;
    const original = err.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // 액세스 토큰 만료(401) → refresh 로 재발급 후 1회 재시도
    if (status === 401 && original && !original._retry && !isAuthEndpoint(original.url)) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        if (original.headers) original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        // refresh 실패(세션 만료) → 토큰 정리 후 로그인으로
        writeAccessToken(null);
        sessionStorage.removeItem('auth');
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.assign(`/login?redirect=${redirect}`);
        }
      }
    }

    const body = err.response?.data as
      | { code?: string; title?: string; detail?: string; details?: Record<string, unknown>; instance?: string }
      | undefined;
    const apiErr: ApiError = {
      code: body?.code ?? 'NETWORK',
      status,
      title: body?.title ?? err.message,
      detail: body?.detail,
      details: body?.details,
      instance: body?.instance,
    };
    return Promise.reject(apiErr);
  },
);

// --- token storage (auth 스토어에서 동기화. 여기서는 직접 의존성 없이 sessionStorage 백업)
const TOKEN_KEY = 'uniteam.accessToken';
export function readAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function writeAccessToken(token: string | null): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

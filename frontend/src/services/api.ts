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

// --- response interceptor: envelope 언래핑 + RFC 7807 에러 → ApiError
api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && body.ok === true && 'data' in body) {
      // 데이터만 반환 — 호출부는 res.data 가 곧 payload
      res.data = (body as OkEnvelope<unknown>).data;
    }
    return res;
  },
  (err: AxiosError) => {
    const status = err.response?.status ?? 0;
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

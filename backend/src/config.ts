import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: int('PORT', 9538),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'https://p18.sumzip.com',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:9518',
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:9538',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  db: {
    host: process.env.DB_HOST ?? 'mariadb',
    port: int('DB_PORT', 3306),
    user: process.env.DB_USER ?? 'uniteam',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'uniteam',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '14d',
  },

  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:9518,https://p18.sumzip.com')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  smtp: {
    host: process.env.SMTP_HOST ?? 'mailhog',
    port: int('SMTP_PORT', 1025),
    from: process.env.SMTP_FROM ?? 'no-reply@p18.sumzip.com',
  },

  oauthRedirectBase:
    process.env.OAUTH_REDIRECT_BASE ?? 'https://p18.sumzip.com/api/v1/integrations',
} as const;

// 운영 환경에서 dev secret 사용 방지
if (config.env === 'production') {
  if (config.jwt.accessSecret.startsWith('dev-') || config.jwt.refreshSecret.startsWith('dev-')) {
    throw new Error('Production must override JWT_ACCESS_SECRET and JWT_REFRESH_SECRET');
  }
  required('DB_PASSWORD');
}

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

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
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

  // 채팅 첨부(파일·사진) 저장 — 로컬 디스크. 운영에선 UPLOAD_DIR 을 영속 볼륨으로 마운트.
  uploads: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxBytes: int('UPLOAD_MAX_BYTES', 20 * 1024 * 1024), // 파일당 20MB
    maxFiles: int('UPLOAD_MAX_FILES', 10), // 한 번에 최대 10개
  },

  smtp: {
    host: process.env.SMTP_HOST ?? 'mailhog',
    port: int('SMTP_PORT', 1025),
    from: process.env.SMTP_FROM ?? 'no-reply@p18.sumzip.com',
    // 인증이 필요한 운영 SMTP(예: SES·SendGrid·Gmail)일 때 설정. 비우면 MailHog 등 무인증 SMTP로 간주.
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    // 465(SMTPS)면 true, 587/1025(STARTTLS·평문)면 false 기본.
    secure: bool('SMTP_SECURE', int('SMTP_PORT', 1025) === 465),
  },

  oauthRedirectBase:
    process.env.OAUTH_REDIRECT_BASE ?? 'https://p18.sumzip.com/api/v1/integrations',

  // 평가 리뷰 악성 탐지(하이브리드: 규칙기반 항상 + LLM 2차 판정은 키 있을 때만)
  moderation: {
    // LLM 2차 판정 사용 여부. true 이고 ANTHROPIC_API_KEY 가 있을 때만 Claude 호출.
    llmEnabled: bool('MODERATION_LLM_ENABLED', false),
    llmModel: process.env.MODERATION_LLM_MODEL ?? 'claude-opus-4-8',
    hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    // 허위/보복성 별점 탐지: 다른 평가자 평균 대비 이 값 이상 낮으면 의심(검토 큐).
    anomalyDeltaThreshold: Number(process.env.MODERATION_ANOMALY_DELTA ?? '2.0'),
    // 합의(다른 평가자) 최소 인원 — 이보다 적으면 이상치 판단 보류.
    anomalyMinPeers: int('MODERATION_ANOMALY_MIN_PEERS', 2),
  },
} as const;

// 운영 환경에서 dev secret 사용 방지
if (config.env === 'production') {
  if (config.jwt.accessSecret.startsWith('dev-') || config.jwt.refreshSecret.startsWith('dev-')) {
    throw new Error('Production must override JWT_ACCESS_SECRET and JWT_REFRESH_SECRET');
  }
  required('DB_PASSWORD');
}

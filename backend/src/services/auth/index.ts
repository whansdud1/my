import bcrypt from 'bcrypt';
import { Errors } from '../../lib/envelope.js';
import * as Users from '../../repositories/users.js';
import * as Consents from '../../repositories/consents.js';
import { signAccess, issueRefresh, hashRefresh } from './tokens.js';
import { getPool } from '../../db/connection.js';
import { audit } from '../audit.js';
import { logger } from '../../lib/logger.js';

const BCRYPT_ROUNDS = 12;

export function extractDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) throw Errors.Validation('이메일 형식이 올바르지 않습니다');
  return email.slice(at + 1).toLowerCase();
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  consents: Consents.ConsentType[];
  ip?: string;
}

export async function signup(input: SignupInput): Promise<{ userId: number }> {
  const email = input.email.trim().toLowerCase();
  // extractDomain은 '@' 누락 등 기본 형식 오류를 함께 걸러낸다(라우터 zod .email()과 이중 방어).
  // 도메인 화이트리스트 제한은 제거 — 네이버/지메일/다음 등 형식이 유효한 모든 이메일 허용.
  const domain = extractDomain(email);

  // 중복 검사
  const existing = await Users.findByEmail(email);
  if (existing) throw Errors.Conflict('이미 가입된 이메일입니다');

  // 필수 동의 검증
  const required: Consents.ConsentType[] = ['TOS', 'PRIVACY'];
  for (const r of required) {
    if (!input.consents.includes(r)) {
      throw Errors.Validation(`필수 동의(${r})가 누락되었습니다`);
    }
  }

  const passwordHash = await hashPassword(input.password);

  // 이메일 인증 절차 제거 — 토큰 발급/메일 발송 없이 즉시 활성 사용자로 생성.
  const userId = await Users.insert({
    email,
    emailDomain: domain,
    passwordHash,
    name: input.name.trim(),
  });

  await Consents.record(userId, input.consents);
  await Users.updateProfile(userId, {}); // 기본 빈 프로필 보장(no-op이지만 호출 의도 명시)

  // 평점 초기화 (기존에는 이메일 인증 완료 시점에 수행하던 것을 가입 시점으로 이동)
  await getPool().query(
    `INSERT IGNORE INTO ratings (user_id, stars, evaluation_count) VALUES (?, 0.00, 0)`,
    [userId],
  );

  await audit({
    actorId: userId,
    action: 'USER_SIGNUP',
    targetType: 'user',
    targetId: userId,
    ip: input.ip,
    meta: { domain },
  });

  logger.info({ userId, email, domain }, 'user signup');
  return { userId };
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}

export async function login(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const user = await Users.findByEmail(email);
  if (!user) throw Errors.Unauthorized('이메일 또는 비밀번호가 올바르지 않습니다');
  if (user.status === 'DELETED') throw Errors.Unauthorized('탈퇴 처리된 계정입니다');
  if (user.status === 'SUSPENDED') throw Errors.Forbidden('이용 정지된 계정입니다');

  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) {
    await audit({ actorId: user.id, action: 'LOGIN_FAIL', ip: input.ip });
    throw Errors.Unauthorized('이메일 또는 비밀번호가 올바르지 않습니다');
  }

  // 필수 동의 보유 확인 (R5)
  const hasConsents = await Consents.hasRequired(user.id);
  if (!hasConsents) throw Errors.Forbidden('필수 동의 항목을 갱신해주세요');

  const accessToken = signAccess({ id: user.id, email: user.email, role: user.role_user });
  const refreshToken = await issueRefresh(user.id, { userAgent: input.userAgent, ip: input.ip });

  await audit({ actorId: user.id, action: 'LOGIN_OK', ip: input.ip });

  return {
    accessToken,
    refreshToken,
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role_user,
      emailVerified: !!user.email_verified_at,
    },
  };
}

export async function logout(refreshTokenRaw: string | undefined): Promise<void> {
  if (!refreshTokenRaw) return;
  // refresh 토큰 폐기 — hashRefresh로 비교 후 revoke
  const pool = getPool();
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE token_hash = ? AND revoked_at IS NULL`,
    [hashRefresh(refreshTokenRaw)],
  );
}

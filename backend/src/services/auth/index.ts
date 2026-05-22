import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { Errors } from '../../lib/envelope.js';
import { config } from '../../config.js';
import * as Users from '../../repositories/users.js';
import * as Consents from '../../repositories/consents.js';
import { getEmailAdapter, renderVerifyEmail } from '../../adapters/email/index.js';
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

export async function signup(input: SignupInput): Promise<{ userId: number; verifyUrl: string }> {
  const email = input.email.trim().toLowerCase();
  const domain = extractDomain(email);

  // 화이트리스트 검증 (WA-02: .ac.kr 등)
  const allowed = await Users.isDomainAllowed(domain);
  if (!allowed) {
    throw Errors.Validation('지원되지 않는 이메일 도메인입니다', { domain });
  }

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
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const userId = await Users.insert({
    email,
    emailDomain: domain,
    passwordHash,
    name: input.name.trim(),
    emailVerifyToken: verifyToken,
    emailVerifyExpiresAt: verifyExpires,
  });

  await Consents.record(userId, input.consents);
  await Users.updateProfile(userId, {}); // 기본 빈 프로필 보장(no-op이지만 호출 의도 명시)

  const verifyUrl = `${config.publicBaseUrl}/verify?token=${verifyToken}`;
  const msg = renderVerifyEmail({ name: input.name, verifyUrl });
  msg.to = email;
  await getEmailAdapter().send(msg);

  await audit({
    actorId: userId,
    action: 'USER_SIGNUP',
    targetType: 'user',
    targetId: userId,
    ip: input.ip,
    meta: { domain },
  });

  logger.info({ userId, email, domain }, 'user signup');
  return { userId, verifyUrl };
}

export async function verifyEmail(token: string): Promise<{ userId: number }> {
  const user = await Users.markEmailVerified(token);
  if (!user) throw Errors.Validation('유효하지 않거나 만료된 인증 링크입니다');

  // 평점 초기화
  await getPool().query(
    `INSERT IGNORE INTO ratings (user_id, stars, evaluation_count) VALUES (?, 0.00, 0)`,
    [user.id],
  );
  await audit({ actorId: user.id, action: 'EMAIL_VERIFIED', targetType: 'user', targetId: user.id });
  return { userId: user.id };
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
  if (!user.email_verified_at) throw Errors.Forbidden('이메일 인증을 완료해주세요');

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

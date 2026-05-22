import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { getPool } from '../../db/connection.js';
import { Errors } from '../../lib/envelope.js';

export interface AccessPayload {
  sub: string;             // user id (string)
  role: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
  email: string;
  type: 'access';
}

export interface RefreshPayload {
  sub: string;
  jti: string;             // refresh_tokens.id (string)
  type: 'refresh';
}

export function signAccess(user: { id: number | string; email: string; role: AccessPayload['role'] }): string {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role, type: 'access' } satisfies AccessPayload,
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl } as SignOptions,
  );
}

export function signRefresh(userId: number | string, jti: string): string {
  return jwt.sign(
    { sub: String(userId), jti, type: 'refresh' } satisfies RefreshPayload,
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl } as SignOptions,
  );
}

export function verifyAccess(token: string): AccessPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret) as AccessPayload;
    if (decoded.type !== 'access') throw Errors.Unauthorized('잘못된 토큰 종류');
    return decoded;
  } catch {
    throw Errors.Unauthorized('토큰이 만료되었거나 유효하지 않습니다');
  }
}

export function verifyRefresh(token: string): RefreshPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.refreshSecret) as RefreshPayload;
    if (decoded.type !== 'refresh') throw Errors.Unauthorized('잘못된 토큰 종류');
    return decoded;
  } catch {
    throw Errors.Unauthorized('Refresh 토큰이 만료되었거나 유효하지 않습니다');
  }
}

export function hashRefresh(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// refresh 토큰을 DB에 등록하고 raw 토큰을 반환
export async function issueRefresh(userId: number, opts: { userAgent?: string; ip?: string } = {}): Promise<string> {
  const pool = getPool();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  // 임시 row 생성 → id로 jti 사용
  const [insertRes] = (await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)`,
    [userId, 'pending', expiresAt, opts.userAgent ?? null, opts.ip ?? null],
  )) as unknown as [{ insertId: number }];
  const jti = String(insertRes.insertId);
  const raw = signRefresh(userId, jti);
  await pool.query(`UPDATE refresh_tokens SET token_hash = ? WHERE id = ?`, [hashRefresh(raw), insertRes.insertId]);
  return raw;
}

// refresh 회전: 기존 토큰 폐기 + 새 토큰 발급. 재사용 감지 시 전체 폐기.
export async function rotateRefresh(rawIncoming: string): Promise<{ accessToken: string; refreshToken: string; user: { id: number; email: string; role: AccessPayload['role'] } }> {
  const decoded = verifyRefresh(rawIncoming);
  const pool = getPool();
  const hash = hashRefresh(rawIncoming);
  const [rows] = (await pool.query(
    `SELECT id, user_id, revoked_at, expires_at FROM refresh_tokens WHERE id = ? AND token_hash = ?`,
    [Number(decoded.jti), hash],
  )) as unknown as [Array<{ id: number; user_id: number; revoked_at: Date | null; expires_at: Date }>];

  const row = rows[0];
  if (!row) {
    // 토큰 hash가 다르거나 row 없음 — 재사용 의심 시 해당 사용자 모든 토큰 폐기
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE user_id = ? AND revoked_at IS NULL`,
      [Number(decoded.sub)],
    );
    throw Errors.Unauthorized('Refresh 토큰 재사용 감지 — 다시 로그인해주세요');
  }
  if (row.revoked_at || row.expires_at.getTime() < Date.now()) {
    throw Errors.Unauthorized('Refresh 토큰이 만료되었습니다');
  }

  const [userRows] = (await pool.query(
    `SELECT id, email, role_user FROM users WHERE id = ? AND status = 'ACTIVE'`,
    [row.user_id],
  )) as unknown as [Array<{ id: number; email: string; role_user: AccessPayload['role'] }>];
  const user = userRows[0];
  if (!user) throw Errors.Unauthorized('계정이 비활성화 상태입니다');

  // 새 토큰 발급
  const newRefresh = await issueRefresh(user.id);
  const newJti = Number(verifyRefresh(newRefresh).jti);

  // 기존 토큰 폐기 + replaced_by
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW(3), replaced_by = ? WHERE id = ?`,
    [newJti, row.id],
  );

  const accessToken = signAccess({ id: user.id, email: user.email, role: user.role_user });
  return { accessToken, refreshToken: newRefresh, user: { id: user.id, email: user.email, role: user.role_user } };
}

export async function revokeRefresh(raw: string): Promise<void> {
  try {
    const decoded = verifyRefresh(raw);
    const pool = getPool();
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW(3) WHERE id = ? AND revoked_at IS NULL`,
      [Number(decoded.jti)],
    );
  } catch {
    /* 이미 만료/유효하지 않음 — idempotent */
  }
}

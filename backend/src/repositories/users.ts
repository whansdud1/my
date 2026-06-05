import { getPool } from '../db/connection.js';

export interface UserRow {
  id: number;
  email: string;
  email_domain: string;
  email_verified_at: Date | null;
  email_verify_token: string | null;
  email_verify_expires_at: Date | null;
  password_hash: string;
  name: string;
  gender: 'M' | 'F' | 'OTHER' | 'UNSPEC';
  grade: number | null;
  department: string | null;
  university: string | null;
  preferred_roles: string[];
  collaboration_style: Record<string, unknown>;
  self_intro: string | null;
  role_user: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
  trust_score: string;     // DECIMAL → string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  created_at: Date;
  updated_at: Date;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const [rows] = (await getPool().query(
    `SELECT * FROM users WHERE email = ? LIMIT 1`,
    [email],
  )) as unknown as [UserRow[]];
  return rows[0] ?? null;
}

export async function findById(id: number): Promise<UserRow | null> {
  const [rows] = (await getPool().query(
    `SELECT * FROM users WHERE id = ? LIMIT 1`,
    [id],
  )) as unknown as [UserRow[]];
  return rows[0] ?? null;
}

export interface InsertUser {
  email: string;
  emailDomain: string;
  passwordHash: string;
  name: string;
  role?: 'STUDENT' | 'PROFESSOR' | 'ADMIN';
}

export async function insert(u: InsertUser): Promise<number> {
  // 이메일 인증 절차 제거 — 가입 즉시 인증완료(email_verified_at) & ACTIVE 상태로 생성.
  const [res] = (await getPool().query(
    `INSERT INTO users
       (email, email_domain, password_hash, name, email_verified_at,
        preferred_roles, collaboration_style, role_user, status)
     VALUES (?, ?, ?, ?, NOW(3), JSON_ARRAY(), JSON_OBJECT(), ?, 'ACTIVE')`,
    [
      u.email,
      u.emailDomain,
      u.passwordHash,
      u.name,
      u.role ?? 'STUDENT',
    ],
  )) as unknown as [{ insertId: number }];
  return res.insertId;
}

export interface UpdateProfile {
  name?: string;
  gender?: 'M' | 'F' | 'OTHER' | 'UNSPEC';
  grade?: number | null;
  department?: string | null;
  university?: string | null;
  preferredRoles?: string[];
  collaborationStyle?: Record<string, unknown>;
  selfIntro?: string | null;
}

export async function updateProfile(id: number, p: UpdateProfile): Promise<void> {
  const fields: string[] = [];
  const params: unknown[] = [];
  const map: Array<[keyof UpdateProfile, string]> = [
    ['name', 'name'],
    ['gender', 'gender'],
    ['grade', 'grade'],
    ['department', 'department'],
    ['university', 'university'],
    ['selfIntro', 'self_intro'],
  ];
  for (const [k, col] of map) {
    if (p[k] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(p[k]);
    }
  }
  if (p.preferredRoles !== undefined) {
    fields.push(`preferred_roles = CAST(? AS JSON)`);
    params.push(JSON.stringify(p.preferredRoles));
  }
  if (p.collaborationStyle !== undefined) {
    fields.push(`collaboration_style = CAST(? AS JSON)`);
    params.push(JSON.stringify(p.collaborationStyle));
  }
  if (fields.length === 0) return;
  params.push(id);
  await getPool().query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
}

export async function softDelete(id: number): Promise<void> {
  // PII 익명화 — 평가 통계는 evaluations 테이블에 그대로 보존
  await getPool().query(
    `UPDATE users SET
       status = 'DELETED',
       deleted_at = NOW(3),
       email = CONCAT('deleted-', id, '@anonymized.local'),
       name = '탈퇴한 사용자',
       password_hash = '',
       self_intro = NULL,
       department = NULL,
       university = NULL,
       preferred_roles = JSON_ARRAY(),
       collaboration_style = JSON_OBJECT()
     WHERE id = ?`,
    [id],
  );
}

export async function isDomainAllowed(domain: string): Promise<boolean> {
  // 정확 일치 또는 suffix 일치 — 예: 'sogang.ac.kr' 은 'ac.kr' suffix로 통과
  const [rows] = (await getPool().query(
    `SELECT 1 FROM domain_whitelist WHERE enabled = TRUE AND (? = domain OR ? LIKE CONCAT('%.', domain)) LIMIT 1`,
    [domain, domain],
  )) as unknown as [unknown[]];
  return rows.length > 0;
}

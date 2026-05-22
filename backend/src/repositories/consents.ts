import { getPool } from '../db/connection.js';

export type ConsentType = 'TOS' | 'PRIVACY' | 'COLLAB_METADATA' | 'MARKETING' | 'BODY_NLP';
export const REQUIRED_CONSENTS: ConsentType[] = ['TOS', 'PRIVACY'];
export const CURRENT_CONSENT_VERSION = '2026-05-15';

export interface ConsentRow {
  consent_type: ConsentType;
  version: string;
  accepted_at: Date;
  revoked_at: Date | null;
}

export async function record(userId: number, types: ConsentType[], version = CURRENT_CONSENT_VERSION): Promise<void> {
  if (types.length === 0) return;
  const values = types.map(() => '(?, ?, ?)').join(', ');
  const params = types.flatMap((t) => [userId, t, version]);
  await getPool().query(
    `INSERT INTO consents (user_id, consent_type, version) VALUES ${values}`,
    params,
  );
}

export async function listByUser(userId: number): Promise<ConsentRow[]> {
  const [rows] = (await getPool().query(
    `SELECT consent_type, version, accepted_at, revoked_at
       FROM consents WHERE user_id = ? ORDER BY accepted_at DESC`,
    [userId],
  )) as unknown as [ConsentRow[]];
  return rows;
}

// 필수 동의(TOS, PRIVACY) 모두 유효한지 확인 (R5)
export async function hasRequired(userId: number): Promise<boolean> {
  const [rows] = (await getPool().query(
    `SELECT consent_type FROM consents
        WHERE user_id = ? AND consent_type IN ('TOS','PRIVACY') AND revoked_at IS NULL`,
    [userId],
  )) as unknown as [Array<{ consent_type: ConsentType }>];
  const types = new Set(rows.map((r) => r.consent_type));
  return REQUIRED_CONSENTS.every((t) => types.has(t));
}

export async function revoke(userId: number, type: ConsentType): Promise<void> {
  await getPool().query(
    `UPDATE consents SET revoked_at = NOW(3)
        WHERE user_id = ? AND consent_type = ? AND revoked_at IS NULL`,
    [userId, type],
  );
}

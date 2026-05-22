import { getPool } from '../db/connection.js';
import { logger } from '../lib/logger.js';

export interface AuditEntry {
  actorId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

// IPv4/IPv6 → VARBINARY(16)
function ipToBuffer(ip?: string | null): Buffer | null {
  if (!ip) return null;
  // IPv4-mapped IPv6 처리 (::ffff:192.168.0.1)
  const clean = ip.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
    return Buffer.from(clean.split('.').map((p) => Number(p)));
  }
  // 단순 처리 — IPv6 전체 파싱은 운영에서 ip-address 라이브러리로 보강 권장
  return Buffer.from(clean.padEnd(16, '\0').slice(0, 16));
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, ip, meta)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.actorId ?? null,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        ipToBuffer(entry.ip ?? null),
        entry.meta ? JSON.stringify(entry.meta) : null,
      ],
    );
  } catch (err) {
    // 감사 로그 실패는 비즈니스 흐름을 막지 않음 — 로깅만
    logger.error({ err, entry }, 'audit log write failed');
  }
}

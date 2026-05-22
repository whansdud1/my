// T008 — mysql2 풀 + 헬스 체크 핑
//
// knex 도 같은 자격증명으로 연결되며 (knexfile.ts), 마이그레이션·시드를 담당.
// 런타임 쿼리는 가급적 knex 빌더를 사용해 SQL 인젝션을 회피한다.

import mysql, { type Pool } from 'mysql2/promise';
import { config } from '../config.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    timezone: 'Z',
    dateStrings: false,
  });
  return pool;
}

export async function ping(): Promise<{ host: string; latencyMs: number }> {
  const start = Date.now();
  const conn = await getPool().getConnection();
  try {
    await conn.query('SELECT 1');
    return { host: config.db.host, latencyMs: Date.now() - start };
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

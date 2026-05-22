import { getPool } from '../db/connection.js';

export interface SlotInput {
  weekday: number;     // 0=일 .. 6=토
  startMin: number;
  endMin: number;
  prefNight?: boolean;
}

export interface SlotRow {
  weekday: number;
  startMin: number;
  endMin: number;
  prefNight: boolean;
}

export async function listByUser(userId: number): Promise<SlotRow[]> {
  const [rows] = (await getPool().query(
    `SELECT weekday, start_min AS startMin, end_min AS endMin, pref_night AS prefNight
       FROM availabilities WHERE user_id = ? ORDER BY weekday, start_min`,
    [userId],
  )) as unknown as [Array<{ weekday: number; startMin: number; endMin: number; prefNight: number }>];
  return rows.map((r) => ({ ...r, prefNight: Boolean(r.prefNight) }));
}

// bulkReplace — 트랜잭션으로 기존 슬롯 삭제 + 새로 삽입
export async function bulkReplace(userId: number, slots: SlotInput[]): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM availabilities WHERE user_id = ?`, [userId]);
    if (slots.length > 0) {
      const values = slots.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = slots.flatMap((s) => [
        userId,
        s.weekday,
        s.startMin,
        s.endMin,
        s.prefNight ? 1 : 0,
      ]);
      await conn.query(
        `INSERT INTO availabilities (user_id, weekday, start_min, end_min, pref_night) VALUES ${values}`,
        params,
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

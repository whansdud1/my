/* 자동 팀 편성 통합 검증 — 실제 DB에 대고 composeTeam 을 실행한다.
 *   A) 실제 RECRUIT 프로젝트 preview(읽기전용)
 *   B) 역할 선호가 일치하는 통제 시나리오 → preview + commit(초대 생성) → 정리
 *   C) 정원이 가득 찬 프로젝트 → Conflict 발생 확인
 * 실행: npx tsx scripts/verify-compose.ts
 */
import { getPool } from '../src/db/connection.js';
import { composeTeam } from '../src/services/matching/compose.js';

const TAG = 'zztest_compose';
let pass = 0;
let fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${msg}`);
  } else {
    fail++;
    console.log(`  ❌ ${msg}`);
  }
}

async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = (await getPool().query(sql, params)) as unknown as [T[]];
  return rows;
}

async function cleanup() {
  // 태그된 임시 데이터 제거 (자식→부모 순서)
  const projs = await q<{ id: number }>(`SELECT id FROM projects WHERE title LIKE ?`, [`${TAG}%`]);
  for (const p of projs) {
    await q(`DELETE FROM matching_recommendations WHERE project_id = ?`, [p.id]);
    await q(`DELETE FROM project_members WHERE project_id = ?`, [p.id]);
  }
  await q(`DELETE FROM projects WHERE title LIKE ?`, [`${TAG}%`]);
  await q(
    `DELETE FROM notifications WHERE recipient_id IN (SELECT id FROM users WHERE email LIKE ?)`,
    [`${TAG}%`],
  );
  await q(`DELETE FROM project_members WHERE user_id IN (SELECT id FROM users WHERE email LIKE ?)`, [
    `${TAG}%`,
  ]);
  await q(`DELETE FROM users WHERE email LIKE ?`, [`${TAG}%`]);
}

async function makeUser(emailKey: string, name: string, roles: string[]): Promise<number> {
  const style = JSON.stringify({ axes: { planning: 3, communication: 3, adaptability: 3, rigor: 3 } });
  const res = (await q<any>(
    `INSERT INTO users (email, email_domain, password_hash, name, preferred_roles, collaboration_style, role_user, status, trust_score)
     VALUES (?, 'test.ac.kr', 'x', ?, CAST(? AS JSON), CAST(? AS JSON), 'STUDENT', 'ACTIVE', 60)`,
    [`${TAG}_${emailKey}@test.ac.kr`, name, JSON.stringify(roles), style],
  )) as any;
  return (res as any).insertId;
}

async function main() {
  console.log('\n=== 자동 팀 편성 검증 시작 ===\n');
  await cleanup(); // 이전 잔여 정리

  // ---------- A) 실제 프로젝트 preview ----------
  console.log('[A] 실제 RECRUIT 프로젝트 preview (읽기전용)');
  for (const pid of [9, 13, 4]) {
    const proj = (await q<any>(`SELECT owner_id, target_size FROM projects WHERE id = ?`, [pid]))[0];
    if (!proj) {
      console.log(`  (프로젝트 ${pid} 없음 — 건너뜀)`);
      continue;
    }
    const r = await composeTeam(pid, { commit: false, inviterId: proj.owner_id });
    const ids = r.picks.map((p) => p.userId);
    const occupants = await q<{ user_id: number }>(
      `SELECT user_id FROM project_members WHERE project_id = ? AND state IN ('ACCEPTED','INVITED')`,
      [pid],
    );
    const occSet = new Set(occupants.map((o) => String(o.user_id)));
    console.log(
      `  P${pid}: 정원 ${r.targetSize}, ACCEPTED ${r.acceptedCount}, 빈자리 ${r.openSlots}, 제안 ${r.picks.length}명, 평균적합도 ${r.teamFitAvg}`,
    );
    console.log(
      `       배정: ${r.picks.map((p) => `${p.role}<-${p.name}(${p.matchScore}${p.roleMatched ? '' : ',역할불일치'})`).join(', ') || '없음'}`,
    );
    if (r.unfilledRoles.length) console.log(`       미충원: ${JSON.stringify(r.unfilledRoles)}`);
    check(r.picks.length <= r.openSlots, `P${pid} 제안 인원(${r.picks.length}) ≤ 빈자리(${r.openSlots})`);
    check(new Set(ids).size === ids.length, `P${pid} 후보 중복 없음`);
    check(ids.every((u) => !occSet.has(u)), `P${pid} 기존 점유자 미포함`);
    check(!r.committed, `P${pid} preview 는 DB 변경 없음(committed=false)`);
  }

  // ---------- B) 역할 일치 통제 시나리오 ----------
  console.log('\n[B] 역할 선호 일치 시나리오 (1차 배정 + commit)');
  const owner = await makeUser('owner', `${TAG}_owner`, ['기획']);
  // 실데이터에 없는 고유 역할 토큰 — 이 역할은 오직 임시 후보만 선호
  const RD = 'ZZROLE_DESIGN';
  const RV = 'ZZROLE_DEV';
  const candDesign = await makeUser('cand_design', `${TAG}_디자이너`, [RD]);
  const candDev = await makeUser('cand_dev', `${TAG}_개발자`, [RV]);
  const candPlanner = await makeUser('cand_plan', `${TAG}_기획자`, ['기획']); // 채워진 역할 → 선택 안돼야 함

  const requiredRoles = JSON.stringify([
    { role: '기획', count: 1 },
    { role: RD, count: 1 },
    { role: RV, count: 1 },
  ]);
  const projRes = (await q<any>(
    `INSERT INTO projects (owner_id, title, description, type, required_roles, target_size, status)
     VALUES (?, ?, '검증용', 'CLASS', CAST(? AS JSON), 3, 'RECRUIT')`,
    [owner, `${TAG}_project`, requiredRoles],
  )) as any;
  const projId = (projRes as any).insertId;
  // 소유자를 기획 역할로 ACCEPTED 등록 → 기획 슬롯은 채워짐, 빈자리 2 (RD, RV)
  await q(
    `INSERT INTO project_members (project_id, user_id, role, state, joined_at) VALUES (?, ?, '기획', 'ACCEPTED', NOW(3))`,
    [projId, owner],
  );

  const prev = await composeTeam(projId, { commit: false, inviterId: owner });
  console.log(
    `  preview: 빈자리 ${prev.openSlots}, 제안 ${prev.picks.length}명 → ${prev.picks.map((p) => `${p.role}<-${p.name}`).join(', ')}`,
  );
  const byRole = Object.fromEntries(prev.picks.map((p) => [p.role, p]));
  check(prev.openSlots === 2, '빈자리 = 2 (기획 1명 ACCEPTED 반영)');
  check(prev.picks.length === 2, '제안 2명');
  check(byRole[RD]?.userId === String(candDesign), `${RD} → 디자이너 후보 배정`);
  check(byRole[RV]?.userId === String(candDev), `${RV} → 개발자 후보 배정`);
  check(byRole[RD]?.roleMatched === true && byRole[RV]?.roleMatched === true, '두 후보 모두 roleMatched=true');
  check(!prev.picks.some((p) => p.userId === String(candPlanner)), '이미 채워진 역할(기획) 후보는 미선택');

  // commit → 초대 생성 확인
  const com = await composeTeam(projId, { commit: true, inviterId: owner });
  const invitedOk = (com.invited ?? []).filter((i) => i.ok).length;
  const dbInvites = await q<{ user_id: number; role: string; state: string }>(
    `SELECT user_id, role, state FROM project_members WHERE project_id = ? AND state = 'INVITED'`,
    [projId],
  );
  console.log(`  commit: 초대성공 ${invitedOk}명, DB INVITED 행 ${dbInvites.length}개`);
  check(com.committed === true, 'commit 결과 committed=true');
  check(invitedOk === 2, '초대 2건 성공');
  check(dbInvites.length === 2, 'DB에 INVITED 멤버 2명 생성');
  check(
    dbInvites.some((d) => d.user_id === candDesign && d.role === RD) &&
      dbInvites.some((d) => d.user_id === candDev && d.role === RV),
    'DB 초대의 역할이 배정과 일치',
  );

  // 다시 preview → 이미 INVITED 가 점유 → 빈자리 0 → Conflict
  let conflictAfterCommit = false;
  try {
    await composeTeam(projId, { commit: false, inviterId: owner });
  } catch (e) {
    conflictAfterCommit = /빈 자리/.test((e as any).detail ?? (e as Error).message);
  }
  check(conflictAfterCommit, 'commit 후 재편성 시 빈자리 없음 → 거부');

  // ---------- C) 정원 만석 프로젝트 Conflict ----------
  console.log('\n[C] 정원이 가득 찬 프로젝트는 Conflict');
  const full = (
    await q<any>(
      `SELECT p.id FROM projects p
        WHERE (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id AND m.state IN('ACCEPTED','INVITED')) >= p.target_size
          AND p.status IN ('RECRUIT','RUNNING') AND p.title NOT LIKE ? LIMIT 1`,
      [`${TAG}%`],
    )
  )[0];
  if (full) {
    let threw = false;
    try {
      await composeTeam(full.id, { commit: false, inviterId: 1 });
    } catch (e) {
      threw = /빈 자리/.test((e as any).detail ?? (e as Error).message);
    }
    check(threw, `만석 프로젝트(P${full.id}) 편성 거부`);
  } else {
    console.log('  (만석 프로젝트 없음 — 건너뜀)');
  }

  // 정리
  await cleanup();
  console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===\n`);
  await getPool().end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('검증 스크립트 오류:', e);
  try {
    await cleanup();
    await getPool().end();
  } catch {
    /* noop */
  }
  process.exit(1);
});

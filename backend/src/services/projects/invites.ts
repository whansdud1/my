import { Errors } from '../../lib/envelope.js';
import * as Projects from '../../repositories/projects.js';
import * as Members from '../../repositories/projectMembers.js';
import * as Users from '../../repositories/users.js';
import { getPool } from '../../db/connection.js';
import { audit } from '../audit.js';

const MAX_ACTIVE_PROJECTS = 3; // FR-B6

export interface InviteInput {
  projectId: number;
  inviterId: number;
  invitedUserId?: number;
  invitedEmail?: string;
  role: string;
}

export async function sendInvite(input: InviteInput): Promise<{ memberId: number; userId: number }> {
  const project = await Projects.findById(input.projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.status !== 'RECRUIT' && project.status !== 'RUNNING') {
    throw Errors.Validation('초대 가능한 상태가 아닙니다');
  }

  // 본인 확인
  let invitedUserId = input.invitedUserId;
  if (!invitedUserId && input.invitedEmail) {
    const u = await Users.findByEmail(input.invitedEmail);
    if (!u) throw Errors.NotFound('가입되지 않은 사용자입니다 — 메일 초대(사전 가입)는 추후 지원');
    invitedUserId = u.id;
  }
  if (!invitedUserId) throw Errors.Validation('invitedUserId 또는 invitedEmail 필요');

  if (invitedUserId === input.inviterId) throw Errors.Validation('본인을 초대할 수 없습니다');

  // 중복 초대 방지
  const existing = await Members.findOne(input.projectId, invitedUserId);
  if (existing && (existing.state === 'INVITED' || existing.state === 'ACCEPTED')) {
    throw Errors.Conflict('이미 초대되었거나 참여 중인 사용자입니다');
  }

  // FR-B6 동시 진행 한도
  const active = await Members.countActiveByUser(invitedUserId);
  if (active >= MAX_ACTIVE_PROJECTS) {
    throw Errors.Conflict(`대상 사용자가 이미 ${MAX_ACTIVE_PROJECTS}개의 프로젝트에 참여 중입니다`);
  }

  // 정원 초과 방지(이미 ACCEPTED + INVITED 가 target_size 이상이면 제한)
  const memberRows = await Members.findByProject(input.projectId);
  const active1 = memberRows.filter((m) => m.state === 'ACCEPTED' || m.state === 'INVITED').length;
  if (active1 >= project.target_size) {
    throw Errors.Conflict('이미 정원이 찼습니다');
  }

  const memberId = await Members.invite(input.projectId, invitedUserId, input.role, input.inviterId);

  await audit({
    actorId: input.inviterId,
    action: 'PROJECT_INVITE',
    targetType: 'project_member',
    targetId: memberId,
    meta: { projectId: input.projectId, invitedUserId },
  });

  // 알림 적재 (이메일 전송은 후속 잡)
  await getPool().query(
    `INSERT INTO notifications (user_id, type, body)
     VALUES (?, 'INVITE', CAST(? AS JSON))`,
    [invitedUserId, JSON.stringify({ projectId: input.projectId, projectTitle: project.title, memberId })],
  );

  return { memberId, userId: invitedUserId };
}

export async function respond(memberId: number, userId: number, accept: boolean): Promise<{ state: Members.MemberState }> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = (await conn.query(
      `SELECT pm.*, p.status AS project_status, p.target_size, p.id AS pid
         FROM project_members pm JOIN projects p ON p.id = pm.project_id
         WHERE pm.id = ? FOR UPDATE`,
      [memberId],
    )) as unknown as [Array<Members.MemberRow & { project_status: string; target_size: number; pid: number }>];
    const member = rows[0];
    if (!member) throw Errors.NotFound();
    if (member.user_id !== userId) throw Errors.Forbidden('본인의 초대만 응답할 수 있습니다');
    if (member.state !== 'INVITED') throw Errors.Validation('이미 처리된 초대입니다');

    if (accept) {
      const [[{ cnt }]] = (await conn.query(
        `SELECT COUNT(*) AS cnt FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
        [member.pid],
      )) as unknown as [Array<{ cnt: number }>];
      if (cnt + 1 > member.target_size) throw Errors.Conflict('정원이 가득 찼습니다');

      await conn.query(
        `UPDATE project_members SET state = 'ACCEPTED', joined_at = NOW(3) WHERE id = ?`,
        [memberId],
      );
      // 정원 달성 시 RUNNING 전환
      if (cnt + 1 === member.target_size) {
        await conn.query(`UPDATE projects SET status = 'RUNNING' WHERE id = ?`, [member.pid]);
      }
    } else {
      await conn.query(`UPDATE project_members SET state = 'REJECTED' WHERE id = ?`, [memberId]);
    }
    await conn.commit();

    await audit({
      actorId: userId,
      action: accept ? 'INVITE_ACCEPT' : 'INVITE_REJECT',
      targetType: 'project_member',
      targetId: memberId,
    });
    return { state: accept ? 'ACCEPTED' : 'REJECTED' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

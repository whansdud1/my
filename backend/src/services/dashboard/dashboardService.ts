import { getPool } from '../../db/connection.js';
import { Errors } from '../../lib/envelope.js';
import * as Projects from '../../repositories/projects.js';
import * as Members from '../../repositories/projectMembers.js';
import * as Tasks from '../../repositories/tasks.js';
import { assessProject, type RiskAssessment } from '../collabRisk/index.js';

// 016 — 팀 활동 실시간 모니터링 + 만족도/협업효율 분석 대시보드(To-Be ④·⑥).
// 별도 테이블 없이 기존 데이터(collaboration_activities / project_tasks / schedule_events /
// evaluations / ai_scores / peer_star_ratings)를 프로젝트 단위로 집계하여 한 번에 제공.

const ACTIVITY_TYPES = ['MEETING_JOIN', 'UPLOAD', 'MESSAGE_RESP', 'DEADLINE_MET', 'DEADLINE_MISS'] as const;
type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface MemberInfo {
  userId: string;
  name: string;
  role: string;
}

export interface ProjectDashboard {
  project: { id: string; title: string; status: string; startsAt: string | null; endsAt: string | null };
  windowDays: number;
  members: MemberInfo[];
  activity: {
    totals: Record<ActivityType, number>;
    byMember: Array<{ userId: string; name: string; total: number; byType: Record<ActivityType, number> }>;
    recent: Array<{ userId: string; name: string; activityType: ActivityType; occurredAt: string }>;
  };
  tasks: {
    stats: Tasks.TaskStats;
    byMember: Array<{ userId: string; name: string; assigned: number; done: number; completionRate: number }>;
  };
  schedule: {
    upcoming: Array<{ id: string; type: string; title: string; startsAt: string }>;
  };
  risk: RiskAssessment;
  analysis: {
    evaluation: {
      count: number;
      avgSatisfaction: number;
      avgContribution: number;
      avgCommunication: number;
      avgResponsibility: number;
      overall: number;
    } | null;
    peerStars: { avg: number; count: number } | null;
    efficiency: Array<{
      userId: string;
      name: string;
      total: number;
      meetingRate: number;
      uploadRate: number;
      deadlineRate: number;
      responseScore: number;
      completionScore: number;
    }>;
  };
}

async function assertMember(projectId: number, userId: number): Promise<Projects.ProjectRow> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.owner_id === userId) return project;
  const m = await Members.findOne(projectId, userId);
  if (!m || m.state !== 'ACCEPTED') throw Errors.Forbidden('팀원만 대시보드를 볼 수 있습니다');
  return project;
}

function emptyByType(): Record<ActivityType, number> {
  return { MEETING_JOIN: 0, UPLOAD: 0, MESSAGE_RESP: 0, DEADLINE_MET: 0, DEADLINE_MISS: 0 };
}

export async function getDashboard(projectId: number, actorId: number, windowDays = 14): Promise<ProjectDashboard> {
  const project = await assertMember(projectId, actorId);
  const pool = getPool();

  // --- 멤버(팀장 + ACCEPTED) ---
  const [memberRows] = (await pool.query(
    `SELECT m.user_id, u.name, m.role
       FROM project_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? AND m.state = 'ACCEPTED'
     UNION
     SELECT p.owner_id AS user_id, u2.name, '팀장' AS role
       FROM projects p JOIN users u2 ON u2.id = p.owner_id
       WHERE p.id = ?`,
    [projectId, projectId],
  )) as unknown as [Array<{ user_id: number; name: string; role: string }>];
  const members: MemberInfo[] = memberRows.map((r) => ({ userId: String(r.user_id), name: r.name, role: r.role }));
  const nameById = new Map(memberRows.map((r) => [r.user_id, r.name]));

  // --- 활동 집계(최근 windowDays일) ---
  const [totalsRows] = (await pool.query(
    `SELECT activity_type, COUNT(*) AS c
       FROM collaboration_activities
       WHERE project_id = ? AND occurred_at >= (NOW(3) - INTERVAL ? DAY)
       GROUP BY activity_type`,
    [projectId, windowDays],
  )) as unknown as [Array<{ activity_type: ActivityType; c: number }>];
  const totals = emptyByType();
  for (const r of totalsRows) totals[r.activity_type] = Number(r.c);

  const [memberActRows] = (await pool.query(
    `SELECT user_id, activity_type, COUNT(*) AS c
       FROM collaboration_activities
       WHERE project_id = ? AND occurred_at >= (NOW(3) - INTERVAL ? DAY)
       GROUP BY user_id, activity_type`,
    [projectId, windowDays],
  )) as unknown as [Array<{ user_id: number; activity_type: ActivityType; c: number }>];
  const byMemberMap = new Map<number, Record<ActivityType, number>>();
  for (const r of memberActRows) {
    if (!byMemberMap.has(r.user_id)) byMemberMap.set(r.user_id, emptyByType());
    byMemberMap.get(r.user_id)![r.activity_type] = Number(r.c);
  }
  const activityByMember = members.map((m) => {
    const byType = byMemberMap.get(Number(m.userId)) ?? emptyByType();
    const total = ACTIVITY_TYPES.reduce((s, t) => s + byType[t], 0);
    return { userId: m.userId, name: m.name, total, byType };
  });

  const [recentRows] = (await pool.query(
    `SELECT ca.user_id, u.name, ca.activity_type, ca.occurred_at
       FROM collaboration_activities ca JOIN users u ON u.id = ca.user_id
       WHERE ca.project_id = ?
       ORDER BY ca.occurred_at DESC LIMIT 15`,
    [projectId],
  )) as unknown as [Array<{ user_id: number; name: string; activity_type: ActivityType; occurred_at: Date }>];
  const recent = recentRows.map((r) => ({
    userId: String(r.user_id),
    name: r.name,
    activityType: r.activity_type,
    occurredAt: r.occurred_at.toISOString(),
  }));

  // --- 업무/태스크 ---
  const taskStats = await Tasks.statsByProject(projectId);
  const taskLoad = await Tasks.loadByMember(projectId);
  const tasksByMember = taskLoad.map((l) => ({
    userId: String(l.user_id),
    name: nameById.get(l.user_id) ?? '알 수 없음',
    assigned: l.assigned,
    done: l.done,
    completionRate: l.assigned > 0 ? Math.round((l.done / l.assigned) * 100) : 0,
  }));

  // --- 일정(다가오는) ---
  const [eventRows] = (await pool.query(
    `SELECT id, type, title, starts_at
       FROM schedule_events
       WHERE project_id = ? AND status = 'SCHEDULED' AND starts_at >= NOW(3)
       ORDER BY starts_at LIMIT 8`,
    [projectId],
  )) as unknown as [Array<{ id: number; type: string; title: string; starts_at: Date }>];
  const upcoming = eventRows.map((e) => ({
    id: String(e.id),
    type: e.type,
    title: e.title,
    startsAt: e.starts_at.toISOString(),
  }));

  // --- 만족도 분석(상호 평가, 프로젝트 단위) ---
  const [evalRows] = (await pool.query(
    `SELECT COUNT(*) AS cnt, AVG(satisfaction) AS sat, AVG(contribution) AS con,
            AVG(communication) AS comm, AVG(responsibility) AS resp
       FROM evaluations WHERE project_id = ? AND review_state <> 'REJECTED'`,
    [projectId],
  )) as unknown as [Array<{ cnt: number; sat: string | null; con: string | null; comm: string | null; resp: string | null }>];
  const er = evalRows[0];
  const evaluation =
    er && Number(er.cnt) > 0
      ? {
          count: Number(er.cnt),
          avgSatisfaction: round2(Number(er.sat)),
          avgContribution: round2(Number(er.con)),
          avgCommunication: round2(Number(er.comm)),
          avgResponsibility: round2(Number(er.resp)),
          overall: round2(
            (Number(er.sat) + Number(er.con) + Number(er.comm) + Number(er.resp)) / 4,
          ),
        }
      : null;

  // --- 별점(팀원 상호 별점, 프로젝트 단위) ---
  const [starRows] = (await pool.query(
    `SELECT AVG(stars) AS avg, COUNT(*) AS cnt FROM peer_star_ratings WHERE project_id = ?`,
    [projectId],
  )) as unknown as [Array<{ avg: string | null; cnt: number }>];
  const sr = starRows[0];
  const peerStars = sr && Number(sr.cnt) > 0 ? { avg: round2(Number(sr.avg)), count: Number(sr.cnt) } : null;

  // --- 팀 갈등(협업) 위험 평가 ---
  const risk = await assessProject(projectId, windowDays);

  // --- AI 협업효율(ai_scores, 프로젝트 단위) ---
  const [aiRows] = (await pool.query(
    `SELECT a.user_id, u.name, a.total, a.meeting_rate, a.upload_rate, a.deadline_rate,
            a.response_score, a.completion_score
       FROM ai_scores a JOIN users u ON u.id = a.user_id
       WHERE a.project_id = ?
       ORDER BY a.total DESC`,
    [projectId],
  )) as unknown as [
    Array<{
      user_id: number;
      name: string;
      total: string;
      meeting_rate: string;
      upload_rate: string;
      deadline_rate: string;
      response_score: string;
      completion_score: string;
    }>,
  ];
  const efficiency = aiRows.map((a) => ({
    userId: String(a.user_id),
    name: a.name,
    total: Number(a.total),
    meetingRate: Number(a.meeting_rate),
    uploadRate: Number(a.upload_rate),
    deadlineRate: Number(a.deadline_rate),
    responseScore: Number(a.response_score),
    completionScore: Number(a.completion_score),
  }));

  return {
    project: {
      id: String(project.id),
      title: project.title,
      status: project.status,
      startsAt: project.starts_at ? new Date(project.starts_at).toISOString() : null,
      endsAt: project.ends_at ? new Date(project.ends_at).toISOString() : null,
    },
    windowDays,
    members,
    activity: { totals, byMember: activityByMember, recent },
    tasks: { stats: taskStats, byMember: tasksByMember },
    schedule: { upcoming },
    risk,
    analysis: { evaluation, peerStars, efficiency },
  };
}

function round2(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100) / 100;
}

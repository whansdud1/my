// T061 — 매칭 결합기 + breakdown
//
// 알고리즘:
//   1. 후보군 풀: status=ACTIVE 이고 현재 프로젝트에 INVITED/ACCEPTED 가 아닌 사용자
//   2. 각 후보에 대해 role/overlap/style/rating/trust/diversity 점수 산출
//   3. weights.combine 으로 0~100 결합
//   4. 상위 N + breakdown 저장(캐시) + 반환

import * as Projects from '../../repositories/projects.js';
import * as Members from '../../repositories/projectMembers.js';
import * as Availabilities from '../../repositories/availabilities.js';
import * as Matching from '../../repositories/matching.js';
import { getPool } from '../../db/connection.js';
import { Errors } from '../../lib/envelope.js';
import { scoreRole } from './role.js';
import { scoreOverlap, type Slot } from './overlap.js';
import { scoreStyle, type StyleAxes } from './style.js';
import { scoreWeights, combine } from './weights.js';
import { logger } from '../../lib/logger.js';

export interface CandidateOut {
  userId: string;
  name: string;
  major: string | null;
  grade: number | null;
  rating: number;
  matchScore: number;
  breakdown: Record<string, number>;
  preferredRoles: string[];
}

interface UserCalcRow {
  id: number;
  name: string;
  department: string | null;
  grade: number | null;
  preferred_roles: string[];
  collaboration_style: { axes?: StyleAxes };
  trust_score: string;
  stars: string | null;
  evaluation_count: number | null;
  ai_avg: string | null;
}

export async function recommend(projectId: number, limit = 10): Promise<CandidateOut[]> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');

  // 캐시 확인
  const cached = await Matching.getCached(projectId);
  if (cached.length >= limit) {
    return await projectCachedToDto(cached.slice(0, limit));
  }

  const scored = await computeScored(projectId, project);
  const top = scored.slice(0, limit);

  // 캐시 저장 (비차단으로도 가능하지만 일관성 위해 awaiting)
  await Matching.saveBatch(
    projectId,
    top.map((t) => ({ candidateId: t.row.id, score: t.total, breakdown: t.breakdown })),
  );

  return top.map(toDto);
}

export interface RoleGroup {
  role: string;
  candidates: CandidateOut[];
}

// 역할별 탭 — 프로젝트 모집 역할마다 별점(★) 높은 순 상위 perRole명을 그룹으로 반환.
export async function recommendByRole(projectId: number, perRole = 10): Promise<RoleGroup[]> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');

  const scored = await computeScored(projectId, project);
  const roles = Array.from(new Set((project.required_roles ?? []).map((r) => r.role)));

  const byRating = (a: Scored, b: Scored): number => {
    const ra = a.row.stars ? Number(a.row.stars) : 0;
    const rb = b.row.stars ? Number(b.row.stars) : 0;
    if (rb !== ra) return rb - ra; // 별점 높은 순
    return b.total - a.total; // 동점이면 적합도 높은 순
  };

  return roles.map((role) => ({
    role,
    candidates: scored
      .filter((s) => (s.row.preferred_roles ?? []).includes(role))
      .sort(byRating)
      .slice(0, perRole)
      .map(toDto),
  }));
}

interface Scored {
  row: UserCalcRow;
  total: number;
  breakdown: Record<string, number>;
}

function toDto(s: Scored): CandidateOut {
  return {
    userId: String(s.row.id),
    name: s.row.name,
    major: s.row.department,
    grade: s.row.grade,
    rating: s.row.stars ? Number(s.row.stars) : 0,
    matchScore: s.total,
    breakdown: s.breakdown,
    preferredRoles: s.row.preferred_roles ?? [],
  };
}

// 후보 풀 전체를 점수화하여 적합도 내림차순으로 반환 (recommend / recommendByRole 공용).
async function computeScored(
  projectId: number,
  project: Projects.ProjectRow,
): Promise<Scored[]> {
  const start = Date.now();

  // 현재 팀 (등록자 포함 ACCEPTED)
  const members = await Members.findByProject(projectId);
  const acceptedIds = members.filter((m) => m.state === 'ACCEPTED').map((m) => m.user_id);
  const excludeIds = members.filter((m) => m.state === 'INVITED' || m.state === 'ACCEPTED').map((m) => m.user_id);

  // 팀 가용시간
  const teamSlotsByMember: Slot[][] = [];
  const teamAxes: StyleAxes[] = [];
  for (const uid of acceptedIds) {
    const slots = (await Availabilities.listByUser(uid)).map((s) => ({
      weekday: s.weekday,
      startMin: s.startMin,
      endMin: s.endMin,
    }));
    teamSlotsByMember.push(slots);
    // 팀원 axes
    const [[u]] = (await getPool().query(
      `SELECT collaboration_style FROM users WHERE id = ?`,
      [uid],
    )) as unknown as [Array<{ collaboration_style: { axes?: StyleAxes } }>];
    if (u?.collaboration_style?.axes) teamAxes.push(u.collaboration_style.axes);
  }

  // 채워진 역할 카운트
  const filledRolesByCount: Record<string, number> = {};
  for (const m of members) {
    if (m.state === 'ACCEPTED') filledRolesByCount[m.role] = (filledRolesByCount[m.role] ?? 0) + 1;
  }

  // 후보 풀 조회 — ACTIVE, 제외 ID 아닌 사용자, role_user=STUDENT 우선 + 50명 제한(MVP)
  const excludeClause = excludeIds.length > 0 ? `AND u.id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
  const [pool] = (await getPool().query(
    `SELECT u.id, u.name, u.department, u.grade, u.preferred_roles, u.collaboration_style, u.trust_score,
            r.stars, r.evaluation_count,
            (SELECT AVG(a.total) FROM ai_scores a WHERE a.user_id = u.id) AS ai_avg
       FROM users u
       LEFT JOIN ratings r ON r.user_id = u.id
       WHERE u.status = 'ACTIVE' AND u.role_user = 'STUDENT' ${excludeClause}
       LIMIT 200`,
    excludeIds,
  )) as unknown as [UserCalcRow[]];

  // 후보별 점수
  const scored: Array<{ row: UserCalcRow; total: number; breakdown: Record<string, number> }> = [];
  for (const cand of pool) {
    const candSlots = (await Availabilities.listByUser(cand.id)).map((s) => ({
      weekday: s.weekday,
      startMin: s.startMin,
      endMin: s.endMin,
    }));

    const roleScore = scoreRole({
      candidatePreferredRoles: cand.preferred_roles ?? [],
      requiredRoles: project.required_roles,
      filledRolesByCount,
    });
    const overlapScore = scoreOverlap({ teamSlotsByMember, candidateSlots: candSlots });
    const styleScore = scoreStyle({
      candidate: cand.collaboration_style?.axes ?? null,
      teamMembers: teamAxes,
    });

    const ratingStars = cand.stars ? Number(cand.stars) : 0;
    const evalCount = cand.evaluation_count ?? 0;
    const trustScoreVal = Number(cand.trust_score);
    // diversity hint: 학과 다양성 — 팀과 다른 학과면 +
    const sameDeptMembers = members.filter((m) => m.state === 'ACCEPTED');
    let diversityHint = 60;
    if (sameDeptMembers.length > 0 && cand.department) {
      const deptIds = sameDeptMembers.map((m) => m.user_id);
      const [drows] = (await getPool().query(
        `SELECT DISTINCT department FROM users WHERE id IN (?)`,
        [deptIds],
      )) as unknown as [Array<{ department: string | null }>];
      const teamDepts = new Set(drows.map((r) => r.department));
      diversityHint = teamDepts.has(cand.department) ? 40 : 80;
    }

    const aiActivityScore = cand.ai_avg ? Number(cand.ai_avg) : 0;
    const wparts = scoreWeights({
      ratingStars,
      evaluationCount: evalCount,
      trustScore: trustScoreVal,
      diversityHint,
      aiActivityScore,
    });

    const total = combine({
      role: roleScore,
      overlap: overlapScore,
      style: styleScore,
      rating: wparts.rating,
      trust: wparts.trust,
      diversity: wparts.diversity,
      ai: wparts.ai,
      exposureBoost: wparts.exposureBoost,
    });

    scored.push({
      row: cand,
      total,
      breakdown: {
        role: roleScore,
        overlap: overlapScore,
        style: styleScore,
        rating: wparts.rating,
        trust: wparts.trust,
        diversity: wparts.diversity,
        ai: wparts.ai,
      },
    });
  }

  scored.sort((a, b) => b.total - a.total);

  logger.info(
    { projectId, candidates: pool.length, picked: scored.length, elapsedMs: Date.now() - start },
    'matching.computeScored done',
  );

  return scored;
}

async function projectCachedToDto(rows: Matching.RecCache[]): Promise<CandidateOut[]> {
  const ids = rows.map((r) => r.candidate_id);
  if (ids.length === 0) return [];
  const [users] = (await getPool().query(
    `SELECT u.id, u.name, u.department, u.grade, u.preferred_roles, r.stars
       FROM users u LEFT JOIN ratings r ON r.user_id = u.id WHERE u.id IN (?)`,
    [ids],
  )) as unknown as [Array<{ id: number; name: string; department: string | null; grade: number | null; preferred_roles: string[]; stars: string | null }>];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows
    .map((r) => {
      const u = byId.get(r.candidate_id);
      if (!u) return null;
      return {
        userId: String(u.id),
        name: u.name,
        major: u.department,
        grade: u.grade,
        rating: u.stars ? Number(u.stars) : 0,
        matchScore: Number(r.score),
        breakdown: r.score_breakdown,
        preferredRoles: u.preferred_roles ?? [],
      };
    })
    .filter((x): x is CandidateOut => x !== null);
}

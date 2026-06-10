// 자동 팀 편성 (Auto Team Composition)
//
// 비전 목표 2 — "성향·협업스타일·역할 선호 데이터 기반 최적의 팀 자동 구성".
// 기존 recommend() 의 적합도 점수를 재사용해, 아직 비어 있는 역할 슬롯을
// 역할 선호 우선 + 적합도 내림차순으로 그리디 배정한다.
//
// 두 가지 모드:
//   - preview(commit=false): 제안만 반환 (DB 변경 없음)
//   - commit=true: 제안된 후보들에게 일괄 초대(INVITED) 발송
//
// 공정성·투명성(목표 4): 각 후보의 점수 breakdown 과 배정 역할·역할일치 여부를
// 그대로 노출하고, 채우기 어려운(선호자 적은) 역할을 먼저 배정해 특정 역할이
// 굶지 않도록 한다.

import * as Projects from '../../repositories/projects.js';
import * as Members from '../../repositories/projectMembers.js';
import { Errors } from '../../lib/envelope.js';
import { recommend, type CandidateOut } from './index.js';
import * as Invites from '../projects/invites.js';
import { logger } from '../../lib/logger.js';

export interface ComposePick {
  userId: string;
  name: string;
  major: string | null;
  grade: number | null;
  rating: number;
  role: string; // 배정된 역할
  roleMatched: boolean; // 후보 선호 역할과 일치 여부
  matchScore: number;
  breakdown: Record<string, number>;
  preferredRoles: string[];
}

export interface InviteOutcome {
  userId: string;
  role: string;
  ok: boolean;
  reason?: string;
}

export interface ComposeResult {
  projectId: string;
  targetSize: number;
  acceptedCount: number; // 현재 ACCEPTED 멤버 수
  openSlots: number; // 이번에 채우려는 빈 슬롯 수
  picks: ComposePick[]; // 제안된 팀 구성
  unfilledRoles: Array<{ role: string; remaining: number }>; // 후보 부족으로 못 채운 역할
  teamFitAvg: number; // 제안 팀의 평균 적합도(0~100)
  committed: boolean;
  invited?: InviteOutcome[]; // commit 시 초대 결과
}

const OCCUPANT_STATES: Members.MemberState[] = ['ACCEPTED', 'INVITED'];

export interface ComposeOptions {
  commit?: boolean;
  inviterId: number;
  poolLimit?: number; // 후보 풀 상한 (기본 50)
}

export async function composeTeam(projectId: number, opts: ComposeOptions): Promise<ComposeResult> {
  const project = await Projects.findById(projectId);
  if (!project) throw Errors.NotFound('프로젝트가 없습니다');
  if (project.status !== 'RECRUIT' && project.status !== 'RUNNING') {
    throw Errors.Validation('모집/진행 중인 프로젝트만 자동 편성할 수 있습니다');
  }

  const members = await Members.findByProject(projectId);
  const accepted = members.filter((m) => m.state === 'ACCEPTED');
  // ACCEPTED + INVITED 가 이미 점유 중인 슬롯 — 정원·역할 계산 모두에 반영(중복 초대/정원 초과 방지)
  const occupants = members.filter((m) => OCCUPANT_STATES.includes(m.state));
  const occupiedTotal = occupants.length;
  const occByRole: Record<string, number> = {};
  for (const m of occupants) occByRole[m.role] = (occByRole[m.role] ?? 0) + 1;

  const capacity = project.target_size - occupiedTotal;
  if (capacity <= 0) {
    throw Errors.Conflict('빈 자리가 없습니다 (정원이 찼거나 초대 대기 중인 인원이 정원을 채움)');
  }

  // 채워야 할 역할 슬롯 목록 구성
  const requiredRoles = (project.required_roles ?? []) as Array<{ role: string; count: number }>;
  let slots: string[] = [];
  if (requiredRoles.length > 0) {
    for (const r of requiredRoles) {
      const remaining = Math.max(r.count - (occByRole[r.role] ?? 0), 0);
      for (let i = 0; i < remaining; i++) slots.push(r.role);
    }
  } else {
    // 역할 미지정 프로젝트 — 일반(MEMBER) 슬롯으로 정원만큼 채움
    for (let i = 0; i < capacity; i++) slots.push('MEMBER');
  }
  // 정원 상한으로 잘라냄 (역할 정원 합이 target_size 를 넘는 경우 방지)
  slots = slots.slice(0, capacity);

  if (slots.length === 0) {
    return emptyResult(projectId, project.target_size, accepted.length, 0, true);
  }

  // 후보 풀 — recommend 점수 재사용. 캐시 staleness 대비 현재 점유자는 한 번 더 제외.
  const poolLimit = Math.max(opts.poolLimit ?? 50, slots.length);
  const occupantIds = new Set(occupants.map((o) => String(o.user_id)));
  const candidates = (await recommend(projectId, poolLimit)).filter(
    (c) => !occupantIds.has(c.userId),
  );

  // 역할별 선호 후보 수 — 적은(채우기 어려운) 역할을 먼저 배정해 굶김 방지.
  const prefCount = (role: string): number => {
    if (role === 'MEMBER') return Number.MAX_SAFE_INTEGER; // 일반 슬롯은 가장 마지막
    return candidates.filter((c) => c.preferredRoles.includes(role)).length;
  };
  const orderedSlots = [...slots].sort((a, b) => prefCount(a) - prefCount(b));

  const assigned = new Set<string>();
  const picks: ComposePick[] = [];
  const unfilledSlots: string[] = [];

  // 1차: 역할 선호가 일치하는 후보를 적합도 순으로 배정
  for (const role of orderedSlots) {
    const cand = candidates.find(
      (c) => !assigned.has(c.userId) && (role === 'MEMBER' || c.preferredRoles.includes(role)),
    );
    if (cand) {
      assigned.add(cand.userId);
      picks.push(toPick(cand, role, role === 'MEMBER' || cand.preferredRoles.includes(role)));
    } else {
      unfilledSlots.push(role);
    }
  }

  // 2차(폴백): 선호 일치 후보가 없어 빈 슬롯은 남은 후보 중 적합도 최상위로 채움(역할 불일치 표시)
  for (const role of unfilledSlots.slice()) {
    const cand = candidates.find((c) => !assigned.has(c.userId));
    if (cand) {
      assigned.add(cand.userId);
      picks.push(toPick(cand, role, false));
      unfilledSlots.splice(unfilledSlots.indexOf(role), 1);
    }
  }

  // 남은 미충원 역할 집계
  const unfilledRoles = Object.entries(
    unfilledSlots.reduce<Record<string, number>>((acc, r) => {
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([role, remaining]) => ({ role, remaining }));

  const teamFitAvg =
    picks.length > 0
      ? Math.round((picks.reduce((s, p) => s + p.matchScore, 0) / picks.length) * 100) / 100
      : 0;

  const result: ComposeResult = {
    projectId: String(projectId),
    targetSize: project.target_size,
    acceptedCount: accepted.length,
    openSlots: slots.length,
    picks,
    unfilledRoles,
    teamFitAvg,
    committed: false,
  };

  if (!opts.commit) {
    logger.info(
      { projectId, openSlots: slots.length, picked: picks.length, mode: 'preview' },
      'matching.compose preview',
    );
    return result;
  }

  // commit — 제안된 후보들에게 순차 초대(가드는 sendInvite 내부에서 처리)
  const invited: InviteOutcome[] = [];
  for (const p of picks) {
    try {
      await Invites.sendInvite({
        projectId,
        inviterId: opts.inviterId,
        invitedUserId: Number(p.userId),
        role: p.role,
      });
      invited.push({ userId: p.userId, role: p.role, ok: true });
    } catch (e) {
      invited.push({
        userId: p.userId,
        role: p.role,
        ok: false,
        reason: (e as { detail?: string; message?: string }).detail ?? (e as Error).message,
      });
    }
  }

  result.committed = true;
  result.invited = invited;
  logger.info(
    {
      projectId,
      picked: picks.length,
      invitedOk: invited.filter((i) => i.ok).length,
      mode: 'commit',
    },
    'matching.compose commit',
  );
  return result;
}

function toPick(c: CandidateOut, role: string, roleMatched: boolean): ComposePick {
  return {
    userId: c.userId,
    name: c.name,
    major: c.major,
    grade: c.grade,
    rating: c.rating,
    role,
    roleMatched,
    matchScore: c.matchScore,
    breakdown: c.breakdown,
    preferredRoles: c.preferredRoles,
  };
}

function emptyResult(
  projectId: number,
  targetSize: number,
  acceptedCount: number,
  openSlots: number,
  committed: boolean,
): ComposeResult {
  return {
    projectId: String(projectId),
    targetSize,
    acceptedCount,
    openSlots,
    picks: [],
    unfilledRoles: [],
    teamFitAvg: 0,
    committed,
    invited: committed ? [] : undefined,
  };
}

import { getPool } from '../../db/connection.js';
import * as Tasks from '../../repositories/tasks.js';
import { scanLexicon } from '../moderation/lexicon.js';

// 팀 갈등(협업) 위험 예측 — 규칙 기반 휴리스틱.
// 진행 중(RUNNING) 프로젝트에서 수집 가능한 신호 4가지를 가중 점수화한다.
//   1) 마감 초과(OVERDUE)        — 마감 지난 미완료 업무 비율
//   2) 업무 불균형(IMBALANCE)    — 일부 팀원에게 업무가 쏠림(0건 배정 팀원 존재)
//   3) 악성 채팅(TOXIC)          — 최근 채팅의 공격적/모욕적 표현(사전 스캐너 재사용, LLM 미사용)
//   4) 참여 저조(INACTIVITY)     — 활발한 팀에서 일부 팀원만 채팅 침묵
// 대시보드(팀 전원)와 팀장 알림에 함께 쓰이므로, 설명 문구는 개인을 지목하지 않고
// 집계 수치로만 표현한다(낙인 방지).

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export type RiskFactorKey = 'OVERDUE' | 'IMBALANCE' | 'TOXIC' | 'INACTIVITY';

export interface RiskFactor {
  key: RiskFactorKey;
  label: string; // 짧은 제목
  detail: string; // 집계 기반 설명(전원 공유 안전)
  weight: number; // 이 요인이 총점에 더한 값
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0~100
  factors: RiskFactor[];
  summary: string; // 한 줄 요약(알림 본문용)
  assessedAt: string; // ISO
}

export const RISK_RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

// 임계값·가중치 — 한 곳에서 조정.
// 실제 데이터 분포(2026-06 기준)에 맞춰 보정: 팀 규모 2~4명, 태스크·채팅 모두 저volume
// (프로젝트당 채팅 최대 5건, 멤버당 최대 4건). 따라서 "수백 건" 기준이 아니라
// 소규모·저빈도에서도 단일 신호가 적절한 레벨로 드러나도록 낮게 잡는다.
export const TUNING = {
  // 점수→레벨 경계(소규모 팀에서 단일 신호도 표면화되도록 medium/low를 약간 낮춤)
  level: { high: 50, medium: 28, low: 12 },
  overdue: {
    ratioHigh: 0.5, // 미완료 비율이 절반 이상
    countHigh: 3, // 또는 마감초과 절대건수 3건 이상 → 높은 가중치
    weightHigh: 35,
    weightAny: 20, // 마감초과가 1건이라도 있으면 최소 이 가중치(소규모 팀에선 1건도 유의미)
  },
  imbalance: {
    heavyAssigned: 2, // 한 명이 2건 이상 떠안았는데
    weightPerIdle: 15, // 미배정 팀원 1명당
    maxIdleCounted: 2, // 최대 2명까지(최대 30)
  },
  toxic: {
    severeWeight: 50, // 욕설/모욕 1건이라도 → 높음
    mildManyCount: 2, // 거친 표현 2건 이상
    mildManyWeight: 25,
    mildOneWeight: 12, // 1건 → 주의
  },
  inactivity: {
    minMessages: (memberCount: number) => memberCount * 2, // 팀이 실제로 대화 중일 때만 판단
    weightOneSilent: 15, // 1명 침묵 → 주의
    weightManySilent: 25, // 2명 이상 침묵
  },
} as const;

function levelFromScore(score: number): RiskLevel {
  if (score >= TUNING.level.high) return 'high';
  if (score >= TUNING.level.medium) return 'medium';
  if (score >= TUNING.level.low) return 'low';
  return 'none';
}

// 팀장(owner) + ACCEPTED 멤버의 user_id 목록
async function teamUserIds(projectId: number): Promise<number[]> {
  const [rows] = (await getPool().query(
    `SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'
     UNION
     SELECT owner_id AS user_id FROM projects WHERE id = ?`,
    [projectId, projectId],
  )) as unknown as [Array<{ user_id: number }>];
  return rows.map((r) => Number(r.user_id));
}

export async function assessProject(projectId: number, windowDays = 14): Promise<RiskAssessment> {
  const factors: RiskFactor[] = [];

  const members = await teamUserIds(projectId);
  const memberCount = members.length;

  // --- 1) 마감 초과 ---
  const stats = await Tasks.statsByProject(projectId);
  if (stats.total > 0 && stats.overdue > 0) {
    const ratio = stats.overdue / stats.total;
    const pct = Math.round(ratio * 100);
    const severe = ratio >= TUNING.overdue.ratioHigh || stats.overdue >= TUNING.overdue.countHigh;
    factors.push({
      key: 'OVERDUE',
      label: severe ? '마감 초과 업무 다수' : '마감 초과 업무',
      detail: `마감이 지난 미완료 업무 ${stats.overdue}건 (전체 업무의 ${pct}%)`,
      weight: severe ? TUNING.overdue.weightHigh : TUNING.overdue.weightAny,
    });
  }

  // --- 2) 업무 불균형 ---
  const load = await Tasks.loadByMember(projectId);
  if (stats.total >= memberCount && memberCount >= 2) {
    const assignedByUser = new Map(load.map((l) => [l.user_id, l.assigned]));
    const idle = members.filter((id) => (assignedByUser.get(id) ?? 0) === 0);
    const hasHeavy = load.some((l) => l.assigned >= TUNING.imbalance.heavyAssigned);
    if (idle.length >= 1 && hasHeavy) {
      const weight = Math.min(idle.length, TUNING.imbalance.maxIdleCounted) * TUNING.imbalance.weightPerIdle;
      factors.push({
        key: 'IMBALANCE',
        label: '업무 분배 불균형',
        detail: `팀원 ${idle.length}명에게 배정된 업무가 없습니다 (업무가 일부 인원에 집중)`,
        weight,
      });
    }
  }

  // --- 채팅 로드(악성 + 참여 신호에 공용) ---
  const [msgRows] = (await getPool().query(
    `SELECT user_id, body FROM project_messages
       WHERE project_id = ? AND created_at >= (NOW(3) - INTERVAL ? DAY)
       ORDER BY id DESC LIMIT 500`,
    [projectId, windowDays],
  )) as unknown as [Array<{ user_id: number; body: string }>];

  // --- 3) 악성 채팅 ---
  let severeHits = 0;
  let mildHits = 0;
  for (const m of msgRows) {
    const hits = scanLexicon(m.body);
    if (hits.some((h) => h.severity === 'severe')) severeHits++;
    else if (hits.some((h) => h.severity === 'mild')) mildHits++;
  }
  if (severeHits > 0) {
    factors.push({
      key: 'TOXIC',
      label: '공격적 표현 감지',
      detail: `최근 채팅에서 공격적·모욕적 표현이 ${severeHits}건 감지되었습니다`,
      weight: TUNING.toxic.severeWeight,
    });
  } else if (mildHits >= TUNING.toxic.mildManyCount) {
    factors.push({
      key: 'TOXIC',
      label: '거친 표현 반복',
      detail: `최근 채팅에서 거친 표현이 여러 번(${mildHits}건) 감지되었습니다`,
      weight: TUNING.toxic.mildManyWeight,
    });
  } else if (mildHits >= 1) {
    factors.push({
      key: 'TOXIC',
      label: '거친 표현',
      detail: `최근 채팅에서 거친 표현이 ${mildHits}건 감지되었습니다`,
      weight: TUNING.toxic.mildOneWeight,
    });
  }

  // --- 4) 참여 저조(팀이 활발히 대화 중인데 일부만 침묵) ---
  if (memberCount >= 2 && msgRows.length >= TUNING.inactivity.minMessages(memberCount)) {
    const spokeUserIds = new Set(msgRows.map((m) => Number(m.user_id)));
    const silent = members.filter((id) => !spokeUserIds.has(id));
    if (silent.length >= 1 && silent.length < memberCount) {
      const weight =
        silent.length >= 2 ? TUNING.inactivity.weightManySilent : TUNING.inactivity.weightOneSilent;
      factors.push({
        key: 'INACTIVITY',
        label: '참여 저조',
        detail: `팀원 ${silent.length}명이 최근 ${windowDays}일간 채팅 참여가 없습니다`,
        weight,
      });
    }
  }

  const score = Math.min(
    100,
    factors.reduce((s, f) => s + f.weight, 0),
  );
  const level = levelFromScore(score);
  const summary =
    level === 'none'
      ? '특이 위험 신호가 없습니다.'
      : factors
          .slice()
          .sort((a, b) => b.weight - a.weight)
          .map((f) => f.detail)
          .join(' · ');

  return { level, score, factors, summary, assessedAt: new Date().toISOString() };
}

import * as repo from '../../repositories/schedule.js';
import * as Projects from '../../repositories/projects.js';
import { computeCommonSlots, minToHHMM } from './commonSlots.js';

// 프리미엄 — AI 기반 일정 최적화.
// 멤버 가용시간의 공통 구간을 바탕으로 '최적의 정기 회의 시간'을 점수화해 추천한다.
// 신호: 참여 가능 인원 비율 · 전원 가능 여부 · 시간대 선호(프로젝트 work_time_pref) ·
//       기존 일정과의 충돌 · 시간 여유. 규칙 기반(휴리스틱) — 외부 API 불필요.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export interface MeetingRecommendation {
  weekday: number;
  weekdayLabel: string;
  startMin: number;
  endMin: number; // 추천 회의 종료(duration 적용)
  windowEndMin: number; // 가용 구간의 실제 끝
  timeLabel: string; // 'HH:MM~HH:MM'
  availableCount: number;
  totalMembers: number;
  allAvailable: boolean;
  score: number; // 0~100
  reasons: string[];
}

export interface OptimizeResult {
  totalMembers: number;
  durationMin: number;
  workTimePref: Projects.ProjectRow['work_time_pref'];
  recommendations: MeetingRecommendation[];
  note: string;
}

interface Busy {
  weekday: number;
  startMin: number;
  endMin: number;
}

function eventBusyBlocks(events: repo.ScheduleEventRow[]): Busy[] {
  return events.map((e) => {
    const s = new Date(e.starts_at);
    const startMin = s.getHours() * 60 + s.getMinutes();
    const endMin = e.ends_at
      ? (() => {
          const en = new Date(e.ends_at);
          const m = en.getHours() * 60 + en.getMinutes();
          return m > startMin ? m : startMin + 60;
        })()
      : startMin + 60;
    return { weekday: s.getDay(), startMin, endMin };
  });
}

function overlaps(weekday: number, s: number, e: number, busy: Busy[]): boolean {
  return busy.some((b) => b.weekday === weekday && s < b.endMin && b.startMin < e);
}

// 시간대 선호 점수(0~15) — work_time_pref 반영.
function timeBandBonus(startMin: number, pref: Projects.ProjectRow['work_time_pref']): number {
  const h = Math.floor(startMin / 60);
  const day = h >= 9 && h < 18;
  const evening = h >= 18 && h < 22;
  const earlyOrLate = (h >= 7 && h < 9) || (h >= 22 && h < 24);
  if (pref === 'NIGHT') {
    if (evening) return 15;
    if (earlyOrLate) return 9;
    if (day) return 6;
    return 0;
  }
  // DAY or ANY → 낮 우대
  if (day) return 15;
  if (evening) return 8;
  if (earlyOrLate) return 5;
  return 0;
}

export async function optimizeMeetings(
  projectId: number,
  durationMin = 60,
  limit = 5,
): Promise<OptimizeResult> {
  const duration = Math.min(Math.max(durationMin, 30), 240);
  const project = await Projects.findById(projectId);
  const pref = project?.work_time_pref ?? 'ANY';

  const [avail, total, events] = await Promise.all([
    repo.memberAvailabilities(projectId),
    repo.memberCount(projectId),
    repo.listEvents(projectId),
  ]);

  if (total <= 0) {
    return { totalMembers: 0, durationMin: duration, workTimePref: pref, recommendations: [], note: '팀원이 없어 추천할 수 없습니다.' };
  }

  const slots = computeCommonSlots(
    avail.map((a) => ({ userId: a.user_id, weekday: a.weekday, startMin: a.start_min, endMin: a.end_min })),
    total,
    duration,
  );
  const busy = eventBusyBlocks(events);

  const recs: MeetingRecommendation[] = slots.map((slot) => {
    const startMin = slot.startMin;
    const endMin = Math.min(slot.startMin + duration, slot.endMin);
    const allAvailable = slot.availableCount >= total;

    const reasons: string[] = [];
    // 1) 참여 가능 인원(0~55)
    const coverage = slot.availableCount / total;
    let score = coverage * 55;
    if (allAvailable) {
      score += 15;
      reasons.push('팀원 전원이 참여 가능한 시간대');
    } else {
      reasons.push(`${total}명 중 ${slot.availableCount}명 참여 가능`);
    }
    // 2) 시간대 선호(0~15)
    const band = timeBandBonus(startMin, pref);
    score += band;
    if (band >= 15) reasons.push(pref === 'NIGHT' ? '선호하는 저녁 시간대' : '집중하기 좋은 낮 시간대');
    // 3) 시간 여유(구간이 회의보다 길면 +최대 10)
    const slack = slot.endMin - slot.startMin - duration;
    if (slack > 0) {
      score += Math.min(10, slack / 12);
      if (slack >= 60) reasons.push('앞뒤 여유 시간이 충분');
    }
    // 4) 기존 일정 충돌(-25)
    const conflict = overlaps(slot.weekday, startMin, endMin, busy);
    if (conflict) {
      score -= 25;
      reasons.push('기존 일정과 겹침 — 주의');
    }

    return {
      weekday: slot.weekday,
      weekdayLabel: WEEKDAYS[slot.weekday] ?? '?',
      startMin,
      endMin,
      windowEndMin: slot.endMin,
      timeLabel: `${minToHHMM(startMin)}~${minToHHMM(endMin)}`,
      availableCount: slot.availableCount,
      totalMembers: total,
      allAvailable,
      score: Math.max(0, Math.round(score)),
      reasons,
    };
  });

  recs.sort((a, b) => b.score - a.score || b.availableCount - a.availableCount);

  const note = recs.length
    ? '팀원 가용시간·시간대 선호·기존 일정을 종합해 추천한 정기 회의 시간입니다.'
    : '겹치는 공통 가용시간이 없습니다. 팀원들의 가용시간 등록을 독려해 보세요.';

  return {
    totalMembers: total,
    durationMin: duration,
    workTimePref: pref,
    recommendations: recs.slice(0, limit),
    note,
  };
}

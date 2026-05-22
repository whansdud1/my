// T058 — 시간 겹침 점수 (w2=0.25)
//
// 팀의 ACCEPTED 멤버들 가용시간 ∩ 후보 가용시간 의 비율.
// 기존 팀원이 없으면 (등록자만 있으면) 등록자와 후보의 교집합.

export interface Slot {
  weekday: number;
  startMin: number;
  endMin: number;
}

// 한 사람의 슬롯을 [weekday, minute] 비트맵으로 변환 (7 * 1440 = 10080 분)
function toMask(slots: Slot[]): boolean[] {
  const mask = new Array<boolean>(7 * 1440).fill(false);
  for (const s of slots) {
    const start = Math.max(0, s.startMin);
    const end = Math.min(1440, s.endMin);
    for (let m = start; m < end; m++) {
      mask[s.weekday * 1440 + m] = true;
    }
  }
  return mask;
}

function andMask(a: boolean[], b: boolean[]): boolean[] {
  const out = new Array<boolean>(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i]! && b[i]!;
  return out;
}

function trueCount(mask: boolean[]): number {
  let c = 0;
  for (const v of mask) if (v) c++;
  return c;
}

export interface OverlapInput {
  teamSlotsByMember: Slot[][];   // 기존 멤버들의 슬롯
  candidateSlots: Slot[];
}

export function scoreOverlap(input: OverlapInput): number {
  if (input.candidateSlots.length === 0) return 0;
  const candidateMask = toMask(input.candidateSlots);
  const candidateMinutes = trueCount(candidateMask);
  if (candidateMinutes === 0) return 0;

  if (input.teamSlotsByMember.length === 0) {
    // 팀 슬롯이 없으면 후보 자체 가용성을 0~100 으로 정규화 (max 60h/주 기준)
    return Math.min(100, (candidateMinutes / (60 * 60)) * 100);
  }

  // 팀 전원 교집합
  let team = toMask(input.teamSlotsByMember[0]!);
  for (let i = 1; i < input.teamSlotsByMember.length; i++) {
    team = andMask(team, toMask(input.teamSlotsByMember[i]!));
  }
  const teamMinutes = trueCount(team);
  if (teamMinutes === 0) {
    // 기존 팀 교집합이 없으면 후보가 팀의 한 명 이상과 겹치는 시간으로 보정
    let unionMatch = 0;
    for (const memberSlots of input.teamSlotsByMember) {
      unionMatch = Math.max(unionMatch, trueCount(andMask(toMask(memberSlots), candidateMask)));
    }
    return Math.min(100, (unionMatch / (40 * 60)) * 100);
  }

  const matched = andMask(team, candidateMask);
  const matchedMinutes = trueCount(matched);
  return Math.round((matchedMinutes / teamMinutes) * 100 * 100) / 100;
}

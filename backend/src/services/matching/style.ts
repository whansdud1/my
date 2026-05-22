// T059 — 협업 성향 호환 점수 (w3=0.15)
//
// 4축(planning, communication, adaptability, rigor) 평균값 거리 → 유사도.
// 1차 구현은 단순 보완 매칭: 팀 평균과의 거리가 가까울수록 + 너무 동질화 방지 보정.

export interface StyleAxes {
  planning: number;
  communication: number;
  adaptability: number;
  rigor: number;
}

const AXIS_KEYS: (keyof StyleAxes)[] = ['planning', 'communication', 'adaptability', 'rigor'];

function distance(a: StyleAxes, b: StyleAxes): number {
  let s = 0;
  for (const k of AXIS_KEYS) {
    s += (a[k] - b[k]) ** 2;
  }
  return Math.sqrt(s);
}

export interface StyleScoreInput {
  candidate: StyleAxes | null;
  teamMembers: StyleAxes[];
}

export function scoreStyle(input: StyleScoreInput): number {
  if (!input.candidate) return 50;          // 설문 미응답 — 중립
  if (input.teamMembers.length === 0) return 70; // 첫 후보 — 양호로 가정

  // 팀 평균
  const avg: StyleAxes = { planning: 0, communication: 0, adaptability: 0, rigor: 0 };
  for (const m of input.teamMembers) {
    for (const k of AXIS_KEYS) avg[k] += m[k];
  }
  for (const k of AXIS_KEYS) avg[k] /= input.teamMembers.length;

  const d = distance(input.candidate, avg);
  // d는 0..8 범위. 점수는 가까울수록 높지만, 너무 가까우면 (d < 0.5) 동질화 페널티
  const base = Math.max(0, 100 - d * 12); // 0~100
  const diversityBoost = d > 1.5 && d < 4 ? 5 : 0;
  const homogeneityPenalty = d < 0.4 ? -8 : 0;
  return Math.max(0, Math.min(100, Math.round(base + diversityBoost + homogeneityPenalty)));
}

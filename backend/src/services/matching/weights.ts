// T060 — 평점·신뢰·다양성 가중치 + 노출 적은 사용자 보정 (FR-F3)
//
// 가중치 사양 (plan.md / spec.md):
//   role     w1 = 0.30
//   overlap  w2 = 0.25
//   style    w3 = 0.15
//   rating   w4 = 0.15
//   diversity w5 = 0.10
//   trust    w6 = 0.05
//
// 노출 적은 사용자(평가 카운트 < 3) 는 점수에 +5 점, 매칭 결과 분포 다양성 확보.
// 프리미엄 부스트(US9)는 별도 가중치로 추후 추가.

export const WEIGHTS = {
  role: 0.30,
  overlap: 0.25,
  style: 0.15,
  rating: 0.15,
  diversity: 0.10,
  trust: 0.05,
} as const;

export interface WeightInputs {
  ratingStars: number;         // 0~5
  evaluationCount: number;     // 평가 받은 횟수
  trustScore: number;          // 0~100
  diversityHint: number;       // 팀과의 다양성 점수(이미 0~100로 산출됨)
}

export interface WeightBreakdown {
  rating: number;
  trust: number;
  diversity: number;
  exposureBoost: number;
}

export function scoreWeights(inputs: WeightInputs): WeightBreakdown {
  // rating: 0~5 → 0~100
  const rating = (inputs.ratingStars / 5) * 100;
  // trust: already 0~100
  const trust = Math.max(0, Math.min(100, inputs.trustScore));
  // diversity: 0~100 (호출자가 산출)
  const diversity = Math.max(0, Math.min(100, inputs.diversityHint));
  // 노출 적은 사용자 보정 (FR-F3)
  const exposureBoost = inputs.evaluationCount < 3 ? 5 : 0;

  return { rating, trust, diversity, exposureBoost };
}

// 결합: 가중합. exposureBoost 는 최종 점수에 가산.
export function combine(parts: {
  role: number;
  overlap: number;
  style: number;
  rating: number;
  trust: number;
  diversity: number;
  exposureBoost: number;
}): number {
  const weighted =
    parts.role * WEIGHTS.role +
    parts.overlap * WEIGHTS.overlap +
    parts.style * WEIGHTS.style +
    parts.rating * WEIGHTS.rating +
    parts.diversity * WEIGHTS.diversity +
    parts.trust * WEIGHTS.trust;
  const total = Math.max(0, Math.min(100, weighted + parts.exposureBoost));
  return Math.round(total * 100) / 100;
}

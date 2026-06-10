// T060 — 평점·신뢰·다양성·AI활동 가중치 + 노출 적은 사용자 보정 (FR-F3)
//
// 가중치 사양 (To-Be ① — AI 활동 분석을 추천에 통합):
//   role      w1 = 0.25
//   overlap   w2 = 0.20
//   ai        w3 = 0.15  ← 과거 협업의 AI 활동 분석(ai_scores.total) 반영
//   rating    w4 = 0.13
//   style     w5 = 0.12
//   diversity w6 = 0.08
//   trust     w7 = 0.07
//
// 노출 적은 사용자(평가 카운트 < 3) 는 점수에 +5 점, 매칭 결과 분포 다양성 확보.
// 프리미엄 부스트(US9)는 별도 가중치로 추후 추가.

export const WEIGHTS = {
  role: 0.25,
  overlap: 0.20,
  ai: 0.15,
  rating: 0.13,
  style: 0.12,
  diversity: 0.08,
  trust: 0.07,
} as const;

export interface WeightInputs {
  ratingStars: number;         // 0~5
  evaluationCount: number;     // 평가 받은 횟수
  trustScore: number;          // 0~100
  diversityHint: number;       // 팀과의 다양성 점수(이미 0~100로 산출됨)
  aiActivityScore: number;     // ai_scores.total 평균 (0~5)
}

export interface WeightBreakdown {
  rating: number;
  trust: number;
  diversity: number;
  ai: number;
  exposureBoost: number;
}

export function scoreWeights(inputs: WeightInputs): WeightBreakdown {
  // rating: 0~5 → 0~100
  const rating = (inputs.ratingStars / 5) * 100;
  // trust: already 0~100
  const trust = Math.max(0, Math.min(100, inputs.trustScore));
  // diversity: 0~100 (호출자가 산출)
  const diversity = Math.max(0, Math.min(100, inputs.diversityHint));
  // ai 활동점수: 0~5 → 0~100. 협업 이력이 없으면(0) 중립값 60으로 보정해 신규 사용자 불이익 방지.
  const ai = inputs.aiActivityScore > 0 ? (inputs.aiActivityScore / 5) * 100 : 60;
  // 노출 적은 사용자 보정 (FR-F3)
  const exposureBoost = inputs.evaluationCount < 3 ? 5 : 0;

  return { rating, trust, diversity, ai, exposureBoost };
}

// 결합: 가중합. exposureBoost 는 최종 점수에 가산.
export function combine(parts: {
  role: number;
  overlap: number;
  style: number;
  rating: number;
  trust: number;
  diversity: number;
  ai: number;
  exposureBoost: number;
}): number {
  const weighted =
    parts.role * WEIGHTS.role +
    parts.overlap * WEIGHTS.overlap +
    parts.ai * WEIGHTS.ai +
    parts.rating * WEIGHTS.rating +
    parts.style * WEIGHTS.style +
    parts.diversity * WEIGHTS.diversity +
    parts.trust * WEIGHTS.trust;
  const total = Math.max(0, Math.min(100, weighted + parts.exposureBoost));
  return Math.round(total * 100) / 100;
}

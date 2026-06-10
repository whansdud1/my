// US8 — 허위/보복성 별점(통계적 이상치) 탐지 단위 테스트.
import { describe, it, expect } from '@jest/globals';
import { detectRatingAnomaly } from '../../src/services/moderation/ratingAnomaly.js';

describe('detectRatingAnomaly', () => {
  it('합의가 높은데 혼자 극단적으로 낮으면 이상치', () => {
    const r = detectRatingAnomaly(0.5, { avg: 4.5, count: 4 });
    expect(r.anomalous).toBe(true);
    expect(r.severity).toBe('high');
  });

  it('합의 대비 편차가 작으면 정상', () => {
    const r = detectRatingAnomaly(4.0, { avg: 4.5, count: 4 });
    expect(r.anomalous).toBe(false);
  });

  it('다른 평가자(합의 인원)가 부족하면 판단 보류', () => {
    const r = detectRatingAnomaly(0.5, { avg: 5.0, count: 1 });
    expect(r.anomalous).toBe(false);
    expect(r.reason).toContain('합의 인원');
  });

  it('낮은 별점이라도 합의 자체가 낮으면 이상치 아님', () => {
    const r = detectRatingAnomaly(1.0, { avg: 1.5, count: 3 });
    expect(r.anomalous).toBe(false);
  });

  it('편차 2.5~3.5 는 medium', () => {
    const r = detectRatingAnomaly(1.5, { avg: 4.5, count: 3 }); // delta 3.0
    expect(r.anomalous).toBe(true);
    expect(r.severity).toBe('medium');
  });
});

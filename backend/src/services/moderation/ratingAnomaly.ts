import { config } from '../../config.js';

// 허위/보복성 별점 탐지(통계적 이상치).
// 한 피평가자에 대해 '다른 평가자들의 별점 평균(합의)' 대비 이번 별점이 크게 낮으면 의심한다.
// 예: 다른 4명이 평균 4.5 를 줬는데 한 명이 0.5 를 주면 보복성/허위 가능성.
// (낮은 별점이 정당할 수 있으므로 차단하지 않고 '검토 큐'로만 올린다.)

export interface AnomalyResult {
  anomalous: boolean;
  severity: 'low' | 'medium' | 'high';
  score: number; // 합의 대비 하향 편차(0~4.5)
  peerCount: number;
  peerAvg: number | null;
  reason: string;
}

export interface PeerStat {
  avg: number | null; // 이 평가자를 제외한 다른 평가자들의 평균
  count: number; // 다른 평가자 수
}

export function detectRatingAnomaly(stars: number, peers: PeerStat): AnomalyResult {
  const { anomalyDeltaThreshold, anomalyMinPeers } = config.moderation;
  const peerAvg = peers.avg;

  if (peers.count < anomalyMinPeers || peerAvg === null) {
    return {
      anomalous: false,
      severity: 'low',
      score: 0,
      peerCount: peers.count,
      peerAvg,
      reason: '합의 인원 부족',
    };
  }

  const delta = peerAvg - stars; // 합의보다 얼마나 낮게 줬나
  if (delta < anomalyDeltaThreshold) {
    return {
      anomalous: false,
      severity: 'low',
      score: Math.max(0, delta),
      peerCount: peers.count,
      peerAvg,
      reason: '정상 범위',
    };
  }

  // 편차가 클수록 심각도 상향
  const severity: AnomalyResult['severity'] = delta >= 3.5 ? 'high' : delta >= 2.5 ? 'medium' : 'low';
  return {
    anomalous: true,
    severity,
    score: delta,
    peerCount: peers.count,
    peerAvg,
    reason: `다른 평가자 평균 ${peerAvg.toFixed(2)} 대비 ${delta.toFixed(2)}점 낮음(보복성/허위 의심)`,
  };
}

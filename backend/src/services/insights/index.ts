import { assessProject, type RiskFactorKey } from '../collabRisk/index.js';
import * as Tasks from '../../repositories/tasks.js';

// 프리미엄 — AI 협업 분석 인사이트.
// 무료 대시보드(현황 수치)는 그대로 두고, 그 위에 '무엇을 해야 하는지'를 제안하는
// 실행 가능한 추천을 프리미엄 전용으로 제공한다.
// 위험 평가(collabRisk) + 업무 통계를 근거로 규칙 기반 추천을 생성한다(외부 API 불필요).

export type InsightSeverity = 'positive' | 'info' | 'warn' | 'critical';

export interface Insight {
  severity: InsightSeverity;
  title: string;
  detail: string; // 현황 근거
  action: string; // 권장 조치
}

export interface InsightReport {
  headline: string;
  riskLevel: string;
  riskScore: number;
  insights: Insight[];
  generatedAt: string;
}

// 위험 요인 → 권장 조치 매핑
const ACTION_BY_FACTOR: Record<RiskFactorKey, { title: string; action: string }> = {
  OVERDUE: {
    title: '마감 관리 필요',
    action: '지난 마감 업무를 팀원과 함께 점검하고, 우선순위를 재조정하거나 마감일을 현실적으로 다시 합의하세요.',
  },
  IMBALANCE: {
    title: '업무 분배 재조정',
    action: '업무가 없는 팀원에게 역할을 명확히 배정해 부담을 고르게 나누세요.',
  },
  TOXIC: {
    title: '커뮤니케이션 톤 점검',
    action: '감정적 표현이 오갔다면 팀 규칙을 환기하고, 필요 시 1:1로 갈등을 조기에 중재하세요.',
  },
  INACTIVITY: {
    title: '참여 독려 필요',
    action: '오랫동안 조용한 팀원에게 개별적으로 진행 상황을 묻고 참여를 유도하세요.',
  },
};

export async function generateInsights(projectId: number, windowDays = 14): Promise<InsightReport> {
  const risk = await assessProject(projectId, windowDays);
  const stats = await Tasks.statsByProject(projectId);

  const insights: Insight[] = [];

  // 1) 위험 요인 → 추천
  for (const f of risk.factors) {
    const m = ACTION_BY_FACTOR[f.key];
    insights.push({
      severity: f.weight >= 35 ? 'critical' : f.weight >= 20 ? 'warn' : 'info',
      title: m.title,
      detail: f.detail,
      action: m.action,
    });
  }

  // 2) 업무 진행 인사이트(위험과 별개 관점)
  if (stats.total > 0) {
    const doneRate = Math.round((stats.done / stats.total) * 100);
    if (stats.total >= 3 && doneRate < 30 && stats.overdue === 0) {
      insights.push({
        severity: 'info',
        title: '진행 속도 점검',
        detail: `전체 업무 ${stats.total}건 중 완료 ${stats.done}건(${doneRate}%).`,
        action: '초반 진행이 더디면 작은 단위로 업무를 쪼개 빠른 완료 경험을 만들어 보세요.',
      });
    } else if (doneRate >= 70) {
      insights.push({
        severity: 'positive',
        title: '순조로운 진행',
        detail: `업무 완료율 ${doneRate}% — 일정을 잘 지키고 있습니다.`,
        action: '현재 페이스를 유지하고, 남은 업무의 마감만 함께 확인하세요.',
      });
    }
  } else {
    insights.push({
      severity: 'info',
      title: '업무 계획 수립',
      detail: '아직 등록된 업무가 없습니다.',
      action: '역할별로 업무를 만들어 배정하면 진행 상황을 추적하고 분석할 수 있습니다.',
    });
  }

  // 3) 위험이 없고 별다른 이슈도 없으면 긍정 신호
  if (!insights.some((i) => i.severity === 'warn' || i.severity === 'critical') && risk.level === 'none') {
    if (!insights.some((i) => i.severity === 'positive')) {
      insights.unshift({
        severity: 'positive',
        title: '팀 협업 안정적',
        detail: '갈등·지연 신호가 감지되지 않았습니다.',
        action: '좋은 흐름입니다. 정기 회의로 진행 상황만 꾸준히 공유하세요.',
      });
    }
  }

  const critical = insights.filter((i) => i.severity === 'critical').length;
  const warn = insights.filter((i) => i.severity === 'warn').length;
  const headline =
    critical > 0
      ? `즉시 살펴봐야 할 항목이 ${critical}건 있습니다.`
      : warn > 0
        ? `주의가 필요한 항목이 ${warn}건 있습니다.`
        : '팀이 안정적으로 협업하고 있습니다.';

  return {
    headline,
    riskLevel: risk.level,
    riskScore: risk.score,
    insights,
    generatedAt: new Date().toISOString(),
  };
}

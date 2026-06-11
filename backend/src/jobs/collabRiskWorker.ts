import { getPool } from '../db/connection.js';
import { logger } from '../lib/logger.js';
import { assessProject, RISK_RANK } from '../services/collabRisk/index.js';
import * as RiskState from '../repositories/collabRisk.js';
import { notify } from '../services/notification/index.js';

// 팀 갈등(협업) 위험 예측 워커.
// 진행 중(RUNNING) 프로젝트를 주기적으로 평가하고, 위험도가 medium 이상으로
// '상승'할 때만 팀장(COLLAB_RISK = TEAM_LEAD)에게 알림을 보낸다.
// 직전 알림 레벨(collab_risk_alerts)과 비교하므로 위험이 지속되어도 매 주기 재알림하지 않는다.

const INTERVAL_MS = Number.parseInt(process.env.COLLAB_RISK_INTERVAL_MS ?? '300000', 10); // 기본 5분

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runningProjects(): Promise<Array<{ id: number; title: string }>> {
  const [rows] = (await getPool().query(
    `SELECT id, title FROM projects WHERE status = 'RUNNING'`,
  )) as unknown as [Array<{ id: number; title: string }>];
  return rows.map((r) => ({ id: Number(r.id), title: r.title }));
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const projects = await runningProjects();
    let notified = 0;
    for (const p of projects) {
      try {
        const assessment = await assessProject(p.id);
        const prior = await RiskState.getState(p.id);
        const priorRank = prior ? RISK_RANK[prior.last_level] : 0;
        const curRank = RISK_RANK[assessment.level];

        // medium 이상 + 직전보다 상승했을 때만 알림(최초 감지·악화 시).
        const shouldNotify = curRank >= RISK_RANK.medium && curRank > priorRank;

        await RiskState.saveState(
          p.id,
          assessment.level,
          assessment.score,
          assessment.factors,
          shouldNotify,
        );

        if (shouldNotify) {
          notify('COLLAB_RISK', {
            projectId: p.id,
            title: `⚠️ 팀 협업 위험 신호: ${p.title}`,
            body: `${assessment.summary} 팀 대시보드에서 자세히 확인하세요.`,
            deepLink: `/projects/${p.id}/dashboard`,
            targetRef: `collab-risk:${p.id}`,
          });
          notified++;
        }
      } catch (e) {
        logger.error({ err: e, projectId: p.id }, 'collabRiskWorker: 프로젝트 평가 실패');
      }
    }
    if (notified) logger.info({ notified, scanned: projects.length }, 'collabRisk 위험 알림 전송');
  } catch (e) {
    logger.error({ err: e }, 'collabRiskWorker tick 실패');
  } finally {
    running = false;
  }
}

export function startCollabRiskWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), INTERVAL_MS);
  logger.info({ intervalMs: INTERVAL_MS }, 'collabRiskWorker 시작');
}

export function stopCollabRiskWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

// T071 — AI 평점 계산기 (활동 지표 정규화 → 가중합 0~5)
//
// 입력: collaboration_activities 의 사용자 × 프로젝트 집계
//   - meeting_rate: 회의 참석 비율
//   - upload_rate: 업로드 빈도(평균 대비)
//   - deadline_rate: 마감 준수 비율
//   - response_score: 메시지 응답 빈도(상대)
//   - completion_score: 작업 완료 비율
//
// 가중치(임시): meeting 0.2, upload 0.2, deadline 0.3, response 0.15, completion 0.15

import { getPool } from '../../db/connection.js';

const W = { meeting: 0.2, upload: 0.2, deadline: 0.3, response: 0.15, completion: 0.15 };

export async function computeAIForProject(projectId: number): Promise<void> {
  const pool = getPool();
  // 멤버 집합
  const [members] = (await pool.query(
    `SELECT user_id FROM project_members WHERE project_id = ? AND state = 'ACCEPTED'`,
    [projectId],
  )) as unknown as [Array<{ user_id: number }>];
  if (members.length === 0) return;

  // 프로젝트 전체 집계로 정규화 기준 산출
  const [totalsRows] = (await pool.query(
    `SELECT
        SUM(activity_type = 'MEETING_JOIN') AS meet_total,
        SUM(activity_type = 'UPLOAD') AS upload_total,
        SUM(activity_type = 'DEADLINE_MET') AS dl_met_total,
        SUM(activity_type = 'DEADLINE_MISS') AS dl_miss_total,
        SUM(activity_type = 'MESSAGE_RESP') AS resp_total
       FROM collaboration_activities WHERE project_id = ?`,
    [projectId],
  )) as unknown as [Array<{ meet_total: number | null; upload_total: number | null; dl_met_total: number | null; dl_miss_total: number | null; resp_total: number | null }>];
  // 집계는 항상 1행이지만(매칭 없으면 NULL) 타입상 optional → 폴백으로 좁힌다.
  const totals = totalsRows[0] ?? {
    meet_total: 0,
    upload_total: 0,
    dl_met_total: 0,
    dl_miss_total: 0,
    resp_total: 0,
  };

  const memberCount = members.length;

  for (const m of members) {
    const [sRows] = (await pool.query(
      `SELECT
          SUM(activity_type = 'MEETING_JOIN') AS meet,
          SUM(activity_type = 'UPLOAD') AS uploads,
          SUM(activity_type = 'DEADLINE_MET') AS dl_met,
          SUM(activity_type = 'DEADLINE_MISS') AS dl_miss,
          SUM(activity_type = 'MESSAGE_RESP') AS resp
         FROM collaboration_activities WHERE project_id = ? AND user_id = ?`,
      [projectId, m.user_id],
    )) as unknown as [Array<{ meet: number | null; uploads: number | null; dl_met: number | null; dl_miss: number | null; resp: number | null }>];
    const s = sRows[0] ?? { meet: 0, uploads: 0, dl_met: 0, dl_miss: 0, resp: 0 };

    // 정규화: 프로젝트 평균 대비 비율 → 0~1
    const meetingRate = ratio(s.meet, (totals.meet_total ?? 0) / memberCount);
    const uploadRate = ratio(s.uploads, (totals.upload_total ?? 0) / memberCount);
    const responseScore = ratio(s.resp, (totals.resp_total ?? 0) / memberCount);
    const dlMet = Number(s.dl_met ?? 0);
    const dlMiss = Number(s.dl_miss ?? 0);
    const deadlineRate = dlMet + dlMiss > 0 ? dlMet / (dlMet + dlMiss) : 1;
    const completionScore = clamp01((Number(s.uploads ?? 0) + dlMet) / 10);

    const score01 =
      W.meeting * clamp01(meetingRate) +
      W.upload * clamp01(uploadRate) +
      W.deadline * clamp01(deadlineRate) +
      W.response * clamp01(responseScore) +
      W.completion * clamp01(completionScore);

    const total5 = Math.round(score01 * 5 * 100) / 100;

    await pool.query(
      `INSERT INTO ai_scores
          (user_id, project_id, meeting_rate, upload_rate, deadline_rate, response_score, completion_score, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
          meeting_rate = VALUES(meeting_rate),
          upload_rate = VALUES(upload_rate),
          deadline_rate = VALUES(deadline_rate),
          response_score = VALUES(response_score),
          completion_score = VALUES(completion_score),
          total = VALUES(total),
          calculated_at = NOW(3)`,
      [
        m.user_id,
        projectId,
        round2(meetingRate * 100),
        round2(uploadRate * 100),
        round2(deadlineRate * 100),
        round2(responseScore * 100),
        round2(completionScore * 100),
        total5,
      ],
    );
  }
}

function ratio(n: number | null | undefined, denom: number): number {
  if (!denom || denom === 0) return 0.5;
  return Math.min(2, Number(n ?? 0) / denom) / 2;     // 평균 대비 0~2배 → 0~1
}
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

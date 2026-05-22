// T057 — 역할 균형 점수 (w1=0.30)
//
// 후보의 preferredRoles 가 프로젝트의 requiredRoles 와 겹치는 정도.
// 부족한 역할(아직 채워지지 않은 슬롯)에 매칭될 수 있으면 가산점.

export interface RoleScoreInput {
  candidatePreferredRoles: string[];
  requiredRoles: Array<{ role: string; count: number }>;
  filledRolesByCount: Record<string, number>;
}

export function scoreRole(input: RoleScoreInput): number {
  if (!input.requiredRoles || input.requiredRoles.length === 0) return 50; // neutral
  let score = 0;
  let weights = 0;
  for (const r of input.requiredRoles) {
    const filled = input.filledRolesByCount[r.role] ?? 0;
    const need = Math.max(r.count - filled, 0);
    const weight = need > 0 ? 2 : 0.5; // 부족 역할에 무게
    weights += weight;
    if (input.candidatePreferredRoles.includes(r.role)) {
      score += weight * 100;
    }
  }
  if (weights === 0) return 50;
  return Math.round((score / weights) * 100) / 100;
}

import { scanLexicon, type LexiconHit, type ToxicSeverity } from './lexicon.js';
import { analyzeWithLlm } from './llmModeration.js';

// 텍스트 악성 판정 — 하이브리드.
//   1) 규칙기반 사전(scanLexicon): 명백한 욕설=severe → 즉시 'block'.
//   2) 규칙기반이 깨끗/경미하면 LLM 2차 판정(활성 시)으로 문맥적 악성을 보강.
// verdict:
//   'block'  → 제출 거부(명백한 악성)
//   'review' → 저장하되 비노출 + 관리자 검토 큐
//   'clean'  → 정상 노출

export type TextVerdict = 'clean' | 'review' | 'block';

export interface TextModerationResult {
  verdict: TextVerdict;
  severity: ToxicSeverity;
  score: number; // 0~1
  categories: string[];
  reasons: string[];
  source: 'rule' | 'llm' | 'rule+llm';
}

const SEVERITY_SCORE: Record<ToxicSeverity, number> = { none: 0, mild: 0.5, severe: 1 };

function summarizeHits(hits: LexiconHit[]): { severity: ToxicSeverity; categories: string[] } {
  let severity: ToxicSeverity = 'none';
  const categories = new Set<string>();
  for (const h of hits) {
    categories.add(h.category);
    if (h.severity === 'severe') severity = 'severe';
    else if (h.severity === 'mild' && severity === 'none') severity = 'mild';
  }
  return { severity, categories: [...categories] };
}

export async function analyzeText(rawComment: string | null | undefined): Promise<TextModerationResult> {
  const text = (rawComment ?? '').trim();
  if (!text) {
    return { verdict: 'clean', severity: 'none', score: 0, categories: [], reasons: [], source: 'rule' };
  }

  // 1) 규칙기반
  const hits = scanLexicon(text);
  const rule = summarizeHits(hits);
  const reasons: string[] = [];
  if (hits.length) reasons.push(`사전 적중: ${hits.map((h) => h.term).join(', ')}`);

  // 명백한 욕설은 즉시 차단(비용 큰 LLM 호출 생략)
  if (rule.severity === 'severe') {
    return {
      verdict: 'block',
      severity: 'severe',
      score: 1,
      categories: rule.categories,
      reasons,
      source: 'rule',
    };
  }

  // 2) LLM 2차 판정(활성 시) — 규칙기반이 clean/mild 일 때 문맥 악성 보강
  const llm = await analyzeWithLlm(text);
  if (llm) {
    const merged = new Set<string>([...rule.categories, ...llm.categories]);
    if (llm.toxic && llm.severity === 'severe') {
      reasons.push(`LLM: ${llm.reason}`);
      return {
        verdict: 'block',
        severity: 'severe',
        score: 1,
        categories: [...merged],
        reasons,
        source: hits.length ? 'rule+llm' : 'llm',
      };
    }
    if (llm.toxic && llm.severity === 'mild') {
      reasons.push(`LLM: ${llm.reason}`);
      return {
        verdict: 'review',
        severity: 'mild',
        score: Math.max(SEVERITY_SCORE.mild, SEVERITY_SCORE[rule.severity]),
        categories: [...merged],
        reasons,
        source: hits.length ? 'rule+llm' : 'llm',
      };
    }
  }

  // 규칙기반 경미 → 검토 큐
  if (rule.severity === 'mild') {
    return {
      verdict: 'review',
      severity: 'mild',
      score: SEVERITY_SCORE.mild,
      categories: rule.categories,
      reasons,
      source: 'rule',
    };
  }

  return { verdict: 'clean', severity: 'none', score: 0, categories: [], reasons: [], source: llm ? 'rule+llm' : 'rule' };
}

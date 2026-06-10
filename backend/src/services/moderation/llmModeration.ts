import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import type { ToxicSeverity } from './lexicon.js';

// LLM 2차 판정(하이브리드의 두 번째 단계).
// 규칙기반 사전이 놓치는 문맥적 인격모독·수동공격적 표현을 Claude 로 잡는다.
//
// 비활성(기본): MODERATION_LLM_ENABLED=false 이거나 ANTHROPIC_API_KEY 가 없으면 호출하지 않고
// null 을 돌려준다 → 호출부는 규칙기반 결과만으로 동작한다(외부 의존성 0).
// 활성화하려면 .env 에 MODERATION_LLM_ENABLED=true 와 ANTHROPIC_API_KEY 를 설정한다.

export interface LlmVerdict {
  toxic: boolean;
  severity: ToxicSeverity;
  categories: string[];
  reason: string;
}

const SYSTEM_PROMPT = `너는 대학생 팀 프로젝트 동료평가의 한국어 리뷰를 검수하는 모더레이터다.
다음을 악성으로 판정한다: 욕설, 인격모독, 비하·차별, 위협, 성적 표현, 노골적 조롱.
건설적 비판(예: "기여도가 낮았다", "응답이 느렸다")은 악성이 아니다.
주어진 리뷰 한 건을 평가해 JSON 으로만 답하라.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    toxic: { type: 'boolean' },
    severity: { type: 'string', enum: ['none', 'mild', 'severe'] },
    categories: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['toxic', 'severity', 'categories', 'reason'],
} as const;

export function llmAvailable(): boolean {
  return config.moderation.llmEnabled && config.moderation.hasApiKey;
}

// SDK 가 설치되어 있지 않거나 키가 없으면 null. 실패도 조용히 null(규칙기반으로 폴백).
export async function analyzeWithLlm(text: string): Promise<LlmVerdict | null> {
  if (!llmAvailable()) return null;
  try {
    // 선택적 의존성 — 미설치 시 import 가 throw → catch 에서 null.
    const mod = await import('@anthropic-ai/sdk');
    const Anthropic = mod.default;
    const client = new Anthropic();

    const res = await client.messages.create({
      model: config.moderation.llmModel,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `리뷰: """${text}"""` }],
    } as never);

    const block = (res as { content?: Array<{ type: string; text?: string }> }).content?.find(
      (b) => b.type === 'text',
    );
    if (!block?.text) return null;
    const parsed = JSON.parse(block.text) as LlmVerdict;
    return parsed;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'LLM 모더레이션 호출 실패 — 규칙기반으로 폴백');
    return null;
  }
}

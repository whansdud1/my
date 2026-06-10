// US8 — 텍스트 악성 판정(하이브리드) 단위 테스트.
// 기본 설정에서 LLM 은 비활성(키 없음)이라 규칙기반만으로 결정론적으로 동작한다.
import { describe, it, expect } from '@jest/globals';
import { analyzeText } from '../../src/services/moderation/textModeration.js';

describe('analyzeText', () => {
  it('명백한 욕설은 block', async () => {
    const r = await analyzeText('시발 진짜 최악이었다');
    expect(r.verdict).toBe('block');
    expect(r.severity).toBe('severe');
  });

  it('인격모독(쓰레기 등)은 block', async () => {
    const r = await analyzeText('진짜 인간쓰레기 같은 팀원');
    expect(r.verdict).toBe('block');
  });

  it('경미한 모욕은 review(검토 큐)', async () => {
    const r = await analyzeText('좀 멍청이 같았음');
    expect(r.verdict).toBe('review');
    expect(r.severity).toBe('mild');
  });

  it('건설적 비판은 clean', async () => {
    const r = await analyzeText('기여도가 낮았고 회의에 자주 빠졌습니다');
    expect(r.verdict).toBe('clean');
  });

  it('빈 코멘트는 clean', async () => {
    expect((await analyzeText('')).verdict).toBe('clean');
    expect((await analyzeText(null)).verdict).toBe('clean');
  });

  it('우회 표기(공백 삽입)도 block', async () => {
    const r = await analyzeText('시 발 같은 사람');
    expect(r.verdict).toBe('block');
  });
});

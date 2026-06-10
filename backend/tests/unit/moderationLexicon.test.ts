// US8 — 규칙기반 악성 탐지 사전 단위 테스트.
import { describe, it, expect } from '@jest/globals';
import { normalizeForLexicon, scanLexicon } from '../../src/services/moderation/lexicon.js';

describe('normalizeForLexicon', () => {
  it('공백·특수문자로 끊은 우회를 정규화한다', () => {
    expect(normalizeForLexicon('시 발')).toBe('시발');
    expect(normalizeForLexicon('시*발!')).toBe('시발');
    expect(normalizeForLexicon('병 신')).toBe('병신');
  });

  it('반복문자를 축약한다', () => {
    expect(normalizeForLexicon('개새끼끼끼')).toContain('개새끼');
  });

  it('정상 문장은 글자만 남긴다', () => {
    expect(normalizeForLexicon('기여도가 낮았습니다.')).toBe('기여도가낮았습니다');
  });
});

describe('scanLexicon', () => {
  it('명백한 욕설을 severe 로 적중한다', () => {
    const hits = scanLexicon('이 사람 진짜 시발 별로였음');
    expect(hits.some((h) => h.severity === 'severe')).toBe(true);
  });

  it('우회 표기(공백·특수문자)도 적중한다', () => {
    const hits = scanLexicon('병 신 같은 태도');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.term === '병신')).toBe(true);
  });

  it('경미한 모욕은 mild 로 적중한다', () => {
    const hits = scanLexicon('좀 멍청이 같았다');
    expect(hits.some((h) => h.severity === 'mild')).toBe(true);
  });

  it('건설적 비판은 적중하지 않는다', () => {
    expect(scanLexicon('기여도가 낮고 응답이 느렸습니다')).toHaveLength(0);
    expect(scanLexicon('정말 성실하고 책임감 있었어요')).toHaveLength(0);
  });
});
